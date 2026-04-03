import { type ReactNode } from "react";
import {
  AddRounded,
  BoltOutlined,
  ContentCopyOutlined,
  FileDownloadOutlined,
  FileUploadOutlined,
  FolderOpenOutlined,
  PersonOutlined,
  RefreshRounded,
  SettingsEthernetRounded,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import type { AccountWithUsage, CodexProcessInfo } from "../types";

interface SidebarActionButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "accent";
  title?: string;
}

function SidebarActionButton({
  label,
  icon,
  onClick,
  disabled,
  tone = "default",
  title,
}: SidebarActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`sidebar-action-button sidebar-action-button--${tone}`}
    >
      <span className="sidebar-action-button__icon">{icon}</span>
      <span className="sidebar-action-button__label">{label}</span>
    </button>
  );
}

function SidebarStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="sidebar-stat">
      <div className="sidebar-stat__icon">{icon}</div>
      <div className="sidebar-stat__body">
        <span className="sidebar-stat__label">{label}</span>
        <strong className="sidebar-stat__value">{value}</strong>
      </div>
    </div>
  );
}

function BlurredText({ children, blur }: { children: ReactNode; blur: boolean }) {
  return (
    <span className={`transition-all duration-200 ${blur ? "blur-sm select-none" : ""}`}>
      {children}
    </span>
  );
}

interface DashboardSidebarProps {
  activeAccount?: AccountWithUsage;
  activeAccountMasked: boolean;
  processInfo: CodexProcessInfo | null;
  totalAccounts: number;
  otherAccountsCount: number;
  allMasked: boolean;
  isRefreshing: boolean;
  isWarmingAll: boolean;
  isExportingSlim: boolean;
  isImportingSlim: boolean;
  isExportingFull: boolean;
  isImportingFull: boolean;
  onToggleMaskAll: () => void;
  onRefreshAll: () => void;
  onWarmupAll: () => void;
  onAddAccount: () => void;
  onExportSlimText: () => void;
  onImportSlimText: () => void;
  onExportFullFile: () => void;
  onImportFullFile: () => void;
}

