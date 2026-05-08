import type { ImportAccountsSummary } from "../types";

export type FileSource = string | File;

type BrowserWindowWithPickers = Window & {
  showOpenFilePicker?: (options?: any) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: any) => Promise<FileSystemFileHandle>;
};

function getBrowserWindowWithPickers(): BrowserWindowWithPickers | null {
  if (typeof window === "undefined") return null;
  return window as BrowserWindowWithPickers;
}

export async function invokeBackend<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args ?? {});
  }

  const response = await fetch(`/api/invoke/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export async function pickAuthJsonFile(): Promise<FileSource | null> {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      directory: false,
      title: "Choose an auth.json file",
      filters: [{ name: "Auth JSON", extensions: ["json"] }],
    });

    return typeof selected === "string" ? selected : null;
  }

  const browserWindow = getBrowserWindowWithPickers();

  if (browserWindow && typeof browserWindow.showOpenFilePicker === "function") {
    const [handle] = await browserWindow.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Auth JSON",
          accept: {
            "application/json": [".json"],
          },
        },
      ],
    });

    return handle.getFile();
  }

  return pickBrowserFile(".json,application/json");
}

export async function exportFullBackupFile(): Promise<boolean> {
  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      title: "Save full backup",
      defaultPath: "codex-switcher-full.cswf",
      filters: [
        {
          name: "Codex Switcher backup",
          extensions: ["cswf"],
        },
      ],
    });

    if (!path) return false;

    await invokeBackend<void>("export_accounts_full_encrypted_file", { path });
    return true;
  }

  const contentsBase64 = await invokeBackend<string>("export_accounts_full_encrypted_bytes");
  const contents = base64ToBytes(contentsBase64);

  const browserWindow = getBrowserWindowWithPickers();

  if (browserWindow && typeof browserWindow.showSaveFilePicker === "function") {
    const handle = await browserWindow.showSaveFilePicker({
      suggestedName: "codex-switcher-full.cswf",
      types: [
        {
          description: "Codex Switcher backup",
          accept: {
            "application/octet-stream": [".cswf"],
          },
        },
      ],
    });

    const writable = await handle.createWritable();
    try {
      await writable.write(contents);
    } finally {
      await writable.close();
    }

    return true;
  }

  throw new Error("Choose a browser that supports saving files, or use the desktop app.");
}

export async function importFullBackupFile(): Promise<ImportAccountsSummary | null> {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      directory: false,
      title: "Choose a full backup file",
      filters: [{ name: "Codex Switcher backup", extensions: ["cswf"] }],
    });

    if (typeof selected !== "string") return null;
    return invokeBackend<ImportAccountsSummary>("import_accounts_full_encrypted_file", {
      path: selected,
    });
  }

  const browserWindow = getBrowserWindowWithPickers();

  if (browserWindow && typeof browserWindow.showOpenFilePicker === "function") {
    const [handle] = await browserWindow.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Codex Switcher backup",
          accept: {
            "application/octet-stream": [".cswf"],
          },
        },
      ],
    });

    const file = await handle.getFile();
    const contentsBase64 = await fileToBase64(file);
    return invokeBackend<ImportAccountsSummary>("import_accounts_full_encrypted_bytes", {
      contentsBase64,
    });
  }

  const selected = await pickBrowserFile(".cswf,application/octet-stream");
  if (!selected) return null;

  const contentsBase64 = await fileToBase64(selected);
  return invokeBackend<ImportAccountsSummary>("import_accounts_full_encrypted_bytes", {
    contentsBase64,
  });
}

export function describeFileSource(source: FileSource | null): string {
  if (!source) return "No file selected";
  return typeof source === "string" ? source : source.name;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function pickBrowserFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", handleWindowFocus);
      input.remove();
      resolve(file);
    };

    const handleWindowFocus = () => {
      window.setTimeout(() => {
        finish(input.files?.[0] ?? null);
      }, 0);
    };

    input.addEventListener(
      "change",
      () => {
        finish(input.files?.[0] ?? null);
      },
      { once: true }
    );

    document.body.appendChild(input);
    window.addEventListener("focus", handleWindowFocus, { once: true });
    input.click();
  });
}

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}
