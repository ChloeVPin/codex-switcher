import { useState } from "react";
import {
  Close,
  ContentCopyOutlined,
  FolderOpenOutlined,
  LoginRounded,
  OpenInNewRounded,
} from "@mui/icons-material";
import CircularProgress from "@mui/material/CircularProgress";
import {
  describeFileSource,
  openExternalUrl,
  pickAuthJsonFile,
  type FileSource,
} from "../lib/platform";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFile: (source: FileSource, name: string) => Promise<void>;
  onStartOAuth: (name: string) => Promise<{ auth_url: string }>;
  onCompleteOAuth: () => Promise<unknown>;
  onCancelOAuth: () => Promise<void>;
}

type Tab = "oauth" | "import";

export function AddAccountModal({
  isOpen,
  onClose,
  onImportFile,
  onStartOAuth,
  onCompleteOAuth,
  onCancelOAuth,
}: AddAccountModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("oauth");
  const [name, setName] = useState("");
  const [fileSource, setFileSource] = useState<FileSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);
  const [authUrl, setAuthUrl] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const isPrimaryDisabled = loading || (activeTab === "oauth" && oauthPending);

  const resetForm = () => {
    setName("");
    setFileSource(null);
    setError(null);
    setLoading(false);
    setOauthPending(false);
    setAuthUrl("");
  };

  const handleClose = () => {
    if (oauthPending) {
      void onCancelOAuth().catch((err) => {
        console.error("Failed to cancel login:", err);
      });
    }
    resetForm();
    onClose();
  };

  const handleOAuthLogin = async () => {
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const info = await onStartOAuth(name.trim());
      setAuthUrl(info.auth_url);
      setOauthPending(true);
      setLoading(false);

      await onCompleteOAuth();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      setOauthPending(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const selected = await pickAuthJsonFile();
      if (selected) setFileSource(selected);
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleImportFile = async () => {
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }
    if (!fileSource) {
      setError("Please select an auth.json file");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onImportFile(fileSource, name.trim());
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="liquid-modal fixed inset-0 flex items-center justify-center z-50">
      <div className="liquid-modal-panel bg-white border border-gray-200 rounded-2xl w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Add Account</h2>
          <button
            type="button"
            onClick={handleClose}
            className="modal-close-button text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close modal"
          >
            <Close fontSize="small" />
          </button>
        </div>

        <div className="add-account-tablist" role="tablist" aria-label="Account import method">
          {(["oauth", "import"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                if (tab === "import" && oauthPending) {
                  void onCancelOAuth().catch((err) => {
                    console.error("Failed to cancel login:", err);
                  });
                  setOauthPending(false);
                  setLoading(false);
                }
                setActiveTab(tab);
                setError(null);
              }}
              role="tab"
              aria-pressed={activeTab === tab}
              aria-selected={activeTab === tab}
              data-active={activeTab === tab ? "true" : "false"}
              className={`add-account-tab ${activeTab === tab ? "is-active" : ""}`}
            >
              {tab === "oauth" ? "ChatGPT Login" : "Import File"}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Work Account"
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-colors"
            />
          </div>

          {activeTab === "oauth" && (
            <div className="text-sm text-gray-500">
              {oauthPending ? (
                <div className="add-account-auth add-account-auth--pending">
                  <div className="add-account-auth__spinner">
                    <CircularProgress size={28} thickness={4} color="inherit" />
                  </div>
                  <p className="add-account-auth__title">Login link ready</p>
                  <p className="add-account-auth__subtitle">
                    Finish the sign-in in your browser, then come back here and wait for the app to confirm it.
                  </p>
                  <div className="add-account-auth__row">
                    <div className="add-account-auth__linkbox" title={authUrl}>
                      <input type="text" readOnly value={authUrl} className="add-account-auth__link" />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(authUrl)
                          .then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          })
                          .catch(() => {
                            setError("Clipboard unavailable. Copy the link manually.");
                          });
                      }}
                      className={`add-account-auth__button add-account-auth__button--copy ${copied ? "is-copied" : ""}`}
                    >
                      <ContentCopyOutlined fontSize="inherit" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void openExternalUrl(authUrl);
                      }}
                      className="add-account-auth__button add-account-auth__button--open"
                    >
                      <OpenInNewRounded fontSize="inherit" />
                      Open
                    </button>
                  </div>
                </div>
              ) : (
                <p>
                  Click the button below to generate a login link.
                  You will need to open it in your browser to authenticate.
                </p>
              )}
            </div>
          )}

          {activeTab === "import" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select auth.json file
              </label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 truncate">
                  {describeFileSource(fileSource)}
                </div>
                <button
                  type="button"
                  onClick={handleSelectFile}
                  title="Browse: open the file picker at the expected auth.json location."
                  className="btn-mono px-4 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors whitespace-nowrap inline-flex items-center gap-2"
                >
                  <FolderOpenOutlined fontSize="inherit" />
                  Browse
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Import credentials from an existing Codex auth.json file
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            type="button"
            onClick={handleClose}
            className="btn-mono flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={activeTab === "oauth" ? handleOAuthLogin : handleImportFile}
            disabled={isPrimaryDisabled}
            className="btn-mono flex-1 min-w-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium rounded-lg bg-gray-900 hover:bg-gray-800 text-white transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <LoginRounded fontSize="small" />
            {loading
              ? "Adding..."
              : activeTab === "oauth"
                ? "Generate Login Link"
                : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
