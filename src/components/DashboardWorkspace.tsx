import {
  ClearRounded,
  PersonAddAltOutlined,
  SearchRounded,
  SortRounded,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { useEffect, useRef, useState } from "react";
import { AccountCard } from "./AccountCard";
import type { AccountWithUsage } from "../types";

type OtherAccountsSort = "deadline_asc" | "deadline_desc" | "remaining_desc" | "remaining_asc";

interface DashboardWorkspaceProps {
  loading: boolean;
  error: string | null;
  accounts: AccountWithUsage[];
  activeAccount?: AccountWithUsage;
  otherAccounts: AccountWithUsage[];
  visibleOtherAccounts: AccountWithUsage[];
  otherAccountsSort: OtherAccountsSort;
  onOtherAccountsSortChange: (value: OtherAccountsSort) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onAddAccount: () => void;
  onSwitch: (accountId: string) => void;
  onWarmupAccount: (accountId: string, accountName: string) => Promise<void>;
  onDelete: (accountId: string) => void;
  onRefreshSingleUsage: (accountId: string) => Promise<void>;
  onRenameAccount: (accountId: string, newName: string) => Promise<void>;
  switchingId: string | null;
  warmingUpId: string | null;
  isWarmingAll: boolean;
  hasRunningProcesses: boolean;
  maskedAccounts: Set<string>;
  onToggleMask: (accountId: string) => void;
  attentionCount?: number;
  onAttentionClick?: () => void;
}

function WorkspaceCountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="workspace-count-pill">
      <span className="workspace-count-pill__value">{value}</span>
      <span className="workspace-count-pill__label">{label}</span>
    </div>
  );
}

const SORT_OPTIONS: Array<{ value: OtherAccountsSort; label: string }> = [
  { value: "deadline_asc", label: "Reset: earliest to latest" },
  { value: "deadline_desc", label: "Reset: latest to earliest" },
  { value: "remaining_desc", label: "% remaining: highest to lowest" },
  { value: "remaining_asc", label: "% remaining: lowest to highest" },
];

function getSortLabel(value: OtherAccountsSort): string {
  return SORT_OPTIONS.find((option) => option.value === value)?.label ?? SORT_OPTIONS[0].label;
}

function extractErrorDetail(error: string): string {
  const compact = error.replace(/\s+/g, " ").trim();
  const quotedMessage = compact.match(/"message"\s*:\s*"([^"]+)"/i);
  if (quotedMessage?.[1]) {
    return quotedMessage[1];
  }

  return compact;
}

function getWorkspaceErrorCopy(error: string) {
  const normalized = error.toLowerCase();
  const detail = extractErrorDetail(error);

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("refresh token") ||
    normalized.includes("sign in again") ||
    normalized.includes("401")
  ) {
    return {
      title: "One account needs to sign in again",
      detail:
        "Your accounts are still saved locally. Re-authenticate from Add Account or import a fresh auth.json to restore usage data.",
    };
  }

  if (
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch") ||
    normalized.includes("unavailable")
  ) {
    return {
      title: "We couldn't refresh account data",
      detail: "The app couldn't reach the service just now. Try again in a moment.",
    };
  }

  return {
    title: "We couldn't load account data",
    detail: detail.length > 180 ? `${detail.slice(0, 177).trimEnd()}...` : detail,
  };
}

