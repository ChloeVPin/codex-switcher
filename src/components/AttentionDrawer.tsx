import { useEffect } from "react";
import {
  CheckCircleOutlineRounded,
  CloseRounded,
  ErrorOutlineRounded,
  InfoOutlineRounded,
  WarningAmberRounded,
} from "@mui/icons-material";

export interface AttentionAccountItem {
  id: string;
  name: string;
  email: string | null;
  issue: string;
}

interface AttentionDrawerProps {
  isOpen: boolean;
  attentionAccounts: AttentionAccountItem[];
  onClose: () => void;
  onAddAccount: () => void;
}

function classifyAccountIssue(issue: string) {
  const normalized = issue.toLowerCase();
  if (
    normalized.includes("unauthorized") ||
    normalized.includes("refresh token") ||
    normalized.includes("sign in again") ||
    normalized.includes("401")
  ) {
    return "error";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch") ||
    normalized.includes("unavailable")
  ) {
    return "warning";
  }

  return "info";
}

function summarizeAccountIssue(issue: string): string {
  const normalized = issue.toLowerCase();
  if (
    normalized.includes("unauthorized") ||
    normalized.includes("refresh token") ||
    normalized.includes("sign in again") ||
    normalized.includes("401")
  ) {
    return "This saved session needs to sign in again.";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch") ||
    normalized.includes("unavailable")
  ) {
    return "We couldn't refresh this session right now.";
  }

  const quotedMessage = issue.match(/"message"\s*:\s*"([^"]+)"/i);
  if (quotedMessage?.[1]) {
    return quotedMessage[1];
  }

  const compact = issue.replace(/\s+/g, " ").trim();
  return compact.length > 140 ? `${compact.slice(0, 137).trimEnd()}...` : compact;
}

function getVariantIcon(variant: "success" | "error" | "info" | "warning") {
  switch (variant) {
    case "success":
      return <CheckCircleOutlineRounded fontSize="inherit" />;
    case "warning":
      return <WarningAmberRounded fontSize="inherit" />;
    case "error":
      return <ErrorOutlineRounded fontSize="inherit" />;
    default:
      return <InfoOutlineRounded fontSize="inherit" />;
  }
}

export function AttentionDrawer({ isOpen, attentionAccounts, onClose, onAddAccount }: AttentionDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="attention-drawer" role="dialog" aria-modal="true" aria-label="Attention center">
      <button
        type="button"
        className="attention-drawer__backdrop"
        aria-label="Close attention center"
        onClick={onClose}
      />

      <aside className="attention-drawer__panel">
        <div className="attention-drawer__header">
          <div className="attention-drawer__titleblock">
            <p className="attention-drawer__eyebrow">Attention</p>
            <h2 className="attention-drawer__title">Everything that needs a look</h2>
            <p className="attention-drawer__subtitle">
              Warnings and account issues in one solid panel.
            </p>
          </div>

          <button
            type="button"
            className="attention-drawer__close"
            onClick={onClose}
            aria-label="Close attention center"
          >
            <CloseRounded fontSize="small" />
          </button>
        </div>

        <div className="attention-drawer__content">
          <section className="attention-drawer__section">
            <div className="attention-drawer__section-head">
              <p>Saved sessions needing attention</p>
              <span>{attentionAccounts.length}</span>
            </div>

            {attentionAccounts.length > 0 ? (
              <div className="attention-drawer__list">
                {attentionAccounts.map((account) => {
                  const variant = classifyAccountIssue(account.issue) as "success" | "error" | "info" | "warning";
                  return (
                    <article key={account.id} className={`attention-drawer__item attention-drawer__item--${variant}`}>
                      <div className={`attention-drawer__icon attention-drawer__icon--${variant}`}>
                        {getVariantIcon(variant)}
                      </div>
                      <div className="attention-drawer__copy">
                        <div className="attention-drawer__item-head">
                          <strong>{account.name}</strong>
                          {account.email && <span>{account.email}</span>}
                        </div>
                        <p>{summarizeAccountIssue(account.issue)}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="attention-drawer__empty">
                <div className="attention-drawer__empty-icon">
                  <CheckCircleOutlineRounded fontSize="inherit" />
                </div>
                <p>No account issues right now</p>
                <span>All saved sessions are currently readable.</span>
              </div>
            )}
          </section>
        </div>

        <div className="attention-drawer__footer">
          <button type="button" className="attention-drawer__primary" onClick={onAddAccount}>
            Add account
          </button>
        </div>
      </aside>
    </div>
  );
}
