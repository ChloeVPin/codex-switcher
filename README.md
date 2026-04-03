<p align="center">
  <img src="public/app-logo.png" alt="Codex Switcher logo" width="128" height="128">
</p>

<h1 align="center">Codex Switcher</h1>

<p align="center">Local dashboard for managing Codex CLI accounts.</p>

<p align="center">
  Switch accounts by writing <code>auth.json</code>, inspect usage, warm accounts up, and keep backups in one place.
  Run it as a local browser app or package it as portable Windows EXEs.
</p>

## What it does

- Manages multiple Codex/OpenAI accounts locally
- Switches the active account by writing `auth.json`
- Shows usage data for each account
- Sends warm-up requests when needed
- Imports and exports accounts from `auth.json` or encrypted backups
- Runs as a local browser dashboard
- Builds into portable Windows executables

## Repository Layout

- `src/` React UI
- `src-tauri/` Rust backend, local server, and account logic
- `scripts/` build and run helpers
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

Builds the frontend and starts the local browser dashboard.

If you want the same dashboard without the launcher wrapper:

```bash
pnpm lan
```

### Build

```bash
pnpm build
```

### Portable Windows EXEs

```bash
pnpm build:windows
```

Outputs:

- `artifacts/windows/codex-switcher-x64.exe`
- `artifacts/windows/codex-switcher-x86.exe`
- `artifacts/windows/codex-switcher-arm64.exe`

Each EXE starts the local server and opens the dashboard in your browser.

## Configuration

- `CODEX_SWITCHER_WEB_HOST` sets the bind host
- `CODEX_SWITCHER_WEB_PORT` sets the port
- `CODEX_SWITCHER_WEB_OPEN_BROWSER=0` disables auto-open
- `CODEX_HOME` changes the Codex auth directory target

## Security Notes

- This tool only manages accounts you own or are authorized to manage.
- It stores account data locally on your machine.
- It can export encrypted backups for portability.
- It does not use a cloud backend.

## Why It Exists

Codex account switching is easier when the account data, usage info, and import/export flow live in one local dashboard instead of being scattered across files and terminals.
