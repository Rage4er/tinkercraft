import { useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TinkerCraftOperation, StepPatch } from "../csg/types";
import { effectivePatches, applyStepPatch } from "../store/project-history";
import { isStepEditable } from "../store/edit-step";
import { fmtVec } from "./StepPanel";
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
    case "move": {
      const k = (op as { kind?: string }).kind;
      return k === "scale" ? <ScaleIcon size={32} /> : k === "rotate" ? <RotateIcon size={32} /> : <MoveIcon size={32} />;
    }
    case "resize":
    case "resize_dims":
      return <ScaleIcon size={32} />;
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
    case "edit_child_params":
      return <ScaleIcon size={32} />;
    case "edit_step":
      return op.patch.kind === "mirror" ? <MirrorYZIcon size={32} /> : <MoveIcon size={32} />;
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
    case "move": {
      const k = (op as { kind?: string }).kind;
      return k === "scale" ? t("timeline.scale") : k === "rotate" ? t("timeline.rotate") : t("timeline.move");
    }
    case "resize_dims":
      return t("timeline.resizeDims");
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
    case "edit_child_params":
      return t("timeline.editChildParams");
    case "edit_step":
      return t("timeline.editStepOp", { step: op.stepIndex + 1, detail: patchDetail(op.patch, op.before, t) });
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

/** Фаза 9.5: «сдвиг (0, 0, 0) → (3, 0, 0)» для подписи правки шага. */
function patchDetail(p: StepPatch, before: StepPatch | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (p.kind === "move") {
    const from = before?.kind === "move" ? `${fmtVec(before.delta)} → ` : "";
    return `${t("stepPanel.offset").toLowerCase()} ${from}${fmtVec(p.delta)}`;
  }
  const from = before?.kind === "mirror" ? `${before.plane} → ` : "";
  return `${from}${p.plane}`;
}

// ---- Timeline ----
export default function Timeline({
  operations,
  historyIndex,
  busy,
  onJump,
  filters,
  onEdit,
}: {
  operations: TinkerCraftOperation[];
  historyIndex: number;
  busy: boolean;
  onJump: (index: number) => void;
  filters: Record<string, boolean>;
  /** Фаза 9.4/9.5: «править» шаг — цель шага (9.4) или сам шаг (9.5.2, move); index — сырой индекс */
  onEdit?: (op: TinkerCraftOperation, index: number) => void;
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
  // Фаза 9.5: действующие правки шагов (по префиксу до historyIndex) — эффективные значения в подписи
  const patched = useMemo(
    () => effectivePatches(operations.slice(0, historyIndex)),
    [operations, historyIndex]
  );
  if (visible.length === 0) return <div className="tl-empty">{t("timeline.empty")}</div>;

  return (
    <div className="tl-list" ref={listRef}>
      {visible.map(({ op, i }) => {
        const idx = i + 1;
        // FIXED: Include index in key to prevent duplicates when same op type targets same object
        const key = 'id' in op ? `${op.type}_${(op as { id?: string }).id}_${i}` : `${op.type}_${i}`
        const edit = patched.get(i)
        const stepEdit = isStepEditable(op) && idx <= historyIndex
        return (
          <div
            key={key}
            className={`tl-item${idx <= historyIndex ? " active" : ""}${idx === historyIndex ? " current" : ""}`}
            title={t('timeline.goToStep', { step: idx })}
            onClick={() => !busy && onJump(idx)}
          >
            <span className="tl-icon">{opIcon(op)}</span>
            <span className="tl-label">
              {opLabel(edit ? applyStepPatch(op, edit.patch) ?? op : op, t)}
              {edit && (
                <span className="tl-edited" data-testid="tl-edited" title={t("timeline.edited", { step: edit.editIndex + 1 })}>
                  {" "}✎{edit.editIndex + 1}
                </span>
              )}
            </span>
            {onEdit && (op.type === "add_shape" || op.type === "edit_child_params" || stepEdit) && (
              <button
                className="tl-edit"
                title={stepEdit ? t("timeline.editMoveStep") : t("timeline.editStep")}
                disabled={busy}
                onClick={(e) => { e.stopPropagation(); onEdit(op, i); }}
              >
                ✎
              </button>
            )}
            <span className="tl-idx">{idx}</span>
          </div>
        );
      })}
    </div>
  );
}
