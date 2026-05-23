use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use std::thread;

use anyhow::Context;
use include_dir::Dir;

#[cfg(feature = "bundle-frontend")]
use include_dir::include_dir;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use tokio::runtime::Runtime;

use crate::commands::{
    add_account_from_auth_json_text, add_account_from_file, cancel_login, check_codex_processes,
    complete_login, delete_account, export_accounts_full_encrypted_bytes,
    export_accounts_slim_text, get_active_account_info, get_masked_account_ids, get_usage,
    import_accounts_full_encrypted_bytes, import_accounts_slim_text, list_accounts,
    refresh_all_accounts_usage, rename_account, set_masked_account_ids, start_login,
    switch_account, warmup_account, warmup_all_accounts,
};

#[cfg(feature = "bundle-frontend")]
static DIST_DIR: Option<Dir<'_>> = Some(include_dir!("$CARGO_MANIFEST_DIR/../dist"));

#[cfg(not(feature = "bundle-frontend"))]
static DIST_DIR: Option<Dir<'_>> = None;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountIdArgs {
    #[serde(alias = "account_id")]
    account_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameAccountArgs {
    #[serde(alias = "account_id")]
    account_id: String,
    #[serde(alias = "new_name")]
    new_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginArgs {
    #[serde(alias = "account_name")]
    account_name: String,
}

#[derive(Debug, Deserialize)]
struct ImportSlimArgs {
    payload: String,
}

#[derive(Debug, Deserialize)]
struct MaskedIdsArgs {
    ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct UploadAuthJsonArgs {
    name: String,
    contents: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadEncryptedArgs {
    #[serde(alias = "contents_base64")]
    contents_base64: String,
}

#[derive(Debug, Deserialize)]
struct FileImportArgs {
    path: String,
    name: String,
}

pub fn run_lan_server(host: &str, port: u16) -> anyhow::Result<()> {
    let bound_port = spawn_lan_server(host, port)?;

    let address = format!("{host}:{bound_port}");
    println!("Codex Switcher web server listening on http://{address}");
    println!("Serving embedded frontend assets from the packaged EXE");
    wait_for_server_ready(host, bound_port, Duration::from_secs(5))?;
    open_browser_for_server(host, bound_port);

    loop {
        thread::park();
    }
}

pub fn spawn_lan_server(host: &str, port: u16) -> anyhow::Result<u16> {
    let (server, bound_port) = bind_server_with_fallback(host, port)?;
    let runtime = Runtime::new().context("Failed to start async runtime")?;

    thread::spawn(move || {
        for request in server.incoming_requests() {
            if let Err(error) = handle_request(request, &runtime) {
                eprintln!("[web] request failed: {error:#}");
            }
        }
    });

    Ok(bound_port)
}

pub fn wait_for_server_ready(host: &str, port: u16, timeout: Duration) -> anyhow::Result<()> {
    let address = format!("{host}:{port}");
    let start = std::time::Instant::now();

    loop {
        if can_connect(&address) {
            return Ok(());
        }

        if start.elapsed() >= timeout {
            anyhow::bail!("Timed out waiting for local server at http://{address}");
        }

        thread::sleep(Duration::from_millis(100));
    }
}

fn can_connect(address: &str) -> bool {
    address
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| addrs.next())
        .is_some_and(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok())
}

pub fn browser_host_for_server(host: &str) -> &str {
    match host {
        "0.0.0.0" | "::" | "[::]" | "127.0.0.1" | "localhost" => "localhost",
        other => other,
    }
}

fn bind_server_with_fallback(host: &str, starting_port: u16) -> anyhow::Result<(Server, u16)> {
    let mut last_error: Option<anyhow::Error> = None;

    for port in starting_port..=starting_port.saturating_add(32) {
        let address = format!("{host}:{port}");
        match Server::http(&address) {
            Ok(server) => {
                if port != starting_port {
                    eprintln!(
                        "[web] port {starting_port} was busy, using fallback port {port} instead"
                    );
                }
                return Ok((server, port));
            }
            Err(error) => {
                last_error = Some(anyhow::anyhow!(
                    "Failed to bind HTTP server on {address}: {error}"
                ));
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        anyhow::anyhow!(
            "Failed to bind HTTP server on {host}:{starting_port} and fallback ports"
        )
    }))
}

fn open_browser_for_server(host: &str, port: u16) {
    if matches!(
        std::env::var("CODEX_SWITCHER_WEB_OPEN_BROWSER")
            .ok()
            .as_deref(),
        Some("0") | Some("false") | Some("FALSE")
    ) {
        return;
    }

    let url = format!("http://{}:{port}", browser_host_for_server(host));

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        if let Err(error) = webbrowser::open(&url) {
            eprintln!("[web] failed to open browser at {url}: {error}");
        }
    });
}

