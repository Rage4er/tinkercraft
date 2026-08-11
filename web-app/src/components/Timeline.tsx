import { useRef, useEffect, useMemo } from "react";
import type { TinkerCraftOperation } from "../csg/types";
import {
  CubeIcon,
  SphereIcon,
  CylinderIcon,
  ConeIcon,
  TorusIcon,
  PrismIcon,
  PyramidIcon,
  ImportIcon,
  MoveIcon,
  ScaleIcon,
  RotateIcon,
  FilletIcon,
  MirrorYZIcon,
  AlignXMinIcon,
  UnionIcon,
  SubtractIcon,
  IntersectIcon,
  DeleteIcon,
  EyeIcon,
  ColorIcon,
  TextIcon,
} from "./icons";

// ---- Operation icon ----
export function opIcon(op: TinkerCraftOperation): React.ReactNode {
  switch (op.type) {
    case "add_shape":
      // Используем конкретную иконку для каждой фигуры
      switch (op.shapeType) {
        case "cube": return <CubeIcon size={32} />;
        case "sphere": return <SphereIcon size={32} />;
        case "cylinder": return <CylinderIcon size={32} />;
        case "cone": return <ConeIcon size={32} />;
        case "torus": return <TorusIcon size={32} />;
        case "prism": return <PrismIcon size={32} />;
        case "pyramid": return <PyramidIcon size={32} />;
        default: return <CubeIcon size={32} />;
      }
    case "import_mesh":
      return <ImportIcon size={32} />;
    case "move": {
      const k = (op as { kind?: string }).kind;
      return k === "scale" ? <ScaleIcon size={32} /> : k === "rotate" ? <RotateIcon size={32} /> : <MoveIcon size={32} />;
    }
    case "resize":
    case "resize_dims":
      return <ScaleIcon size={32} />;
    case "fillet":
      return <FilletIcon size={32} />;
    case "mirror":
      return <MirrorYZIcon size={32} />;
    case "align":
      return <AlignXMinIcon size={32} />;
    case "group":
      return (op as { isIntersect?: boolean; subtractOp?: boolean }).isIntersect
        ? <IntersectIcon size={32} />
        : (op as { subtractOp?: boolean }).subtractOp
          ? <SubtractIcon size={32} />
          : <UnionIcon size={32} />;
    case "delete":
      return <DeleteIcon size={32} />;
    case "visibility":
      return <EyeIcon size={32} />;
    case "color":
      return <ColorIcon size={32} />;
    case "rename":
      return <TextIcon size={32} />;
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
