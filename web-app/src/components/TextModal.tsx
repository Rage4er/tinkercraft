import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TextIcon, PlusIcon } from "./icons";

export default function TextModal({
  textInput,
  textSize,
  textDepth,
  busy,
  workerOk,
  onTextChange,
  onSizeChange,
  onDepthChange,
  onAdd,
  onClose,
}: {
  textInput: string;
  textSize: number;
  textDepth: number;
  busy: boolean;
  workerOk: boolean;
  onTextChange: (v: string) => void;
  onSizeChange: (v: number) => void;
  onDepthChange: (v: number) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const handleAdd = useCallback(() => void onAdd(), [onAdd]);

  // UX-AUDIT-27: Esc закрывает модалку откуда угодно — поле текста, «Размер», «Глубина», кнопка,
  // клик по модалке (как менеджер проектов, UX-AUDIT-15); раньше — только из поля текста.
  // Сочетания App под модалкой и так заблокированы.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="text-modal-backdrop" onClick={onClose}>
      <div
        className="text-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-modal-title"
      >
        <div className="text-modal-title" id="text-modal-title">
          <PlusIcon size={32} /> {t("textModal.title")}
        </div>
        <input
          className="text-modal-input"
          type="text"
          maxLength={64}
          value={textInput}
          placeholder={t("textModal.placeholder")}
          autoFocus
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <div className="text-modal-row">
          <label className="text-modal-label">
            {t("textModal.size")}
            <input
              type="number"
              value={textSize}
              min={1}
              max={200}
              className="text-modal-num"
              onChange={(e) => {
                const v = Number(e.target.value)
                // FIX (LOW-18-34): Validate Number() result — empty input gives NaN
                if (!isNaN(v)) onSizeChange(v)
              }}
            />
            {t("units.mm")}
          </label>
          <label className="text-modal-label">
            {t("textModal.depth")}
            <input
              type="number"
              value={textDepth}
              min={0.5}
              max={100}
              className="text-modal-num"
              onChange={(e) => {
                const v = Number(e.target.value)
                // FIX (LOW-18-34): Validate Number() result — empty input gives NaN
                if (!isNaN(v)) onDepthChange(v)
              }}
            />
            {t("units.mm")}
          </label>
        </div>
        <div className="text-modal-actions">
          <button
            className="btn primary flex-1"
            disabled={busy || !workerOk}
            onClick={handleAdd}
          >
            <PlusIcon size={32} /> {t("textModal.add")}
          </button>
          <button className="btn" onClick={onClose}>
            {t("textModal.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