fn handle_request(mut request: Request, runtime: &Runtime) -> anyhow::Result<()> {
    let method = request.method().clone();
    let url = request.url().to_string();

    if method == Method::Get && url == "/api/health" {
        respond_json(request, StatusCode(200), &json!({ "ok": true }))?;
        return Ok(());
    }

    if method == Method::Post && url.starts_with("/api/invoke/") {
        let command = url.trim_start_matches("/api/invoke/");
        let payload = parse_request_json(&mut request)?;
        let result = runtime.block_on(invoke_web_command(command, payload));
        match result {
            Ok(value) => respond_json(request, StatusCode(200), &value)?,
            Err(error) => respond_json(request, StatusCode(400), &json!({ "error": error }))?,
        }
        return Ok(());
    }

    if method == Method::Get {
        serve_static(request, &url)?;
        return Ok(());
    }

    respond_text(
        request,
        StatusCode(405),
        "Method Not Allowed",
        "text/plain; charset=utf-8",
    )?;
    Ok(())
}

async fn invoke_web_command(command: &str, payload: Value) -> Result<Value, String> {
    match command {
        "list_accounts" => to_json(list_accounts().await?),
        "get_active_account_info" => to_json(get_active_account_info().await?),
        "add_account_from_file" => {
            let args: FileImportArgs = parse_args(payload)?;
            to_json(add_account_from_file(args.path, args.name).await?)
        }
        "add_account_from_auth_json_text" => {
            let args: UploadAuthJsonArgs = parse_args(payload)?;
            to_json(add_account_from_auth_json_text(args.name, args.contents).await?)
        }
        "get_usage" => {
            let args: AccountIdArgs = parse_args(payload)?;
            to_json(get_usage(args.account_id).await?)
        }
        "refresh_all_accounts_usage" => to_json(refresh_all_accounts_usage().await?),
        "warmup_account" => {
            let args: AccountIdArgs = parse_args(payload)?;
            to_json(warmup_account(args.account_id).await?)
        }
        "warmup_all_accounts" => to_json(warmup_all_accounts().await?),
        "switch_account" => {
            let args: AccountIdArgs = parse_args(payload)?;
            to_json(switch_account(args.account_id).await?)
        }
        "delete_account" => {
            let args: AccountIdArgs = parse_args(payload)?;
            to_json(delete_account(args.account_id).await?)
        }
        "rename_account" => {
            let args: RenameAccountArgs = parse_args(payload)?;
            to_json(rename_account(args.account_id, args.new_name).await?)
        }
        "start_login" => {
            let args: LoginArgs = parse_args(payload)?;
            to_json(start_login(args.account_name).await?)
        }
        "complete_login" => to_json(complete_login().await?),
        "cancel_login" => to_json(cancel_login().await?),
        "export_accounts_slim_text" => to_json(export_accounts_slim_text().await?),
        "import_accounts_slim_text" => {
            let args: ImportSlimArgs = parse_args(payload)?;
            to_json(import_accounts_slim_text(args.payload).await?)
        }
        "export_accounts_full_encrypted_bytes" => {
            to_json(export_accounts_full_encrypted_bytes().await?)
        }
        "import_accounts_full_encrypted_bytes" => {
            let args: UploadEncryptedArgs = parse_args(payload)?;
            to_json(import_accounts_full_encrypted_bytes(args.contents_base64).await?)
        }
        "get_masked_account_ids" => to_json(get_masked_account_ids().await?),
        "set_masked_account_ids" => {
            let args: MaskedIdsArgs = parse_args(payload)?;
            to_json(set_masked_account_ids(args.ids).await?)
        }
        "check_codex_processes" => to_json(check_codex_processes().await?),
        _ => Err(format!("Unsupported web command: {command}")),
    }
}

