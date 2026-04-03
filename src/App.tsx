import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddAccountModal } from "./components";
import { ConfigModal } from "./components/ConfigModal";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { DashboardWorkspace } from "./components/DashboardWorkspace";
import { useAccounts } from "./hooks/useAccounts";
import type { CodexProcessInfo } from "./types";
import {
  exportFullBackupFile,
  importFullBackupFile,
  invokeBackend,
} from "./lib/platform";
import "./App.css";

type ToastVariant = "success" | "error" | "info";

function App() {
  const {
    accounts,
    loading,
    error,
    loadAccounts,
    refreshUsage,
    refreshSingleUsage,
    warmupAccount,
    warmupAllAccounts,
    switchAccount,
    deleteAccount,
    renameAccount,
    importFromFile,
    exportAccountsSlimText,
    importAccountsSlimText,
    startOAuthLogin,
    completeOAuthLogin,
    cancelOAuthLogin,
    loadMaskedAccountIds,
    saveMaskedAccountIds,
  } = useAccounts();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalMode, setConfigModalMode] = useState<"slim_export" | "slim_import">(
    "slim_export"
  );
  const [configPayload, setConfigPayload] = useState("");
  const [configModalError, setConfigModalError] = useState<string | null>(null);
  const [configCopied, setConfigCopied] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [processInfo, setProcessInfo] = useState<CodexProcessInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExportingSlim, setIsExportingSlim] = useState(false);
  const [isImportingSlim, setIsImportingSlim] = useState(false);
  const [isExportingFull, setIsExportingFull] = useState(false);
  const [isImportingFull, setIsImportingFull] = useState(false);
  const [isWarmingAll, setIsWarmingAll] = useState(false);
  const [warmingUpId, setWarmingUpId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    variant: ToastVariant;
    visible: boolean;
  } | null>(null);
  const [maskedAccounts, setMaskedAccounts] = useState<Set<string>>(new Set());
  const [otherAccountsSort, setOtherAccountsSort] = useState<
    "deadline_asc" | "deadline_desc" | "remaining_desc" | "remaining_asc"
  >("deadline_asc");
  const toastIdRef = useRef(0);
  const toastHideTimerRef = useRef<number | null>(null);
  const toastRemoveTimerRef = useRef<number | null>(null);

  const toggleMask = (accountId: string) => {
    setMaskedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      void saveMaskedAccountIds(Array.from(next));
      return next;
    });
  };

  const allMasked =
    accounts.length > 0 && accounts.every((account) => maskedAccounts.has(account.id));

  const toggleMaskAll = () => {
    setMaskedAccounts((prev) => {
      const shouldMaskAll = !accounts.every((account) => prev.has(account.id));
      const next = shouldMaskAll ? new Set(accounts.map((account) => account.id)) : new Set<string>();
      void saveMaskedAccountIds(Array.from(next));
      return next;
    });
  };

  const checkProcesses = useCallback(async () => {
    try {
      const info = await invokeBackend<CodexProcessInfo>("check_codex_processes");
      setProcessInfo(info);
    } catch (err) {
      console.error("Failed to check processes:", err);
    }
  }, []);

  useEffect(() => {
    checkProcesses();
    const interval = setInterval(checkProcesses, 3000);
    return () => clearInterval(interval);
  }, [checkProcesses]);

  useEffect(() => {
    loadMaskedAccountIds().then((ids) => {
      if (ids.length > 0) {
        setMaskedAccounts(new Set(ids));
      }
    });
  }, [loadMaskedAccountIds]);

  const clearToastTimers = useCallback(() => {
    if (toastHideTimerRef.current !== null) {
      window.clearTimeout(toastHideTimerRef.current);
      toastHideTimerRef.current = null;
    }
    if (toastRemoveTimerRef.current !== null) {
      window.clearTimeout(toastRemoveTimerRef.current);
      toastRemoveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearToastTimers();
    };
  }, [clearToastTimers]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success", duration = 2500) => {
      clearToastTimers();
      const id = ++toastIdRef.current;
      setToast({ id, message, variant, visible: true });

      toastHideTimerRef.current = window.setTimeout(() => {
        setToast((current) =>
          current && current.id === id ? { ...current, visible: false } : current
        );

        toastRemoveTimerRef.current = window.setTimeout(() => {
          setToast((current) => (current && current.id === id ? null : current));
        }, 190);
      }, duration);
    },
    [clearToastTimers]
  );

  const handleSwitch = async (accountId: string) => {
    await checkProcesses();
    if (processInfo && !processInfo.can_switch) {
      return;
    }

    try {
      setSwitchingId(accountId);
      await switchAccount(accountId);
    } catch (err) {
      console.error("Failed to switch account:", err);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (deleteConfirmId !== accountId) {
      setDeleteConfirmId(accountId);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      showToast("Click delete again to confirm removal", "info", 3000);
      return;
    }

    try {
      await deleteAccount(accountId);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Failed to delete account:", err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUsage();
      showToast("Usage refreshed successfully", "success", 2000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatWarmupError = (err: unknown) => {
    if (!err) return "Unknown error";
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  };

  const handleWarmupAccount = async (accountId: string, accountName: string) => {
    try {
      setWarmingUpId(accountId);
      await warmupAccount(accountId);
      showToast(`Warm-up sent for ${accountName}`, "success");
    } catch (err) {
      console.error("Failed to warm up account:", err);
      showToast(`Warm-up failed for ${accountName}: ${formatWarmupError(err)}`, "error");
    } finally {
      setWarmingUpId(null);
    }
  };

  const handleWarmupAll = async () => {
    try {
      setIsWarmingAll(true);
      const summary = await warmupAllAccounts();
      if (summary.total_accounts === 0) {
        showToast("No accounts available for warm-up", "error");
        return;
      }

      if (summary.failed_account_ids.length === 0) {
        showToast(
          `Warm-up sent for all ${summary.warmed_accounts} account${summary.warmed_accounts === 1 ? "" : "s"}`
        );
      } else {
        showToast(
          `Warmed ${summary.warmed_accounts}/${summary.total_accounts}. Failed: ${summary.failed_account_ids.length}`,
          "error"
        );
      }
    } catch (err) {
      console.error("Failed to warm up all accounts:", err);
      showToast(`Warm-up all failed: ${formatWarmupError(err)}`, "error");
    } finally {
      setIsWarmingAll(false);
    }
  };

  const handleExportSlimText = async () => {
    setConfigModalMode("slim_export");
    setConfigModalError(null);
    setConfigPayload("");
    setConfigCopied(false);
    setIsConfigModalOpen(true);

    try {
      setIsExportingSlim(true);
      const payload = await exportAccountsSlimText();
      setConfigPayload(payload);
      showToast(`Slim text exported (${accounts.length} accounts).`, "success");
    } catch (err) {
      console.error("Failed to export slim text:", err);
      const message = err instanceof Error ? err.message : String(err);
      setConfigModalError(message);
      showToast("Slim export failed", "error");
    } finally {
      setIsExportingSlim(false);
    }
  };

  const openImportSlimTextModal = () => {
    setConfigModalMode("slim_import");
    setConfigModalError(null);
    setConfigPayload("");
    setConfigCopied(false);
    setIsConfigModalOpen(true);
  };

  const handleImportSlimText = async () => {
    if (!configPayload.trim()) {
      setConfigModalError("Please paste the slim text string first.");
      return;
    }

    try {
      setIsImportingSlim(true);
      setConfigModalError(null);
      const summary = await importAccountsSlimText(configPayload);
      setMaskedAccounts(new Set());
      setIsConfigModalOpen(false);
      showToast(
        `Imported ${summary.imported_count}, skipped ${summary.skipped_count} (total ${summary.total_in_payload})`
      );
    } catch (err) {
      console.error("Failed to import slim text:", err);
      const message = err instanceof Error ? err.message : String(err);
      setConfigModalError(message);
      showToast("Slim import failed", "error");
    } finally {
      setIsImportingSlim(false);
    }
  };

  const handleExportFullFile = async () => {
    try {
      setIsExportingFull(true);
      const exported = await exportFullBackupFile();
      if (!exported) return;
      showToast("Full encrypted file exported.", "success");
    } catch (err) {
      console.error("Failed to export full encrypted file:", err);
      showToast("Full export failed", "error");
    } finally {
      setIsExportingFull(false);
    }
  };

  const handleImportFullFile = async () => {
    try {
      setIsImportingFull(true);
      const summary = await importFullBackupFile();
      if (!summary) return;
      const accountList = await loadAccounts();
      await refreshUsage(accountList);
      const maskedIds = await loadMaskedAccountIds();
      setMaskedAccounts(new Set(maskedIds));
      showToast(
        `Imported ${summary.imported_count}, skipped ${summary.skipped_count} (total ${summary.total_in_payload})`
      );
    } catch (err) {
      console.error("Failed to import full encrypted file:", err);
      showToast("Full import failed", "error");
    } finally {
      setIsImportingFull(false);
    }
  };

  const handleCopyConfigPayload = async () => {
    if (!configPayload) return;

    try {
      await navigator.clipboard.writeText(configPayload);
      setConfigCopied(true);
      setTimeout(() => setConfigCopied(false), 1500);
    } catch {
      setConfigModalError("Clipboard unavailable. Please copy manually.");
    }
  };

  const activeAccount = accounts.find((a) => a.is_active);
  const otherAccounts = accounts.filter((a) => !a.is_active);
  const hasRunningProcesses = Boolean(processInfo && processInfo.count > 0);

  const sortedOtherAccounts = useMemo(() => {
    const getResetDeadline = (resetAt: number | null | undefined) =>
      resetAt ?? Number.POSITIVE_INFINITY;

    const getRemainingPercent = (usedPercent: number | null | undefined) => {
      if (usedPercent === null || usedPercent === undefined) {
        return Number.NEGATIVE_INFINITY;
      }
      return Math.max(0, 100 - usedPercent);
    };

    return [...otherAccounts].sort((a, b) => {
      if (otherAccountsSort === "deadline_asc" || otherAccountsSort === "deadline_desc") {
        const deadlineDiff =
          getResetDeadline(a.usage?.primary_resets_at) -
          getResetDeadline(b.usage?.primary_resets_at);
        if (deadlineDiff !== 0) {
          return otherAccountsSort === "deadline_asc" ? deadlineDiff : -deadlineDiff;
        }
        const remainingDiff =
          getRemainingPercent(b.usage?.primary_used_percent) -
          getRemainingPercent(a.usage?.primary_used_percent);
        if (remainingDiff !== 0) return remainingDiff;
        return a.name.localeCompare(b.name);
      }

      const remainingDiff =
        getRemainingPercent(b.usage?.primary_used_percent) -
        getRemainingPercent(a.usage?.primary_used_percent);
      if (otherAccountsSort === "remaining_desc" && remainingDiff !== 0) {
        return remainingDiff;
      }
      if (otherAccountsSort === "remaining_asc" && remainingDiff !== 0) {
        return -remainingDiff;
      }
      const deadlineDiff =
        getResetDeadline(a.usage?.primary_resets_at) -
        getResetDeadline(b.usage?.primary_resets_at);
      if (deadlineDiff !== 0) return deadlineDiff;
      return a.name.localeCompare(b.name);
    });
  }, [otherAccounts, otherAccountsSort]);

  return (
    <div className="app-shell min-h-screen text-slate-900">
      <DashboardSidebar
        activeAccount={activeAccount}
        activeAccountMasked={Boolean(activeAccount && maskedAccounts.has(activeAccount.id))}
        processInfo={processInfo}
        totalAccounts={accounts.length}
        otherAccountsCount={otherAccounts.length}
        allMasked={allMasked}
        isRefreshing={isRefreshing}
        isWarmingAll={isWarmingAll}
        isExportingSlim={isExportingSlim}
        isImportingSlim={isImportingSlim}
        isExportingFull={isExportingFull}
        isImportingFull={isImportingFull}
        onToggleMaskAll={toggleMaskAll}
        onRefreshAll={handleRefresh}
        onWarmupAll={handleWarmupAll}
        onAddAccount={() => setIsAddModalOpen(true)}
        onExportSlimText={handleExportSlimText}
        onImportSlimText={openImportSlimTextModal}
        onExportFullFile={handleExportFullFile}
        onImportFullFile={handleImportFullFile}
      />

      <DashboardWorkspace
        loading={loading}
        error={error}
        accounts={accounts}
        activeAccount={activeAccount}
        otherAccounts={otherAccounts}
        sortedOtherAccounts={sortedOtherAccounts}
        otherAccountsSort={otherAccountsSort}
        onOtherAccountsSortChange={setOtherAccountsSort}
        onAddAccount={() => setIsAddModalOpen(true)}
        onSwitch={handleSwitch}
        onWarmupAccount={handleWarmupAccount}
        onDelete={handleDelete}
        onRefreshSingleUsage={refreshSingleUsage}
        onRenameAccount={renameAccount}
        switchingId={switchingId}
        warmingUpId={warmingUpId}
        isWarmingAll={isWarmingAll}
        hasRunningProcesses={hasRunningProcesses}
        maskedAccounts={maskedAccounts}
        onToggleMask={toggleMask}
      />

      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onImportFile={importFromFile}
        onStartOAuth={startOAuthLogin}
        onCompleteOAuth={completeOAuthLogin}
        onCancelOAuth={cancelOAuthLogin}
      />

      <ConfigModal
        isOpen={isConfigModalOpen}
        mode={configModalMode}
        payload={configPayload}
        error={configModalError}
        copied={configCopied}
        isExportingSlim={isExportingSlim}
        isImportingSlim={isImportingSlim}
        onClose={() => setIsConfigModalOpen(false)}
        onChangePayload={setConfigPayload}
        onCopy={handleCopyConfigPayload}
        onImport={handleImportSlimText}
      />

      {toast && (
        <div
          key={toast.id}
          className={`liquid-toast fixed top-6 left-1/2 z-[60] max-w-[calc(100vw-2rem)] px-4 py-3 text-sm ${
            toast.visible ? "liquid-toast--visible" : "liquid-toast--hidden"
          } ${
            toast.variant === "error"
              ? "liquid-toast--error"
              : toast.variant === "info"
                ? "liquid-toast--info"
                : "liquid-toast--success"
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
