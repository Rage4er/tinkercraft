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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 20,
          minWidth: 300,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            marginBottom: 12,
            color: "var(--text-primary)",
          }}
        >
          ✚ 3D Текст
        </div>
        <input
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            fontSize: 14,
            background: "var(--bg-input,#2a2a3c)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            outline: "none",
          }}
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
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 10,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Размер
            <input
              type="number"
              value={textSize}
              min={1}
              max={200}
              style={{
                width: 54,
                marginLeft: 4,
                padding: "2px 4px",
                background: "var(--bg-input,#2a2a3c)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text-primary)",
                fontSize: 12,
              }}
              onChange={(e) => onSizeChange(Number(e.target.value))}
            />
            мм
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Глубина
            <input
              type="number"
              value={textDepth}
              min={0.5}
              max={100}
              style={{
                width: 54,
                marginLeft: 4,
                padding: "2px 4px",
                background: "var(--bg-input,#2a2a3c)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text-primary)",
                fontSize: 12,
              }}
              onChange={(e) => onDepthChange(Number(e.target.value))}
            />
            мм
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            className="btn primary"
            style={{ flex: 1 }}
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
