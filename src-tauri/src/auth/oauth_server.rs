
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result};
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};
use tiny_http::{Header, Request, Response, Server};
use tokio::sync::oneshot;

use crate::types::{OAuthLoginInfo, StoredAccount};

const DEFAULT_ISSUER: &str = "https://auth.openai.com";
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEFAULT_PORT: u16 = 1455;

#[derive(Debug, Clone)]
pub struct PkceCodes {
    pub code_verifier: String,
    pub code_challenge: String,
}

pub fn generate_pkce() -> PkceCodes {
    let mut bytes = [0u8; 64];
    rand::rng().fill_bytes(&mut bytes);

    let code_verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let digest = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest);

    PkceCodes {
        code_verifier,
        code_challenge,
    }
}

fn generate_state() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn build_authorize_url(
    issuer: &str,
    client_id: &str,
    redirect_uri: &str,
    pkce: &PkceCodes,
    state: &str,
) -> String {
    let params = [
        ("response_type", "code"),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("scope", "openid profile email offline_access"),
        ("code_challenge", &pkce.code_challenge),
        ("code_challenge_method", "S256"),
        ("id_token_add_organizations", "true"),
        ("codex_cli_simplified_flow", "true"),
        ("state", state),
        ("originator", "codex_cli_rs"),
    ];

    let query_string = params
        .iter()
        .map(|(k, v)| format!("{k}={}", urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    format!("{issuer}/oauth/authorize?{query_string}")
}

#[derive(Debug, Clone, serde::Deserialize)]
struct TokenResponse {
    id_token: String,
    access_token: String,
    refresh_token: String,
}

async fn exchange_code_for_tokens(
    issuer: &str,
    client_id: &str,
    redirect_uri: &str,
    pkce: &PkceCodes,
    code: &str,
) -> Result<TokenResponse> {
    let client = reqwest::Client::new();

    let body = format!(
        "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}",
        urlencoding::encode(code),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(client_id),
        urlencoding::encode(&pkce.code_verifier)
    );

    let resp = client
        .post(format!("{issuer}/oauth/token"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .context("Failed to send token request")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Token exchange failed: {status} - {body}");
    }

    let tokens: TokenResponse = resp
        .json()
        .await
        .context("Failed to parse token response")?;
    Ok(tokens)
}

fn parse_id_token_claims(id_token: &str) -> (Option<String>, Option<String>, Option<String>) {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() != 3 {
        return (None, None, None);
    }

    let payload = match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[1]) {
        Ok(bytes) => bytes,
        Err(_) => return (None, None, None),
    };

    let json: serde_json::Value = match serde_json::from_slice(&payload) {
        Ok(v) => v,
        Err(_) => return (None, None, None),
    };

    let email = json.get("email").and_then(|v| v.as_str()).map(String::from);

    let auth_claims = json.get("https://api.openai.com/auth");

    let plan_type = auth_claims
        .and_then(|auth| auth.get("chatgpt_plan_type"))
        .and_then(|v| v.as_str())
        .map(String::from);

    let account_id = auth_claims
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(|v| v.as_str())
        .map(String::from);

    (email, plan_type, account_id)
}

pub struct OAuthLoginResult {
    pub account: StoredAccount,
}

pub async fn start_oauth_login(
    account_name: String,
) -> Result<(
    OAuthLoginInfo,
    oneshot::Receiver<Result<OAuthLoginResult>>,
    Arc<AtomicBool>,
)> {
    let pkce = generate_pkce();
    let state = generate_state();

    println!("[OAuth] Starting login for account: {account_name}");
    println!("[OAuth] PKCE challenge: {}", &pkce.code_challenge[..20]);

    let server = match Server::http(format!("127.0.0.1:{DEFAULT_PORT}")) {
        Ok(server) => server,
        Err(default_err) => {
            println!(
                "[OAuth] Default callback port {DEFAULT_PORT} unavailable ({default_err}), using a random local port"
            );
            Server::http("127.0.0.1:0").map_err(|fallback_err| {
                anyhow::anyhow!(
                    "Failed to start OAuth server: default port {DEFAULT_PORT} error: {default_err}; fallback error: {fallback_err}"
                )
            })?
        }
    };

    let actual_port = match server.server_addr().to_ip() {
        Some(addr) => addr.port(),
        None => anyhow::bail!("Failed to determine server port"),
    };

    let redirect_uri = format!("http://localhost:{actual_port}/auth/callback");
    let auth_url = build_authorize_url(DEFAULT_ISSUER, CLIENT_ID, &redirect_uri, &pkce, &state);

    println!("[OAuth] Server started on port {actual_port}");
    println!("[OAuth] Redirect URI: {redirect_uri}");
    println!("[OAuth] Auth URL: {auth_url}");

    let login_info = OAuthLoginInfo {
        auth_url: auth_url.clone(),
        callback_port: actual_port,
    };

    let (tx, rx) = oneshot::channel();
    let cancelled = Arc::new(AtomicBool::new(false));

    let server = Arc::new(server);
    let pkce_clone = pkce.clone();
    let state_clone = state.clone();
    let cancelled_clone = cancelled.clone();

    thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let result = runtime.block_on(run_oauth_server(
            server,
            pkce_clone,
            state_clone,
            redirect_uri,
            account_name,
            cancelled_clone,
        ));
        let _ = tx.send(result);
    });

    Ok((login_info, rx, cancelled))
}

