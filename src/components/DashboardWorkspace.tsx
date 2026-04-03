import { PersonAddAltOutlined, SortRounded } from "@mui/icons-material";
import { AccountCard } from "./AccountCard";
import type { AccountWithUsage } from "../types";

type OtherAccountsSort = "deadline_asc" | "deadline_desc" | "remaining_desc" | "remaining_asc";

interface DashboardWorkspaceProps {
  loading: boolean;
  error: string | null;
  accounts: AccountWithUsage[];
  activeAccount?: AccountWithUsage;
  otherAccounts: AccountWithUsage[];
  sortedOtherAccounts: AccountWithUsage[];
  otherAccountsSort: OtherAccountsSort;
  onOtherAccountsSortChange: (value: OtherAccountsSort) => void;
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
}

function WorkspaceCountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="workspace-count-pill">
      <span className="workspace-count-pill__value">{value}</span>
      <span className="workspace-count-pill__label">{label}</span>
    </div>
  );
}

export function DashboardWorkspace({
  loading,
  error,
  accounts,
  activeAccount,
  otherAccounts,
  sortedOtherAccounts,
  otherAccountsSort,
  onOtherAccountsSortChange,
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
}: DashboardWorkspaceProps) {
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
        </div>
        </div>

      <div className="workspace-body">
        {loading && accounts.length === 0 ? (
          <div className="workspace-empty">
            <div className="workspace-empty__icon">
              <SortRounded fontSize="inherit" />
            </div>
            <h3>Loading accounts</h3>
            <p>Pulling account data and usage information now.</p>
          </div>
        ) : error ? (
          <div className="workspace-empty workspace-empty--error">
            <div className="workspace-empty__icon">
              <SortRounded fontSize="inherit" />
            </div>
            <h3>Failed to load accounts</h3>
            <p>{error}</p>
            <button type="button" onClick={onAddAccount} className="workspace-empty__button">
              Add account
            </button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="workspace-empty">
            <div className="workspace-empty__icon">
              <PersonAddAltOutlined fontSize="inherit" />
            </div>
            <h3>No accounts yet</h3>
            <p>Add your first Codex account to get started.</p>
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
                    <p>{otherAccounts.length} account{otherAccounts.length === 1 ? "" : "s"} available</p>
                  </div>

                  <div className="workspace-sort">
                    <SortRounded fontSize="small" />
                    <label htmlFor="other-accounts-sort">Sort</label>
                    <div className="workspace-sort__select-wrap">
                      <select
                        id="other-accounts-sort"
                        value={otherAccountsSort}
                        onChange={(e) =>
                          onOtherAccountsSortChange(e.target.value as OtherAccountsSort)
                        }
                      >
                        <option value="deadline_asc">Reset: earliest to latest</option>
                        <option value="deadline_desc">Reset: latest to earliest</option>
                        <option value="remaining_desc">% remaining: highest to lowest</option>
                        <option value="remaining_asc">% remaining: lowest to highest</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="workspace-grid">
                  {sortedOtherAccounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
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
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