export function DashboardSidebar({
  activeAccount,
  activeAccountMasked,
  processInfo,
  totalAccounts,
  otherAccountsCount,
  allMasked,
  isRefreshing,
  isWarmingAll,
  isExportingSlim,
  isImportingSlim,
  isExportingFull,
  isImportingFull,
  onToggleMaskAll,
  onRefreshAll,
  onWarmupAll,
  onAddAccount,
  onExportSlimText,
  onImportSlimText,
  onExportFullFile,
  onImportFullFile,
}: DashboardSidebarProps) {
  const runningCount = processInfo?.count ?? 0;
  const backgroundCount = processInfo?.background_count ?? 0;
  const activeName = activeAccount?.name ?? "No active account";
  const activeEmail = activeAccount?.email ?? "Add or switch to an account";
  const activePlan = activeAccount?.plan_type
    ? activeAccount.plan_type.charAt(0).toUpperCase() + activeAccount.plan_type.slice(1)
    : activeAccount?.auth_mode === "api_key"
      ? "API Key"
      : "Unknown";

  return (
    <aside className="dashboard-shell">
      <div className="dashboard-shell__inner">
        <div className="sidebar-brand">
          <div className="sidebar-brand__top">
            <div className="sidebar-brand__icon">
              <img src="/app-logo.png" alt="Codex Switcher logo" className="sidebar-brand__logo" />
            </div>
            <div className="sidebar-brand__copy">
              <h1>Codex Switcher</h1>
              <p>Multi-account control center</p>
            </div>
          </div>
          <div className="sidebar-brand__status">
            <span className={`sidebar-status-dot ${runningCount > 0 ? "is-warm" : "is-cold"}`} />
            <span>
              {runningCount > 0
                ? `${runningCount} Codex process${runningCount === 1 ? "" : "es"} running`
                : "No active Codex processes"}
            </span>
          </div>
        </div>

        <section className="sidebar-section">
          <div className="sidebar-section__heading">
            <span>Overview</span>
          </div>
          <div className="sidebar-stat-grid">
            <SidebarStat
              label="Accounts"
              value={String(totalAccounts)}
              icon={<PersonOutlined fontSize="inherit" />}
            />
            <SidebarStat
              label="Other accounts"
              value={String(otherAccountsCount)}
              icon={<FolderOpenOutlined fontSize="inherit" />}
            />
            <SidebarStat
              label="Running"
              value={String(runningCount)}
              icon={<SettingsEthernetRounded fontSize="inherit" />}
            />
            <SidebarStat
              label="Background"
              value={String(backgroundCount)}
              icon={<BoltOutlined fontSize="inherit" />}
            />
          </div>
        </section>

        <section className="sidebar-section">
          <div className="sidebar-section__heading">
            <span>Active Account</span>
          </div>
          <div className="sidebar-account-card">
            <div className="sidebar-account-card__title">
              <BlurredText blur={activeAccountMasked}>{activeName}</BlurredText>
            </div>
            <div className="sidebar-account-card__meta">
              <BlurredText blur={activeAccountMasked}>{activeEmail}</BlurredText>
            </div>
            <div className="sidebar-account-card__chips">
              <span className="sidebar-pill">{activePlan}</span>
              {activeAccount?.is_active ? (
                <span className="sidebar-pill sidebar-pill--success">Active</span>
              ) : (
                <span className="sidebar-pill sidebar-pill--muted">Inactive</span>
              )}
            </div>
          </div>
        </section>

        <section className="sidebar-section">
          <div className="sidebar-section__heading">
            <span>Quick Actions</span>
          </div>
          <div className="sidebar-action-stack">
            <SidebarActionButton
              label={allMasked ? "Show all info" : "Hide all info"}
              icon={allMasked ? <VisibilityOutlined fontSize="small" /> : <VisibilityOffOutlined fontSize="small" />}
              onClick={onToggleMaskAll}
              title={
                allMasked
                  ? "Show all info: reveal account names, emails, and usage details across the dashboard."
                  : "Hide all info: blur account names, emails, and usage details across the dashboard."
              }
            />
            <SidebarActionButton
              label={isRefreshing ? "Refreshing accounts" : "Refresh usage"}
              icon={<RefreshRounded fontSize="small" />}
              onClick={onRefreshAll}
              disabled={isRefreshing}
              title="Refresh usage: fetch the latest usage data for every account."
            />
            <SidebarActionButton
              label={isWarmingAll ? "Warm-up running" : "Warm-up all"}
              icon={<BoltOutlined fontSize="small" />}
              onClick={onWarmupAll}
              disabled={isWarmingAll || totalAccounts === 0}
              tone="accent"
              title={
                isWarmingAll
                  ? "Warm-up all: sending minimal requests to keep every account active."
                  : "Warm-up all: sends minimal requests to keep every account active."
              }
            />
            <SidebarActionButton
              label="Add account"
              icon={<AddRounded fontSize="small" />}
              onClick={onAddAccount}
              tone="primary"
              title="Add account: create a new account by OAuth login or by importing auth.json."
            />
          </div>
        </section>

        <section className="sidebar-section">
          <div className="sidebar-section__heading">
            <span>Backup</span>
          </div>
          <div className="sidebar-action-stack sidebar-action-stack--compact">
            <SidebarActionButton
              label={isExportingSlim ? "Exporting slim text" : "Export slim text"}
              icon={<FileDownloadOutlined fontSize="small" />}
              onClick={onExportSlimText}
              disabled={isExportingSlim}
              title="Export slim text: copy a compact text backup that can be restored later."
            />
            <SidebarActionButton
              label={isImportingSlim ? "Importing slim text" : "Import slim text"}
              icon={<FileUploadOutlined fontSize="small" />}
              onClick={onImportSlimText}
              disabled={isImportingSlim}
              title="Import slim text: restore accounts from a compact text backup."
            />
            <SidebarActionButton
              label={isExportingFull ? "Exporting full backup" : "Export full backup"}
              icon={<ContentCopyOutlined fontSize="small" />}
              onClick={onExportFullFile}
              disabled={isExportingFull}
              title="Export full backup: create an encrypted backup file with your account data."
            />
            <SidebarActionButton
              label={isImportingFull ? "Importing full backup" : "Import full backup"}
              icon={<FolderOpenOutlined fontSize="small" />}
              onClick={onImportFullFile}
              disabled={isImportingFull}
              title="Import full backup: restore from an encrypted backup file."
            />
          </div>
        </section>

      </div>
    </aside>
  );
}
