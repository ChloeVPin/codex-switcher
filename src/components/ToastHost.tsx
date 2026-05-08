import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleOutlineRounded,
  CloseRounded,
  ErrorOutlineRounded,
  InfoOutlineRounded,
  WarningAmberRounded,
} from "@mui/icons-material";

export type NotificationVariant = "success" | "error" | "info" | "warning";

export interface AppNotification {
  id: number;
  message: string;
  variant: NotificationVariant;
  createdAt: number;
}

interface ToastHostProps {
  notifications: AppNotification[];
  onConsume: (id: number) => void;
}

const TOAST_EXIT_MS = 220;
const TOAST_DISPLAY_MS: Record<NotificationVariant, number> = {
  success: 2400,
  info: 2600,
  warning: 3600,
  error: 4600,
};

function getVariantIcon(variant: NotificationVariant) {
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

function getVariantLabel(variant: NotificationVariant): string {
  switch (variant) {
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    default:
      return "Info";
  }
}

function getDisplayDuration(notification: AppNotification): number {
  const baseDuration = TOAST_DISPLAY_MS[notification.variant];
  const lengthBonus = Math.min(2200, Math.max(0, notification.message.length - 70) * 18);
  return baseDuration + lengthBonus;
}

export function ToastHost({ notifications, onConsume }: ToastHostProps) {
  const [activeToastId, setActiveToastId] = useState<number | null>(null);
  const [toastPhase, setToastPhase] = useState<"idle" | "enter" | "visible" | "exit">("idle");
  const visibleTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (visibleTimerRef.current !== null) {
      window.clearTimeout(visibleTimerRef.current);
      visibleTimerRef.current = null;
    }

    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const activeToast = useMemo(
    () => notifications.find((notification) => notification.id === activeToastId) ?? null,
    [activeToastId, notifications]
  );

  const dismissActiveToast = useCallback(() => {
    if (!activeToast || toastPhase === "exit") return;

    clearTimers();
    setToastPhase("exit");
    exitTimerRef.current = window.setTimeout(() => {
      onConsume(activeToast.id);
      setActiveToastId((current) => (current === activeToast.id ? null : current));
      setToastPhase("idle");
    }, TOAST_EXIT_MS);
  }, [activeToast, clearTimers, onConsume, toastPhase]);

  useEffect(() => {
    if (activeToastId !== null) {
      const stillQueued = notifications.some((notification) => notification.id === activeToastId);
      if (!stillQueued) {
        clearTimers();
        setActiveToastId(null);
        setToastPhase("idle");
      }
      return;
    }

    if (notifications.length > 0) {
      setActiveToastId(notifications[0].id);
    }
  }, [activeToastId, clearTimers, notifications]);

  useEffect(() => {
    if (!activeToast) return;

    clearTimers();
    setToastPhase("enter");

    const enterTimer = window.setTimeout(() => setToastPhase("visible"), 20);
    visibleTimerRef.current = window.setTimeout(() => {
      setToastPhase("exit");
      exitTimerRef.current = window.setTimeout(() => {
        onConsume(activeToast.id);
        setActiveToastId((current) => (current === activeToast.id ? null : current));
        setToastPhase("idle");
      }, TOAST_EXIT_MS);
    }, getDisplayDuration(activeToast));

    return () => {
      window.clearTimeout(enterTimer);
      clearTimers();
    };
  }, [activeToast, clearTimers, onConsume]);

  if (!activeToast) return null;

  return (
    <div className="app-toast-host" aria-live="polite" aria-atomic="true">
      <div
        className={`app-toast app-toast--${toastPhase} app-toast--${activeToast.variant}`}
        role={activeToast.variant === "error" ? "alert" : "status"}
      >
        <div className={`app-toast__icon app-toast__icon--${activeToast.variant}`}>
          {getVariantIcon(activeToast.variant)}
        </div>

        <div className="app-toast__copy">
          <div className="app-toast__head">
            <strong>{getVariantLabel(activeToast.variant)}</strong>
            <span>Now</span>
          </div>
          <p>{activeToast.message}</p>
        </div>

        <button
          type="button"
          className="app-toast__dismiss"
          onClick={dismissActiveToast}
          aria-label="Dismiss notification"
        >
          <CloseRounded fontSize="inherit" />
        </button>
      </div>
    </div>
  );
}
