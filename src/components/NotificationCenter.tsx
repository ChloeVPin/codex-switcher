import { useEffect, useRef } from "react";
import {
  CheckCircleOutlineRounded,
  CloseRounded,
  ErrorOutlineRounded,
  InfoOutlineRounded,
  NotificationsNoneRounded,
  WarningAmberRounded,
} from "@mui/icons-material";

export type NotificationVariant = "success" | "error" | "info" | "warning";

export interface AppNotification {
  id: number;
  message: string;
  variant: NotificationVariant;
  createdAt: number;
}

interface NotificationCenterProps {
  notifications: AppNotification[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onClearAll: () => void;
  onDismiss: (id: number) => void;
}

function formatRelativeTime(createdAt: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (diffSeconds < 10) return "Just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return new Date(createdAt).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

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

export function NotificationCenter({
  notifications,
  isOpen,
  onToggleOpen,
  onClearAll,
  onDismiss,
}: NotificationCenterProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        onToggleOpen();
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onToggleOpen();
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen, onToggleOpen]);

  const unreadCount = notifications.length;

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        onClick={onToggleOpen}
        className="notification-center__toggle"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} new` : ""}`}
      >
        <NotificationsNoneRounded fontSize="small" />
        <span>Notifications</span>
        {unreadCount > 0 && <span className="notification-center__badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-center__panel" role="dialog" aria-label="Notifications">
          <div className="notification-center__header">
            <div className="notification-center__heading">
              <p>Notifications</p>
              <span>Recent actions and system status</span>
            </div>

            {unreadCount > 0 && (
              <button type="button" onClick={onClearAll} className="notification-center__clear">
                Clear all
              </button>
            )}
          </div>

          <div className="notification-center__body">
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-center__item notification-center__item--${notification.variant}`}
                >
                  <div
                    className={`notification-center__icon notification-center__icon--${notification.variant}`}
                  >
                    {getVariantIcon(notification.variant)}
                  </div>

                  <div className="notification-center__content">
                    <div className="notification-center__content-head">
                      <span className="notification-center__label">
                        {getVariantLabel(notification.variant)}
                      </span>
                      <span className="notification-center__time">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="notification-center__message">{notification.message}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDismiss(notification.id)}
                    className="notification-center__dismiss"
                    aria-label="Dismiss notification"
                  >
                    <CloseRounded fontSize="inherit" />
                  </button>
                </div>
              ))
            ) : (
              <div className="notification-center__empty">
                <div className="notification-center__empty-icon">
                  <NotificationsNoneRounded fontSize="inherit" />
                </div>
                <p>No notifications yet</p>
                <span>Updates, account actions, and warnings will appear here.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