export function DashboardWorkspace({
  loading,
  error,
  accounts,
  activeAccount,
  otherAccounts,
  visibleOtherAccounts,
  otherAccountsSort,
  onOtherAccountsSortChange,
  searchQuery,
  onSearchQueryChange,
  onAddAccount,
  onSwitch,
  onWarmupAccount,
  onDelete,
  onRefreshSingleUsage,
  onRenameAccount,
  switchingId,
  warmingUpId,
  isWarmingAll,
  hasRunningProcesses,
  maskedAccounts,
  onToggleMask,
  attentionCount = 0,
  onAttentionClick,
}: DashboardWorkspaceProps) {
  const hasAccounts = accounts.length > 0;
  const workspaceError = error ? getWorkspaceErrorCopy(error) : null;
  const isInitialLoading = loading && !hasAccounts;
  const hasSearch = searchQuery.trim().length > 0;
  const visibleCount = visibleOtherAccounts.length;
  const hasAttention = attentionCount > 0;
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSortOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (sortRef.current && target && !sortRef.current.contains(target)) {
        setIsSortOpen(false);
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isSortOpen]);

  return (
    <main className="workspace-shell">
      <div className="workspace-header">
        <div className="workspace-header__copy">
          <p className="workspace-header__eyebrow">Accounts</p>
          <h2 className="workspace-header__title">Manage Codex identities</h2>
          <p className="workspace-header__subtitle">
            Switch, warm up, refresh, and protect account details from one view.
          </p>
        </div>

        <div className="workspace-header__meta">
          <WorkspaceCountPill label="Total" value={accounts.length} />
          <WorkspaceCountPill label="Active" value={activeAccount ? 1 : 0} />
          <WorkspaceCountPill label="Other" value={otherAccounts.length} />
          {hasAttention ? (
            <button
              type="button"
              className="workspace-count-pill workspace-count-pill--action"
              onClick={onAttentionClick}
            >
              <span className="workspace-count-pill__value">{attentionCount}</span>
              <span className="workspace-count-pill__label">Attention</span>
            </button>
          ) : (
            <div className="workspace-count-pill">
              <span className="workspace-count-pill__value">0</span>
              <span className="workspace-count-pill__label">Attention</span>
            </div>
          )}
        </div>
      </div>

      <div className="workspace-body">
        {isInitialLoading ? (
          <div className="workspace-empty workspace-empty--loading">
            <div className="workspace-empty__icon">
              <SortRounded fontSize="inherit" />
            </div>
            <h3>Syncing accounts</h3>
            <p>Checking saved logins and usage data. This usually takes a moment.</p>
            <div className="workspace-empty__loading" aria-hidden="true">
              <div className="workspace-empty__loading-line" />
              <div className="workspace-empty__loading-line workspace-empty__loading-line--short" />
            </div>
          </div>
        ) : !hasAccounts && workspaceError ? (
          <div className="workspace-empty workspace-empty--error">
            <div className="workspace-empty__icon workspace-empty__icon--error">
              <WarningAmberOutlined fontSize="inherit" />
            </div>
            <h3>{workspaceError.title}</h3>
            <p>{workspaceError.detail}</p>
            <button type="button" onClick={onAddAccount} className="workspace-empty__button">
              Add account
            </button>
          </div>
        ) : !hasAccounts ? (
          <div className="workspace-empty">
            <div className="workspace-empty__icon">
              <PersonAddAltOutlined fontSize="inherit" />
            </div>
            <h3>No accounts yet</h3>
            <p>Add a ChatGPT login or import an auth.json file to get started.</p>
            <button type="button" onClick={onAddAccount} className="workspace-empty__button">
              Add account
            </button>
          </div>
        ) : (
          <div className="workspace-content">
            {activeAccount && (
              <section className="workspace-section">
                <div className="workspace-section__heading">
                  <h3>Active Account</h3>
                  <span className="workspace-section__count">1</span>
                </div>
                <AccountCard
                  account={activeAccount}
                  index={0}
                  onSwitch={() => {}}
                  onWarmup={() => onWarmupAccount(activeAccount.id, activeAccount.name)}
                  onDelete={() => onDelete(activeAccount.id)}
                  onRefresh={() => onRefreshSingleUsage(activeAccount.id)}
                  onRename={(newName) => onRenameAccount(activeAccount.id, newName)}
                  switching={switchingId === activeAccount.id}
                  switchDisabled={hasRunningProcesses}
                  warmingUp={isWarmingAll || warmingUpId === activeAccount.id}
                  masked={maskedAccounts.has(activeAccount.id)}
                  onToggleMask={() => onToggleMask(activeAccount.id)}
                />
              </section>
            )}

            {otherAccounts.length > 0 && (
              <section className="workspace-section">
                <div className="workspace-section__heading workspace-section__heading--stack">
                  <div>
                    <h3>Other Accounts</h3>
                    <p>
                      {hasSearch
                        ? `${visibleCount} of ${otherAccounts.length} account${otherAccounts.length === 1 ? "" : "s"} shown`
                        : `${otherAccounts.length} account${otherAccounts.length === 1 ? "" : "s"} available`}
                    </p>
                  </div>

                  <div className="workspace-controls">
                      <div className="workspace-search">
                        <SearchRounded fontSize="small" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => onSearchQueryChange(e.target.value)}
                          placeholder="Search accounts"
                          aria-label="Search accounts"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        {hasSearch && (
                          <button
                            type="button"
                          onClick={() => onSearchQueryChange("")}
                          aria-label="Clear search"
                        >
                          <ClearRounded fontSize="inherit" />
                        </button>
                      )}
                    </div>

                      <div className="workspace-sort" ref={sortRef}>
                        <button
                          type="button"
                          className="workspace-sort__button"
                          onClick={() => setIsSortOpen((current) => !current)}
                          aria-haspopup="menu"
                          aria-expanded={isSortOpen}
                          aria-label={`Sort accounts, current ${getSortLabel(otherAccountsSort)}`}
                        >
                          <span className="workspace-sort__label">
                            <SortRounded fontSize="small" />
                            <span>Sort</span>
                          </span>
                          <span className="workspace-sort__value">{getSortLabel(otherAccountsSort)}</span>
                          <span className="workspace-sort__caret" aria-hidden="true" />
                        </button>
                      {isSortOpen && (
                        <div className="workspace-sort__menu" role="menu" aria-label="Sort accounts">
                          {SORT_OPTIONS.map((option) => {
                            const active = option.value === otherAccountsSort;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                className={`workspace-sort__option ${active ? "is-active" : ""}`}
                                onClick={() => {
                                  onOtherAccountsSortChange(option.value);
                                  setIsSortOpen(false);
                                }}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {visibleOtherAccounts.length > 0 ? (
                  <div className="workspace-grid">
                    {visibleOtherAccounts.map((account, index) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        index={activeAccount ? index + 1 : index}
                        onSwitch={() => onSwitch(account.id)}
                        onWarmup={() => onWarmupAccount(account.id, account.name)}
                        onDelete={() => onDelete(account.id)}
                        onRefresh={() => onRefreshSingleUsage(account.id)}
                        onRename={(newName) => onRenameAccount(account.id, newName)}
                        switching={switchingId === account.id}
                        switchDisabled={hasRunningProcesses}
                        warmingUp={isWarmingAll || warmingUpId === account.id}
                        masked={maskedAccounts.has(account.id)}
                        onToggleMask={() => onToggleMask(account.id)}
                      />
                    ))}
                  </div>
                ) : hasSearch ? (
                  <div className="workspace-empty workspace-empty--search">
                    <div className="workspace-empty__icon">
                      <SearchRounded fontSize="inherit" />
                    </div>
                    <h3>No matches</h3>
                    <p>
                      No accounts match "{searchQuery.trim()}". Try a name, email, plan, or state.
                    </p>
                    <button
                      type="button"
                      onClick={() => onSearchQueryChange("")}
                      className="workspace-empty__button"
                    >
                      Clear search
                    </button>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
