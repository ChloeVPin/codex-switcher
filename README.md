<p align="center">
  <img src="public/app-logo.png" alt="Codex Switcher logo" width="72">
</p>

# Codex Switcher

Codex Switcher is a native desktop app for managing Codex/OpenAI accounts locally.

It keeps account switching, usage checks, and import/export in one place — on Windows, macOS, and Linux.

## What It Does

- Manages multiple Codex/OpenAI accounts locally
- Switches the active account by writing `auth.json`
- Shows usage data for each account
- Sends warm-up requests when needed
- Imports and exports accounts from `auth.json` or encrypted backups
- Checks GitHub Releases for updates automatically

## Project Layout

- `src/` — React UI
- `src-tauri/` — Rust backend, Tauri app shell, and account logic
- `src-tauri/src/platform.rs` — cross-platform path resolution
- `scripts/` — build and release helpers
- `public/` — logo and static assets

## Install

### Prerequisites

- Node.js 18+
- pnpm
- Rust toolchain (`rustup`)

**Linux only** — install system libraries before building:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

```bash
pnpm install
```

## Run Locally

```bash
pnpm dev
```

Starts the native Tauri desktop app in a webview window. Works on Windows, macOS, and Linux.

### Browser Dashboard

```bash
pnpm dev:web
```

Builds the frontend and starts a local HTTP server, then opens the app in your default browser. Useful on platforms where the full Tauri dev environment is not set up, or for remote/LAN access. Works on all platforms.

## Build

### Frontend Only

```bash
pnpm build
```

Compiles the React app to `dist/`. Required before any Rust build that embeds the frontend.

### Native Desktop App (Tauri)

```bash
pnpm tauri:build
```

Builds the native Tauri app for the current platform. The frontend is embedded into the binary at compile time.

#### Supported Release Targets

| Platform | Architectures       |
|----------|---------------------|
| Windows  | x86, x64, arm64     |
| macOS    | x64, arm64          |
| Linux    | x64, arm64          |

Linux `deb` and `rpm` packages include a desktop launcher entry so the app appears in standard app menus. AppImage builds use the same app identity and icon.

> Linux x86 is not published as a desktop target — modern WebKitGTK and Tauri effectively require 64-bit.

## Portable Windows Builds

> **Windows only.** Requires Visual Studio Build Tools with C++ and LLVM (for arm64).

```bash
pnpm build:windows
```

Builds self-contained portable executables (no installer required):

- `artifacts/windows/codex-switcher-x86.exe`
- `artifacts/windows/codex-switcher-x64.exe`
- `artifacts/windows/codex-switcher-arm64.exe`

These embed the frontend and serve it through a local HTTP server in a lightweight webview window. They are published as GitHub Release assets alongside the primary installer packages.

## Releases

- GitHub Releases are the distribution channel for all platforms
- `latest.json` is published with each signed release for the in-app updater
- The app checks for updates automatically on startup

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CODEX_HOME` | Overrides the Codex auth directory (default: `~/.codex`) |
| `CODEX_SWITCHER_HOME` | Overrides where Codex Switcher stores its data (default: `~/.codex-switcher`) |
| `CODEX_SWITCHER_WEB_HOST` | Bind host for the browser dashboard (default: `127.0.0.1`) |
| `CODEX_SWITCHER_WEB_PORT` | Port for the browser dashboard (default: `3210`) |
| `CODEX_SWITCHER_WEB_OPEN_BROWSER` | Set to `0` to disable auto-open in browser dashboard mode |

## Data Handling

- Manages only accounts you own or are authorized to use
- All account data is stored locally on your machine
- Encrypted backup export is available for portability
- No account data is sent to any cloud service

## Why It Exists

Managing multiple Codex accounts from the command line means juggling `auth.json` files by hand. Codex Switcher puts account switching, usage tracking, and import/export in one place, across all platforms.
