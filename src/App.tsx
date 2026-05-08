import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddAccountModal } from "./components";
import { ConfigModal } from "./components/ConfigModal";
import { AttentionDrawer, type AttentionAccountItem } from "./components/AttentionDrawer";
import { ToastHost, type AppNotification, type NotificationVariant } from "./components/ToastHost";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { DashboardWorkspace } from "./components/DashboardWorkspace";
import { UpdateChecker } from "./components/UpdateChecker";
import { useAccounts } from "./hooks/useAccounts";
import type { CodexProcessInfo } from "./types";
import {
  exportFullBackupFile,
  importFullBackupFile,
  invokeBackend,
} from "./lib/platform";
import "./App.css";

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function accountSearchBlob(account: {
  name: string;
  email: string | null;
  plan_type: string | null;
  auth_mode: string;
  usage?: { error?: string | null } | undefined;
}): string {
  return [
    account.name,
    account.email,
    account.plan_type,
    account.auth_mode,
    account.usage?.error,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isAttentionDrawerOpen, setIsAttentionDrawerOpen] = useState(false);
  const [maskedAccounts, setMaskedAccounts] = useState<Set<string>>(new Set());
  const [otherAccountsSort, setOtherAccountsSort] = useState<
    "deadline_asc" | "deadline_desc" | "remaining_desc" | "remaining_asc"
  >("deadline_asc");
  const notificationIdRef = useRef(0);
  const notificationSignatureRef = useRef<{ signature: string; at: number } | null>(null);
  const staleAuthNoticeRef = useRef(0);

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

  const addNotification = useCallback(
    (message: string, variant: NotificationVariant = "success") => {
      const now = Date.now();
      const signature = `${variant}:${message}`;
      const last = notificationSignatureRef.current;
      if (last && last.signature === signature && now - last.at < 2500) {
        return;
      }

      notificationSignatureRef.current = { signature, at: now };
      const id = ++notificationIdRef.current;

      setNotifications((current) => [
        ...current,
        { id, message, variant, createdAt: now },
      ]);
    },
    []
  );

  const consumeNotification = useCallback((id: number) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

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
      addNotification("Click delete again to confirm removal", "info");
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
      addNotification("Usage refreshed successfully", "success");
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
      addNotification(`Warm-up sent for ${accountName}`, "success");
    } catch (err) {
      console.error("Failed to warm up account:", err);
      addNotification(`Warm-up failed for ${accountName}: ${formatWarmupError(err)}`, "error");
    } finally {
      setWarmingUpId(null);
    }
  };

  const handleWarmupAll = async () => {
    try {
      setIsWarmingAll(true);
      const summary = await warmupAllAccounts();
      if (summary.total_accounts === 0) {
        addNotification("No accounts available for warm-up", "error");
        return;
      }

      if (summary.failed_account_ids.length === 0) {
        addNotification(
          `Warm-up sent for all ${summary.warmed_accounts} account${summary.warmed_accounts === 1 ? "" : "s"}`,
          "success"
        );
      } else {
        addNotification(
          `Warmed ${summary.warmed_accounts}/${summary.total_accounts}. Failed: ${summary.failed_account_ids.length}`,
          "error"
        );
      }
    } catch (err) {
      console.error("Failed to warm up all accounts:", err);
      addNotification(`Warm-up all failed: ${formatWarmupError(err)}`, "error");
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
      addNotification(`Slim text exported (${accounts.length} accounts).`, "success");
    } catch (err) {
      console.error("Failed to export slim text:", err);
      const message = err instanceof Error ? err.message : String(err);
      setConfigModalError(message);
      addNotification("Slim export failed", "error");
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
      addNotification(
        `Imported ${summary.imported_count}, skipped ${summary.skipped_count} (total ${summary.total_in_payload})`,
        "success"
      );
    } catch (err) {
      console.error("Failed to import slim text:", err);
      const message = err instanceof Error ? err.message : String(err);
      setConfigModalError(message);
      addNotification("Slim import failed", "error");
    } finally {
      setIsImportingSlim(false);
    }
  };

  const handleExportFullFile = async () => {
    try {
      setIsExportingFull(true);
      const exported = await exportFullBackupFile();
      if (!exported) return;
      addNotification("Full encrypted file exported.", "success");
    } catch (err) {
      console.error("Failed to export full encrypted file:", err);
      addNotification("Full export failed", "error");
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
      addNotification(
        `Imported ${summary.imported_count}, skipped ${summary.skipped_count} (total ${summary.total_in_payload})`,
        "success"
      );
    } catch (err) {
      console.error("Failed to import full encrypted file:", err);
      addNotification("Full import failed", "error");
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
  const normalizedQuery = normalizeSearchText(searchQuery);

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

  const visibleOtherAccounts = useMemo(() => {
    if (!normalizedQuery) return sortedOtherAccounts;
    return sortedOtherAccounts.filter((account) => accountSearchBlob(account).includes(normalizedQuery));
  }, [normalizedQuery, sortedOtherAccounts]);

  const attentionAccounts = useMemo<AttentionAccountItem[]>(
    () =>
      accounts
        .filter((account) => {
          const error = account.usage?.error?.toLowerCase() ?? "";
          return (
            error.includes("unauthorized") ||
            error.includes("refresh token") ||
            error.includes("sign in again") ||
            error.includes("401")
          );
        })
        .map((account) => ({
          id: account.id,
          name: account.name,
          email: account.email,
          issue:
            account.usage?.error?.trim() ||
            "This saved session needs to sign in again before usage can refresh.",
        })),
    [accounts]
  );

  const staleAuthCount = useMemo(
    () => attentionAccounts.length,
    [attentionAccounts]
  );

  useEffect(() => {
    if (staleAuthCount > 0 && staleAuthNoticeRef.current !== staleAuthCount) {
      staleAuthNoticeRef.current = staleAuthCount;
      addNotification(
        `${staleAuthCount} saved session${staleAuthCount === 1 ? "" : "s"} need sign-in again.`,
        "warning"
      );
      return;
    }

    if (staleAuthCount === 0) {
      staleAuthNoticeRef.current = 0;
    }
  }, [addNotification, staleAuthCount]);

  return (
    <div className="app-shell min-h-screen">
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
        visibleOtherAccounts={visibleOtherAccounts}
        otherAccountsSort={otherAccountsSort}
        onOtherAccountsSortChange={setOtherAccountsSort}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
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
        attentionCount={staleAuthCount}
        onAttentionClick={() => setIsAttentionDrawerOpen(true)}
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

      <UpdateChecker onNotify={addNotification} />

      <AttentionDrawer
        isOpen={isAttentionDrawerOpen}
        attentionAccounts={attentionAccounts}
        onClose={() => setIsAttentionDrawerOpen(false)}
        onAddAccount={() => setIsAddModalOpen(true)}
      />

      <ToastHost
        notifications={notifications}
        onConsume={consumeNotification}
      />

    </div>
  );
}

export default App;