async fn run_oauth_server(
    server: Arc<Server>,
    pkce: PkceCodes,
    expected_state: String,
    redirect_uri: String,
    account_name: String,
    cancelled: Arc<AtomicBool>,
) -> Result<OAuthLoginResult> {
    let timeout = Duration::from_secs(300);
    let start = std::time::Instant::now();

    loop {
        if cancelled.load(Ordering::Relaxed) {
            anyhow::bail!("OAuth login cancelled");
        }

        if start.elapsed() > timeout {
            anyhow::bail!("OAuth login timed out");
        }

        let request = match server.recv_timeout(Duration::from_secs(1)) {
            Ok(Some(req)) => req,
            Ok(None) => continue,
            Err(_) => continue,
        };

        let result = handle_oauth_request(
            request,
            &pkce,
            &expected_state,
            &redirect_uri,
            &account_name,
        )
        .await;

        match result {
            HandleResult::Continue => continue,
            HandleResult::Success(account) => {
                server.unblock();
                return Ok(OAuthLoginResult { account });
            }
            HandleResult::Error(e) => {
                server.unblock();
                return Err(e);
            }
        }
    }
}

enum HandleResult {
    Continue,
    Success(StoredAccount),
    Error(anyhow::Error),
}

async fn handle_oauth_request(
    request: Request,
    pkce: &PkceCodes,
    expected_state: &str,
    redirect_uri: &str,
    account_name: &str,
) -> HandleResult {
    let url_str = request.url().to_string();
    let parsed = match url::Url::parse(&format!("http://localhost{url_str}")) {
        Ok(u) => u,
        Err(_) => {
            let _ = request.respond(Response::from_string("Bad Request").with_status_code(400));
            return HandleResult::Continue;
        }
    };

    let path = parsed.path();

    if path == "/auth/callback" {
        println!("[OAuth] Received callback request");
        let params: std::collections::HashMap<String, String> =
            parsed.query_pairs().into_owned().collect();

        println!(
            "[OAuth] Callback params: {:?}",
            params.keys().collect::<Vec<_>>()
        );

        if let Some(error) = params.get("error") {
            let error_desc = params
                .get("error_description")
                .map(|s| s.as_str())
                .unwrap_or("Unknown error");
            println!("[OAuth] Error from provider: {error} - {error_desc}");
            let _ = request.respond(
                Response::from_string(format!("OAuth Error: {error} - {error_desc}"))
                    .with_status_code(400),
            );
            return HandleResult::Error(anyhow::anyhow!("OAuth error: {error} - {error_desc}"));
        }

        if params.get("state").map(String::as_str) != Some(expected_state) {
            println!("[OAuth] State mismatch!");
            let _ = request.respond(Response::from_string("State mismatch").with_status_code(400));
            return HandleResult::Error(anyhow::anyhow!("OAuth state mismatch"));
        }

        println!("[OAuth] State verified OK");

        let code = match params.get("code") {
            Some(c) if !c.is_empty() => c.clone(),
            _ => {
                println!("[OAuth] Missing authorization code");
                let _ = request.respond(
                    Response::from_string("Missing authorization code").with_status_code(400),
                );
                return HandleResult::Error(anyhow::anyhow!("Missing authorization code"));
            }
        };

        println!("[OAuth] Got authorization code, exchanging for tokens...");

        match exchange_code_for_tokens(DEFAULT_ISSUER, CLIENT_ID, redirect_uri, pkce, &code).await {
            Ok(tokens) => {
                println!("[OAuth] Token exchange successful!");
                let (email, plan_type, chatgpt_account_id) =
                    parse_id_token_claims(&tokens.id_token);

                let account = StoredAccount::new_chatgpt(
                    account_name.to_string(),
                    email,
                    plan_type,
                    tokens.id_token,
                    tokens.access_token,
                    tokens.refresh_token,
                    chatgpt_account_id,
                );

                let logo_data_url = format!(
                    "data:image/png;base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(include_bytes!("../../../public/app-logo.png"))
                );

                let success_html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login Successful</title>
    <style>
        :root {{
            color-scheme: dark;
            --bg: #060a12;
            --panel: #0f0f0f;
            --line: rgba(255, 255, 255, 0.1);
            --line-strong: rgba(255, 87, 34, 0.28);
            --text: #f8fafc;
            --muted: rgba(226, 232, 240, 0.72);
            --accent: #ff5722;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
                radial-gradient(circle at 20% 15%, rgba(255, 87, 34, 0.16), transparent 22%),
                radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.06), transparent 24%),
                linear-gradient(180deg, rgba(6, 10, 18, 0.94), rgba(6, 10, 18, 0.98)),
                var(--bg);
            color: var(--text);
            font-family: "Geist", "Segoe UI", system-ui, sans-serif;
            overflow: hidden;
        }}
        .frame {{
            width: min(560px, calc(100vw - 32px));
            padding: 18px;
            border: 1px solid var(--line);
            background: rgba(15, 15, 15, 0.96);
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.45);
        }}
        .card {{
            display: grid;
            gap: 14px;
            padding: 22px;
            border: 1px solid var(--line-strong);
            background: linear-gradient(180deg, rgba(20, 20, 20, 0.98), rgba(15, 15, 15, 0.98));
        }}
        .brand {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .logo-box {{
            width: 46px;
            height: 46px;
            display: grid;
            place-items: center;
            border: 1px solid rgba(255, 87, 34, 0.24);
            background: rgba(255, 87, 34, 0.08);
            overflow: hidden;
            flex: none;
        }}
        .logo-box img {{
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }}
        .brand-copy {{
            display: grid;
            gap: 2px;
        }}
        .brand-copy strong {{
            font-size: 1rem;
            font-weight: 700;
            letter-spacing: 0.02em;
        }}
        .brand-copy span {{
            color: var(--muted);
            font-size: 0.74rem;
            letter-spacing: 0.14em;
            text-transform: uppercase;
        }}
        .status h1 {{
            margin: 0;
            font-size: clamp(1.6rem, 3vw, 2.2rem);
            line-height: 1.05;
            letter-spacing: -0.03em;
        }}
        .status p {{
            margin: 0;
            color: var(--muted);
            font-size: 0.96rem;
            line-height: 1.55;
        }}
    </style>
</head>
<body>
    <main class="frame" role="main" aria-label="Login complete">
        <section class="card">
            <div class="brand">
                <div class="logo-box" aria-hidden="true"><img src="{logo}" alt="" /></div>
                <div class="brand-copy">
                    <strong>Codex Switcher</strong>
                    <span>Login complete</span>
                </div>
            </div>
            <div class="status">
                <h1>You’re signed in.</h1>
                <p>Your account was added successfully. You can close this window and return to Codex Switcher.</p>
            </div>
        </section>
    </main>
</body>
</html>"#, logo = logo_data_url);                let response = Response::from_string(success_html).with_header(
                    Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                        .unwrap(),
                );
                let _ = request.respond(response);

                return HandleResult::Success(account);
            }
            Err(e) => {
                println!("[OAuth] Token exchange failed: {e}");
                let _ = request.respond(
                    Response::from_string(format!("Token exchange failed: {e}"))
                        .with_status_code(500),
                );
                return HandleResult::Error(e);
            }
        }
    }

    let _ = request.respond(Response::from_string("Not Found").with_status_code(404));
    HandleResult::Continue
}

pub async fn wait_for_oauth_login(
    rx: oneshot::Receiver<Result<OAuthLoginResult>>,
) -> Result<StoredAccount> {
    let result = rx.await.context("OAuth login was cancelled")??;
    Ok(result.account)
}



