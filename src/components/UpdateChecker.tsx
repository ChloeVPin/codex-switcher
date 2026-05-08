import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  DownloadRounded,
  RestartAltRounded,
  SystemUpdateAltRounded,
} from "@mui/icons-material";
import { isTauriRuntime } from "../lib/platform";

type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; downloaded: number; total: number | null }
  | { kind: "ready" };

type NotificationVariant = "success" | "error" | "info" | "warning";

interface UpdateCheckerProps {
  onNotify?: (message: string, variant?: NotificationVariant) => void;
}

const DISMISSED_VERSION_KEY = "codex-switcher.update-check.dismissed-version";
const ERROR_NOTICE_KEY = "codex-switcher.update-check.error-notice-at";
const ERROR_NOTICE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

export function UpdateChecker({ onNotify }: UpdateCheckerProps) {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle" });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  const notifyUpdateIssue = useCallback(
    (message: string) => {
      console.error("Update check failed:", message);

      if (!onNotify) return;

      const lastNoticeAt = Number(readLocalStorage(ERROR_NOTICE_KEY) ?? 0);
      const now = Date.now();
      if (Number.isFinite(lastNoticeAt) && lastNoticeAt > 0 && now - lastNoticeAt < ERROR_NOTICE_COOLDOWN_MS) {
        return;
      }

      writeLocalStorage(ERROR_NOTICE_KEY, String(now));
      onNotify("Update checks are unavailable right now. The app will keep running normally.", "warning");
    },
    [onNotify]
  );

  const checkForUpdate = useCallback(async () => {
    if (!isTauriRuntime()) return;

    try {
      setStatus({ kind: "checking" });

      const [version, { check }] = await Promise.all([
        getVersion().catch(() => null),
        import("@tauri-apps/plugin-updater"),
      ]);

      setCurrentVersion(version);
      const update = await check();

      if (!update) {
        setStatus({ kind: "idle" });
        return;
      }

      const dismissedVersion = readLocalStorage(DISMISSED_VERSION_KEY);
      if (dismissedVersion && dismissedVersion === update.version) {
        setStatus({ kind: "idle" });
        return;
      }

      setStatus({ kind: "available", update });
    } catch (err) {
      setStatus({ kind: "idle" });
      notifyUpdateIssue(err instanceof Error ? err.message : String(err));
    }
  }, [notifyUpdateIssue]);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  const handleDownloadAndInstall = async () => {
    if (status.kind !== "available") return;

    try {
      let downloaded = 0;
      let total: number | null = null;
      setStatus({ kind: "downloading", downloaded, total });

      await status.update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? null;
            setStatus({ kind: "downloading", downloaded: 0, total });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setStatus({ kind: "downloading", downloaded, total });
            break;
          case "Finished":
            setStatus({ kind: "ready" });
            break;
        }
      });
    } catch (err) {
      setStatus({ kind: "idle" });
      notifyUpdateIssue(err instanceof Error ? err.message : String(err));
    }
  };

  const progress = useMemo(() => {
    if (status.kind !== "downloading" || !status.total || status.total <= 0) {
      return null;
    }

    return Math.min(100, (status.downloaded / status.total) * 100);
  }, [status]);

  const handleDismissForLater = () => {
    if (status.kind === "available") {
      writeLocalStorage(DISMISSED_VERSION_KEY, status.update.version);
    }
    setStatus({ kind: "idle" });
  };

  if (!isTauriRuntime()) return null;
  if (status.kind === "idle" || status.kind === "checking") return null;

  return (
    <div className="update-modal fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="update-modal__backdrop absolute inset-0 bg-black/70 backdrop-blur-md" />

      <div className="update-modal__panel liquid-modal-panel relative w-full max-w-[660px]">
        <div className="update-modal__header">
          <div
            className={`update-modal__icon ${
              status.kind === "available"
                ? "update-modal__icon--available"
                : status.kind === "downloading"
                  ? "update-modal__icon--downloading"
                  : "update-modal__icon--ready"
            }`}
          >
            {status.kind === "available" ? (
              <SystemUpdateAltRounded fontSize="inherit" />
            ) : status.kind === "downloading" ? (
              <DownloadRounded fontSize="inherit" />
            ) : (
              <RestartAltRounded fontSize="inherit" />
            )}
          </div>

          <div className="update-modal__copy">
            <p className="update-modal__eyebrow">
              {status.kind === "available"
                ? "Update available"
                : status.kind === "downloading"
                  ? "Installing update"
                  : "Update installed"}
            </p>
            <h2 className="update-modal__title">
              {status.kind === "available"
                ? "A new version is ready"
                : status.kind === "downloading"
                  ? "Installing in the background"
                  : "Restart to finish updating"}
            </h2>
            <p className="update-modal__text">
              {status.kind === "available" &&
                `Version ${status.update.version}${
                  currentVersion ? ` is available while you're on ${currentVersion}.` : " is available."
                }`}
              {status.kind === "downloading" &&
                `Downloading update package${status.total ? ` • ${formatBytes(status.downloaded)} / ${formatBytes(status.total)}` : ""}.`}
              {status.kind === "ready" &&
                "The update has been installed. Restart the app to start using the new version."}
            </p>
          </div>
        </div>

        {status.kind === "available" && (
          <div className="update-modal__note">
            This keeps the app current without interrupting your saved accounts or session data.
          </div>
        )}

        {status.kind === "downloading" && (
          <div className="update-modal__progress">
            <div className="workspace-empty__loading" aria-hidden="true">
              <div
                className="workspace-empty__loading-line"
                style={{ width: progress !== null ? `${progress}%` : "62%" }}
              />
            </div>
          </div>
        )}

        <div className="update-modal__footer">
          {status.kind === "available" && (
            <>
              <button
                type="button"
                onClick={handleDismissForLater}
                className="banner-action banner-action--secondary"
              >
                Later
              </button>
              <button
                type="button"
                onClick={handleDownloadAndInstall}
                className="banner-action banner-action--primary"
              >
                Update now
              </button>
            </>
          )}

          {status.kind === "ready" && (
            <>
              <button
                type="button"
                onClick={handleDismissForLater}
                className="banner-action banner-action--secondary"
              >
                Restart later
              </button>
              <button
                type="button"
                onClick={() => void relaunch()}
                className="banner-action banner-action--primary"
              >
                Restart now
              </button>
            </>
          )}

          {status.kind === "downloading" && (
            <button
              type="button"
              onClick={handleDismissForLater}
              className="banner-action banner-action--secondary"
            >
              Keep working
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
