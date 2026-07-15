// ============================================================
// Toast notifications — replaces blocking alert() (SEC-2 fix)
// ============================================================

import { useNotifications, type NotificationType } from "../store/notifications";

const STYLES: Record<NotificationType, { bg: string; icon: string }> = {
  error: { bg: "#f38ba8", icon: "✕" },
  warning: { bg: "#f9e2af", icon: "⚠" },
  info: { bg: "#89b4fa", icon: "ℹ" },
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
          <div
            key={n.id}
            className="toast"
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
