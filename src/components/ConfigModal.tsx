import { Close, ContentCopyOutlined, DownloadRounded, FileUploadOutlined } from "@mui/icons-material";

type ConfigModalMode = "slim_export" | "slim_import";

interface ConfigModalProps {
  isOpen: boolean;
  mode: ConfigModalMode;
  payload: string;
  error: string | null;
  copied: boolean;
  isExportingSlim: boolean;
  isImportingSlim: boolean;
  onClose: () => void;
  onChangePayload: (value: string) => void;
  onCopy: () => void;
  onImport: () => void;
}

export function ConfigModal({
  isOpen,
  mode,
  payload,
  error,
  copied,
  isExportingSlim,
  isImportingSlim,
  onClose,
  onChangePayload,
  onCopy,
  onImport,
}: ConfigModalProps) {
  if (!isOpen) return null;

  return (
    <div className="liquid-modal fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="liquid-modal-panel bg-white border border-gray-200 rounded-2xl w-full max-w-2xl mx-4 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "slim_export" ? "Export Slim Text" : "Import Slim Text"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="modal-close-button text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close modal"
          >
            <Close fontSize="small" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {mode === "slim_import" ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Existing accounts are kept. Only missing accounts are imported.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              This slim string contains account secrets. Keep it private.
            </p>
          )}

          <textarea
            value={payload}
            onChange={(e) => onChangePayload(e.target.value)}
            readOnly={mode === "slim_export"}
            placeholder={
              mode === "slim_export"
                ? isExportingSlim
                  ? "Generating..."
                  : "Export string will appear here"
                : "Paste config string here"
            }
            className="w-full h-48 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 font-mono"
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="btn-mono px-4 py-2.5 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
          >
            Close
          </button>
          {mode === "slim_export" ? (
            <button
              type="button"
              onClick={onCopy}
              disabled={!payload || isExportingSlim}
              className="btn-mono px-4 py-2.5 text-sm font-medium rounded-lg bg-gray-900 hover:bg-gray-800 text-white transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {copied ? <DownloadRounded fontSize="small" /> : <ContentCopyOutlined fontSize="small" />}
              {copied ? "Copied" : "Copy String"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onImport}
              disabled={isImportingSlim}
              className="btn-mono px-4 py-2.5 text-sm font-medium rounded-lg bg-gray-900 hover:bg-gray-800 text-white transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              <FileUploadOutlined fontSize="small" />
              {isImportingSlim ? "Importing..." : "Import Missing Accounts"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
