// ============================================================
// Toast notifications — replaces blocking alert() (SEC-2 fix)
// ============================================================

import { useNotifications, type NotificationType } from "../store/notifications";
import { CloseIcon, WarningIcon, InfoIcon } from "./icons";

const STYLES: Record<NotificationType, { bg: string; icon: React.ReactNode }> = {
  error: { bg: "#f38ba8", icon: <CloseIcon size={32} /> },
  warning: { bg: "#f9e2af", icon: <WarningIcon size={32} /> },
  info: { bg: "#89b4fa", icon: <InfoIcon size={32} /> },
};

export default function ToastContainer() {
  const notifications = useNotifications((s) => s.notifications);
  const dismiss = useNotifications((s) => s.dismiss);

  if (notifications.length === 0) return null;

  return (
    <div className="toast-container">
      {notifications.map((n) => {
        const style = STYLES[n.type];
        return (
          // FIX (LOW-18-40): Add toast-enter animation class for fade-in/out
          <div
            key={n.id}
            className="toast toast-enter"
            style={{ borderLeftColor: style.bg }}
            onClick={() => dismiss(n.id)}
          >
            <span className="toast-icon" style={{ color: style.bg }}>
              {style.icon}
            </span>
            <span className="toast-msg">{n.message}</span>
          </div>
        );
      })}
    </div>
  );
}