fn parse_request_json(request: &mut Request) -> anyhow::Result<Value> {
    let mut body = String::new();
    request
        .as_reader()
        .read_to_string(&mut body)
        .context("Failed to read request body")?;

    if body.trim().is_empty() {
        return Ok(json!({}));
    }

    serde_json::from_str(&body).context("Failed to parse request JSON")
}

fn parse_args<T>(value: Value) -> Result<T, String>
where
    T: DeserializeOwned,
{
    serde_json::from_value(value).map_err(|error| format!("Invalid command payload: {error}"))
}

fn to_json<T>(value: T) -> Result<Value, String>
where
    T: serde::Serialize,
{
    serde_json::to_value(value).map_err(|error| format!("Failed to serialize response: {error}"))
}

fn serve_static(request: Request, url: &str) -> anyhow::Result<()> {
    let Some(dist_dir) = DIST_DIR.as_ref() else {
        respond_text(
            request,
            StatusCode(503),
            "Frontend not built",
            "text/plain; charset=utf-8",
        )?;
        return Ok(());
    };

    let requested = if url == "/" {
        PathBuf::from("index.html")
    } else {
        sanitize_path(url)?
    };

    if let Some(file) = dist_dir.get_file(&requested) {
        return serve_embedded_file(request, file);
    }

    if requested.extension().is_some() {
        respond_text(
            request,
            StatusCode(404),
            "Not Found",
            "text/plain; charset=utf-8",
        )?;
        return Ok(());
    }

    let index_file = dist_dir
        .get_file("index.html")
        .ok_or_else(|| anyhow::anyhow!("Embedded frontend is missing index.html"))?;
    serve_embedded_file(request, index_file)
}

fn sanitize_path(url: &str) -> anyhow::Result<PathBuf> {
    let path = url.split('?').next().unwrap_or("/");
    let raw = path.trim_start_matches('/');
    let candidate = Path::new(raw);

    for component in candidate.components() {
        match component {
            Component::Normal(_) => {}
            _ => anyhow::bail!("Invalid request path"),
        }
    }

    Ok(candidate.to_path_buf())
}

fn serve_embedded_file(request: Request, file: &include_dir::File<'_>) -> anyhow::Result<()> {
    let data = file.contents().to_vec();
    let mime = mime_type_for_path(file.path());
    let response = Response::from_data(data)
        .with_header(header("Content-Type", mime)?)
        .with_header(header("Cache-Control", "no-cache")?);
    request.respond(response)?;
    Ok(())
}

fn respond_json(request: Request, status: StatusCode, payload: &Value) -> anyhow::Result<()> {
    let response = Response::from_string(serde_json::to_string(payload)?)
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json; charset=utf-8")?);
    request.respond(response)?;
    Ok(())
}

fn respond_text(
    request: Request,
    status: StatusCode,
    body: &str,
    content_type: &str,
) -> anyhow::Result<()> {
    let response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(header("Content-Type", content_type)?);
    request.respond(response)?;
    Ok(())
}

fn header(name: &str, value: &str) -> anyhow::Result<Header> {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).map_err(|_| {
        anyhow::anyhow!("Failed to create header {name}: invalid header value `{value}`")
    })
}

fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "css" => "text/css; charset=utf-8",
        "html" => "text/html; charset=utf-8",
        "ico" => "image/x-icon",
        "jpeg" | "jpg" => "image/jpeg",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "txt" => "text/plain; charset=utf-8",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}
