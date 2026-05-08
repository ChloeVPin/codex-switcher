#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

use anyhow::Context;
use tao::{
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::{Icon, WindowBuilder},
};
use wry::WebViewBuilder;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let host = std::env::var("CODEX_SWITCHER_WEB_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("CODEX_SWITCHER_WEB_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3210);

    let bound_port = codex_switcher_lib::web::spawn_lan_server(&host, port)?;
    let access_host = codex_switcher_lib::web::browser_host_for_server(&host);
    let url = format!("http://{access_host}:{bound_port}");

    let event_loop = EventLoop::new();
    let icon = load_icon()?;

    let window = WindowBuilder::new()
        .with_title("Codex Switcher")
        .with_window_icon(Some(icon))
        .build(&event_loop)
        .context("Failed to create the portable app window")?;

    let _webview = WebViewBuilder::new()
        .with_url(&url)
        .with_initialization_script("window.__CODEX_SWITCHER_PORTABLE__ = true;")
        .build(&window)
        .context("Failed to build the embedded webview")?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}

fn load_icon() -> anyhow::Result<Icon> {
    let image = image::load_from_memory(include_bytes!("../../../public/app-logo.png"))
        .context("Failed to load the portable app icon")?
        .into_rgba8();
    let (width, height) = image.dimensions();
    let rgba = image.into_raw();
    Icon::from_rgba(rgba, width, height).context("Failed to convert the portable app icon")
}
