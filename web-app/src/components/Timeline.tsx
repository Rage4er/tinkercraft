import { useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  AlignXCenterIcon,
  AlignXMaxIcon,
  AlignYMinIcon,
  AlignYCenterIcon,
  AlignYMaxIcon,
  AlignZMinIcon,
  AlignZCenterIcon,
  AlignZMaxIcon,
  UnionIcon,
  SubtractIcon,
  IntersectIcon,
  DeleteIcon,
  EyeIcon,
  ColorIcon,
  TextIcon,
} from "./icons";

// ---- Icon map for align operations ----
type AlignAxis = 'X' | 'Y' | 'Z';
type AlignAnchor = 'min' | 'center' | 'max';

const ALIGN_ICON_MAP: Record<AlignAxis, Record<AlignAnchor, React.ComponentType<{ size?: number }>>> = {
  X: { min: AlignXMinIcon, center: AlignXCenterIcon, max: AlignXMaxIcon },
  Y: { min: AlignYMinIcon, center: AlignYCenterIcon, max: AlignYMaxIcon },
  Z: { min: AlignZMinIcon, center: AlignZCenterIcon, max: AlignZMaxIcon },
};

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
        case "csg": return <UnionIcon size={32} />;
        default: return <CubeIcon size={32} />;
      }
    case "import_mesh":
      return <ImportIcon size={32} />;
    case "text3d":
      return <TextIcon size={32} />;
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
    case "align": {
      const axis = (op as { axis?: AlignAxis }).axis ?? 'X' as AlignAxis;
      const anchor = (op as { anchor?: AlignAnchor }).anchor ?? 'min' as AlignAnchor;
      const Icon = ALIGN_ICON_MAP[axis]?.[anchor] ?? AlignXMinIcon;
      return <Icon size={32} />;
    }
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
export function opLabel(op: TinkerCraftOperation, t: (key: string, opts?: Record<string, unknown>) => string): string {
  switch (op.type) {
    case "add_shape":
      if (op.shapeType === 'csg') return t('timeline.csgResult')
      return t('timeline.addShape', { shape: t(`shapes.${op.shapeType}`) });
    case "import_mesh":
      return t('timeline.importMesh', { name: (op as { name?: string }).name ?? "STL" });
    case "text3d":
      return t('timeline.text3d', { name: (op as { name?: string }).name ?? "Text" });
    case "move": {
      const k = (op as { kind?: string }).kind;
      return k === "scale" ? t("timeline.scale") : k === "rotate" ? t("timeline.rotate") : t("timeline.move");
    }
    case "resize_dims":
      return t("timeline.resizeDims");
    case "fillet":
      return t('timeline.fillet', { radius: op.radius });
    case "mirror":
      return t('timeline.mirror', { plane: op.plane });
    case "align":
      return t('timeline.align', { axis: op.axis, anchor: op.anchor });
    case "group":
      return (op as { isIntersect?: boolean; subtractOp?: boolean }).isIntersect
        ? t("timeline.groupIntersect")
        : (op as { subtractOp?: boolean }).subtractOp
          ? t("timeline.groupSubtract")
          : t("timeline.groupUnion");
    case "delete":
      return t("timeline.delete");
    case "visibility":
      return t("timeline.visibility");
    case "color":
      return t("timeline.color");
    case "rename":
      return t("timeline.rename");
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
  const { t } = useTranslation();
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
  if (visible.length === 0) return <div className="tl-empty">{t("timeline.empty")}</div>;

  return (
    <div className="tl-list" ref={listRef}>
      {visible.map(({ op, i }) => {
        const idx = i + 1;
        // FIXED: Include index in key to prevent duplicates when same op type targets same object
        const key = 'id' in op ? `${op.type}_${(op as { id?: string }).id}_${i}` : `${op.type}_${i}`
        return (
          <div
            key={key}
            className={`tl-item${idx <= historyIndex ? " active" : ""}${idx === historyIndex ? " current" : ""}`}
            title={t('timeline.goToStep', { step: idx })}
            onClick={() => !busy && onJump(idx)}
          >
            <span className="tl-icon">{opIcon(op)}</span>
            <span className="tl-label">{opLabel(op, t)}</span>
            <span className="tl-idx">{idx}</span>
          </div>
        );
      })}
    </div>
  );
}
