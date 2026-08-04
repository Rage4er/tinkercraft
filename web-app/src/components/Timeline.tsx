import { useRef, useEffect, useMemo } from "react";
import type { TinkerCraftOperation } from "../csg/types";

// ---- Operation icon ----
export function opIcon(op: TinkerCraftOperation): string {
  switch (op.type) {
    case "add_shape":
      return "⊕";
    case "import_mesh":
      return "📥";
    case "move": {
      const k = (op as { kind?: string }).kind;
      return k === "scale" ? "⤡" : k === "rotate" ? "↻" : "⤢";
    }
    case "resize":
      return "⤡";
    case "resize_dims":
      return "⤡";
    case "fillet":
      return "◌";
    case "mirror":
      return "⟺";
    case "align":
      return "⊞";
    case "group":
      return (op as { isIntersect?: boolean; subtractOp?: boolean }).isIntersect
        ? "∩"
        : (op as { subtractOp?: boolean }).subtractOp
          ? "−"
          : "∪";
    case "delete":
      return "✕";
    case "visibility":
      return "👁";
    case "color":
      return "🎨";
    case "rename":
      return "✏";
    default:
      return "?";
  }
}

// ---- Operation label ----
export function opLabel(op: TinkerCraftOperation): string {
  switch (op.type) {
    case "add_shape":
      return `Добавить ${op.shapeType}`;
    case "import_mesh":
      return `Импорт ${(op as { name?: string }).name ?? "STL"}`;
    case "move": {
      const k = (op as { kind?: string }).kind;
      return k === "scale" ? "Масштаб" : k === "rotate" ? "Повернуть" : "Переместить";
    }
    case "resize_dims":
      return "Изменить размер";
    case "fillet":
      return `Fillet r=${op.radius}`;
    case "mirror":
      return `Зеркало ${op.plane}`;
    case "align":
      return `Выровнять ${op.axis}`;
    case "group":
      return (op as { isIntersect?: boolean; subtractOp?: boolean }).isIntersect
        ? "Пересечение"
        : (op as { subtractOp?: boolean }).subtractOp
          ? "Вычитание"
          : "Объединение";
    case "delete":
      return "Удалить";
    case "visibility":
      return "Видимость";
    case "color":
      return "Цвет";
    case "rename":
      return `Переименовать`;
    default:
      return "";
  }
}

// ---- Timeline ----
export default function Timeline({
  operations,
  historyIndex,
  busy,
  onJump,
  filters,
}: {
  operations: TinkerCraftOperation[];
  historyIndex: number;
  busy: boolean;
  onJump: (index: number) => void;
  filters: Record<string, boolean>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current
      .querySelector(".tl-item.current")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [historyIndex]);

  // PERF-R8-4: Мемоизация вычисления видимых операций
  const visible = useMemo(
    () => operations
      .map((op, i) => ({ op, i }))
      .filter(({ op }) => filters[op.type] !== false),
    [operations, filters]
  );
  if (visible.length === 0) return <div className="tl-empty">Пусто</div>;

  return (
    <div className="tl-list" ref={listRef}>
      {visible.map(({ op, i }) => {
        const idx = i + 1;
        // FIX (MED-18-35): Use composite key (type+index) — most ops have id, others fall back to index
        const key = 'id' in op ? `${op.type}_${(op as { id?: string }).id}` : `${op.type}_${i}`
        return (
          <div
            key={key}
            className={`tl-item${idx <= historyIndex ? " active" : ""}${idx === historyIndex ? " current" : ""}`}
            title={`Перейти к шагу ${idx}`}
            onClick={() => !busy && onJump(idx)}
          >
            <span className="tl-icon">{opIcon(op)}</span>
            <span className="tl-label">{opLabel(op)}</span>
            <span className="tl-idx">{idx}</span>
          </div>
        );
      })}
    </div>
  );
}
