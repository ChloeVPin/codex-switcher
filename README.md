<p align="center">
  <img src="public/app-logo.png" alt="Codex Switcher logo" width="128" height="128">
</p>

<h1 align="center">Codex Switcher</h1>

<p align="center">Codex account control in a native desktop shell.</p>

<p align="center">
  Version 1.1 ships a Tauri desktop app, GitHub Release updates, and portable Windows builds.
</p>

## What it does

- Manages multiple Codex/OpenAI accounts locally
- Switches the active account by writing `auth.json`
- Shows usage data for each account
- Sends warm-up requests when needed
- Imports and exports accounts from `auth.json` or encrypted backups
- Runs as a native Tauri desktop app first
- Publishes portable Windows EXEs for x86, x64, and arm64
- Checks GitHub Releases for updates

## Repository Layout

- `src/` React UI
- `src-tauri/` Rust backend, Tauri app shell, and account logic
- `scripts/` build and release helpers
- `public/` logo and static assets

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Rust toolchain

### Install

```bash
pnpm install
```

### Run Locally

```bash
pnpm dev
```

Starts the Tauri desktop app in a native webview window.

If you want the old browser-hosted dashboard instead:

```bash
pnpm dev:web
```

### Build

```bash
pnpm build
```

### Build Desktop App

```bash
pnpm tauri:build
```

Builds the native Tauri app for the current platform.

### Portable Windows EXEs

```bash
pnpm build:windows
```

Builds portable Windows executables for:

- `artifacts/windows/codex-switcher-x32.exe`
- `artifacts/windows/codex-switcher-x64.exe`
- `artifacts/windows/codex-switcher-arm64.exe`

These are release assets, not the primary desktop app.

### Releases

- GitHub Releases are the update source for the desktop app
- `latest.json` is published alongside each signed desktop release
- The updater checks the release channel automatically inside the app

## Configuration

- `CODEX_SWITCHER_WEB_HOST` sets the bind host for the legacy browser dashboard
- `CODEX_SWITCHER_WEB_PORT` sets the port for the legacy browser dashboard
- `CODEX_SWITCHER_WEB_OPEN_BROWSER=0` disables auto-open in legacy browser mode
- `CODEX_HOME` changes the Codex auth directory target

## Security Notes

- This tool only manages accounts you own or are authorized to manage.
- It stores account data locally on your machine.
- It can export encrypted backups for portability.
- It does not use a cloud backend.

## Why It Exists

Codex account switching is easier when the account data, usage info, and import/export flow live in one local desktop app instead of being scattered across files and terminals.
