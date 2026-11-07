import { useTranslation } from "react-i18next";

/**
 * Подтверждение необратимого / разрушительного действия (UX-AUDIT-2: «Очистить сцену»).
 * Фокус — на «Отмена» (Enter не подтверждает случайно); Esc и клик по фону — отмена.
 * Клавиши не уходят в глобальные сочетания App (Delete, Ctrl+Z, … под модалкой).
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="text-modal-backdrop"
      onClick={onCancel}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className="text-modal-box confirm-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        data-testid="confirm-modal"
      >
        <div className="text-modal-title" id="confirm-modal-title">{title}</div>
        <div className="confirm-modal-message" id="confirm-modal-message">{message}</div>
        <div className="text-modal-actions">
          <button className="btn danger flex-1" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className="btn" onClick={onCancel} autoFocus>
            {t("textModal.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
