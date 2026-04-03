<p align="center">
  <img src="src-tauri/icons/logo.svg" alt="Codex Switcher" width="128" height="128">
</p>

<h1 align="center">Codex Switcher</h1>

<p align="center">
  A Desktop Application for Managing Multiple OpenAI <a href="https://github.com/openai/codex">Codex CLI</a> Accounts<br>
  Easily switch between accounts, monitor usage limits, and stay in control of your quota
</p>

## Features

- **Multi-Account Management** – Add and manage multiple Codex accounts in one place
- **Quick Switching** – Switch between accounts with a single click
- **Usage Monitoring** – View real-time usage for both 5-hour and weekly limits
- **Dual Login Mode** – OAuth authentication or import existing `auth.json` files

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/Lampese/codex-switcher.git
cd codex-switcher

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build portable Windows executables only
pnpm build:windows
```

Portable Windows builds are written to `artifacts/windows/` and launch the local browser dashboard:

- `codex-switcher-x64.exe`
- `codex-switcher-x86.exe`
- `codex-switcher-arm64.exe`

The build script removes old files from that output directory before copying new binaries.
When you launch one of the portable EXEs, it starts the local HTTP server and opens your browser to it.

If you want the Tauri desktop bundle instead, use `pnpm tauri build`. That produces installers and is not the portable path.

### Run the Dashboard in a Browser

You can also serve the built dashboard over HTTP instead of opening the Tauri shell.

```bash
# Build the frontend and start the web server on 0.0.0.0:3210
pnpm lan
```

Optional environment variables:

- `CODEX_SWITCHER_WEB_HOST` to override the bind host
- `CODEX_SWITCHER_WEB_PORT` to override the port

The browser dashboard serves the same UI and backend actions through `/api/invoke/*`, which makes it usable over LAN, Tailscale, or a remote host tunnel when you expose the chosen port safely.

## Disclaimer

This tool is designed **exclusively for individuals who personally own multiple OpenAI/ChatGPT accounts**. It is intended to help users manage their own accounts more conveniently.

**This tool is NOT intended for:**

- Sharing accounts between multiple users
- Circumventing OpenAI's terms of service
- Any form of account pooling or credential sharing

By using this software, you agree that you are the rightful owner of all accounts you add to the application. The authors are not responsible for any misuse or violations of OpenAI's terms of service.

## Versioning

Use the version bump helper to keep app versions in sync across Tauri, Cargo, and the frontend.

```bash
# Exact version
pnpm version:bump 0.1.7

# Semver bumps
pnpm version:patch
pnpm version:minor
pnpm version:major
```
