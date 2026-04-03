import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BoltOutlined,
  CheckCircleOutline,
  DeleteOutline,
  RefreshRounded,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import type { AccountWithUsage } from "../types";
import { UsageBar } from "./UsageBar";

type WarmupTone = "green" | "orange" | "red" | "neutral";

interface AccountCardProps {
  account: AccountWithUsage;
  onSwitch: () => void;
  onWarmup: () => Promise<void>;
  onDelete: () => void;
  onRefresh: () => Promise<void>;
  onRename: (newName: string) => Promise<void>;
  switching?: boolean;
  switchDisabled?: boolean;
  warmingUp?: boolean;
  masked?: boolean;
  onToggleMask?: () => void;
}

function formatLastRefresh(date: Date | null): string {
  if (!date) return "Never";
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 5) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

function BlurredText({ children, blur }: { children: ReactNode; blur: boolean }) {
  return (
    <span
      className={`transition-all duration-200 select-none ${blur ? "blur-sm" : ""}`}
      style={blur ? { userSelect: "none" } : undefined}
    >
      {children}
    </span>
  );
}

function getWarmupTone(usage?: AccountWithUsage["usage"]): WarmupTone {
  if (!usage || usage.error) return "neutral";

  const now = Math.floor(Date.now() / 1000);
  const resetAt = usage.primary_resets_at;

  if (resetAt !== null && resetAt !== undefined) {
    const secondsLeft = resetAt - now;
    if (secondsLeft <= 10 * 60) return "red";
    if (secondsLeft <= 30 * 60) return "orange";
    return "green";
  }

  const remainingPercent =
    usage.primary_used_percent === null || usage.primary_used_percent === undefined
      ? null
      : Math.max(0, 100 - usage.primary_used_percent);

  if (remainingPercent === null) return "neutral";
  if (remainingPercent <= 10) return "red";
  if (remainingPercent <= 30) return "orange";
  return "green";
}

export function AccountCard({
  account,
  onSwitch,
  onWarmup,
  onDelete,
  onRefresh,
  onRename,
  switching,
  switchDisabled,
  warmingUp,
  masked = false,
  onToggleMask,
}: AccountCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    account.usage && !account.usage.error ? new Date() : null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(account.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastRefresh(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRename = async () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== account.name) {
      try {
        await onRename(trimmed);
      } catch {
        setEditName(account.name);
      }
    } else {
      setEditName(account.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setEditName(account.name);
      setIsEditing(false);
    }
  };

  const planDisplay = account.plan_type
    ? account.plan_type.charAt(0).toUpperCase() + account.plan_type.slice(1)
    : account.auth_mode === "api_key"
      ? "API Key"
      : "Unknown";

  const planColors: Record<string, string> = {
    pro: "bg-indigo-50 text-indigo-700 border-indigo-200",
    plus: "bg-emerald-50 text-emerald-700 border-emerald-200",
    team: "bg-blue-50 text-blue-700 border-blue-200",
    enterprise: "bg-amber-50 text-amber-700 border-amber-200",
    free: "bg-gray-50 text-gray-600 border-gray-200",
    api_key: "bg-orange-50 text-orange-700 border-orange-200",
  };

  const planKey = account.plan_type?.toLowerCase() || "api_key";
  const planColorClass = planColors[planKey] || planColors.free;
  const warmupTone = getWarmupTone(account.usage);
  const warmupToneClasses: Record<WarmupTone, string> = {
    green: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200",
    orange: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200",
    red: "bg-red-50 hover:bg-red-100 text-red-700 border-red-200",
    neutral: "bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-200",
  };
  const warmupTitle =
    warmupTone === "green"
      ? "Warm-up: good for now. Sends a minimal request to keep this account active."
      : warmupTone === "orange"
        ? "Warm-up: almost due. Sends a minimal request to keep this account active."
        : warmupTone === "red"
          ? "Warm-up: send now. Sends a minimal request to keep this account active."
          : "Warm-up: sends a minimal request to keep this account active.";

  return (
    <div
      className={`liquid-account-card relative rounded-xl border p-5 transition-all duration-200 ${
        account.is_active
          ? "bg-white border-emerald-400 shadow-sm"
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {account.is_active && (
              <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                <CheckCircleOutline fontSize="inherit" />
                Active
              </span>
            )}
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyDown}
                className="font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded border border-gray-300 focus:outline-none focus:border-gray-500 w-full"
              />
            ) : (
              <h3
                className="font-semibold text-gray-900 truncate cursor-pointer hover:text-gray-600"
                onClick={() => {
                  if (masked) return;
                  setEditName(account.name);
                  setIsEditing(true);
                }}
                title={masked ? undefined : "Click to rename"}
              >
                <BlurredText blur={masked}>{account.name}</BlurredText>
              </h3>
            )}
          </div>
          {account.email && (
            <p className="text-sm text-gray-500 truncate">
              <BlurredText blur={masked}>{account.email}</BlurredText>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleMask && (
            <button
              onClick={onToggleMask}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title={masked ? "Show info" : "Hide info"}
            >
              {masked ? (
                <VisibilityOffOutlined fontSize="small" />
              ) : (
                <VisibilityOutlined fontSize="small" />
              )}
            </button>
          )}
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${planColorClass}`}>
            {planDisplay}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <UsageBar usage={account.usage} loading={isRefreshing || account.usageLoading} />
      </div>

      <div className="text-xs text-gray-400 mb-3">Last updated: {formatLastRefresh(lastRefresh)}</div>

      <div className="flex gap-2">
        {account.is_active ? (
          <button
            disabled
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-500 border border-gray-200 cursor-default"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircleOutline fontSize="small" />
              Active
            </span>
          </button>
        ) : (
          <button
            onClick={onSwitch}
            disabled={switching || switchDisabled}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              switchDisabled
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-gray-900 hover:bg-gray-800 text-white"
            }`}
            title={switchDisabled ? "Close all Codex processes first" : undefined}
          >
            {switching ? "Switching..." : switchDisabled ? "Codex Running" : "Switch"}
          </button>
        )}

        <button
          onClick={() => {
            void onWarmup();
          }}
          disabled={warmingUp}
          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
            warmingUp
              ? "bg-amber-100 text-amber-500"
              : `${warmupToneClasses[warmupTone]} border`
          }`}
          title={warmingUp ? "Warm-up: sending a minimal request to keep this account active." : warmupTitle}
        >
          <BoltOutlined fontSize="small" />
        </button>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
            isRefreshing
              ? "bg-gray-200 text-gray-400"
              : "bg-gray-100 hover:bg-gray-200 text-gray-600"
          }`}
          title="Refresh usage: fetch the latest usage data for this account."
        >
          <RefreshRounded className={isRefreshing ? "animate-spin inline-block" : ""} fontSize="small" />
        </button>

        <button
          onClick={onDelete}
          className="px-3 py-2 text-sm rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
          title="Remove account: delete this account from the local switcher."
        >
          <DeleteOutline fontSize="small" />
        </button>
      </div>
    </div>
  );
}
