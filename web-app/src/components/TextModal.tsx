import { useCallback } from "react";

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
  const handleAdd = useCallback(() => void onAdd(), [onAdd]);

  return (
    <div className="text-modal-backdrop" onClick={onClose}>
      <div className="text-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="text-modal-title">
          ✚ 3D Текст
        </div>
        <input
          className="text-modal-input"
          type="text"
          value={textInput}
          placeholder="Введите текст…"
          autoFocus
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="text-modal-row">
          <label className="text-modal-label">
            Размер
            <input
              type="number"
              value={textSize}
              min={1}
              max={200}
              className="text-modal-num"
              onChange={(e) => onSizeChange(Number(e.target.value))}
            />
            мм
          </label>
          <label className="text-modal-label">
            Глубина
            <input
              type="number"
              value={textDepth}
              min={0.5}
              max={100}
              className="text-modal-num"
              onChange={(e) => onDepthChange(Number(e.target.value))}
            />
            мм
          </label>
        </div>
        <div className="text-modal-actions">
          <button
            className="btn primary flex-1"
            disabled={busy || !workerOk}
            onClick={handleAdd}
          >
            ✚ Добавить
          </button>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
