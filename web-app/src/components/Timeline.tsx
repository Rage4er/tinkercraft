import { useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TinkerCraftOperation, StepPatch, Vec3 } from "../csg/types";
import { effectivePatches, applyStepPatch } from "../store/project-history";
import { textOfOp } from "../store/text-object";
import { isStepEditable } from "../store/edit-step";
import { fmtVec, fmtNum } from "./StepPanel";
import { scrollListToItem } from "./list-scroll";
import {
  CubeIcon,
  SphereIcon,
  CylinderIcon,
  ConeIcon,
  TorusIcon,
  PrismIcon,
  PyramidIcon, CapsuleIcon, TubeIcon, SpringIcon,
  ImportIcon,
  PasteIcon,
  MoveIcon,
  ScaleIcon,
  RotateIcon,
  MirrorYZIcon,
  AlignXMinIcon,
  AlignToolIcon,
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
  LockIcon,
  UnlockIcon,
  ArrayIcon,
  ColorIcon,
  TextIcon,
} from "./icons";

// ---- Icon map for align operations ----
type AlignAxis = 'X' | 'Y' | 'Z';
type AlignAnchor = 'min' | 'center' | 'max';

/** Плоскость по оси (режим «Выровнять»: X — плоскость YZ, Y — XZ, Z — XY). */
const AXIS_PLANE: Record<AlignAxis, string> = { X: 'YZ', Y: 'XZ', Z: 'XY' };

const ALIGN_ICON_MAP: Record<AlignAxis, Record<AlignAnchor, React.ComponentType<{ size?: number }>>> = {
  X: { min: AlignXMinIcon, center: AlignXCenterIcon, max: AlignXMaxIcon },
  Y: { min: AlignYMinIcon, center: AlignYCenterIcon, max: AlignYMaxIcon },
  Z: { min: AlignZMinIcon, center: AlignZCenterIcon, max: AlignZMaxIcon },
};

// ---- Operation icon ----
/**
 * UX-AUDIT-11: вид CSG-шага. `csgBoolean` пишет операцию в `treeOperation`; раньше Timeline
 * читал флаги `isIntersect`/`subtractOp`, которых никто не пишет (остались от старого формата —
 * читаются запасным путём), и вычитание/пересечение показывались «Объединением».
 */
/**
 * UX-AUDIT-13: вставка CSG (Ctrl+V) пишется операцией `group` без операндов — раньше в истории
 * «Объединение». Признак `pasted`; старые вставки — по `ids: []` (так пишет только вставка).
 */
export function isPastedGroup(op: TinkerCraftOperation & { type: "group" }): boolean {
  return op.pasted === true || (op.ids.length === 0 && !op.source);
}

export function groupOpKind(op: TinkerCraftOperation & { type: "group" }): "union" | "subtract" | "intersect" {
  if (op.treeOperation) return op.treeOperation;
  const legacy = op as { isIntersect?: boolean; subtractOp?: boolean };
  return legacy.isIntersect ? "intersect" : legacy.subtractOp ? "subtract" : "union";
}

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
        case "capsule": return <CapsuleIcon size={32} />;
        case "tube": return <TubeIcon size={32} />;
        case "spring": return <SpringIcon size={32} />;
        case "csg": return <UnionIcon size={32} />;
        default: return <CubeIcon size={32} />;
      }
    case "import_mesh":
      // UX-AUDIT-31: добавление 3D-текста — иконка текста (а не импорта)
      return op.pasted ? <PasteIcon size={32} /> : textOfOp(op) !== undefined ? <TextIcon size={32} /> : <ImportIcon size={32} />;
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
      if (op.plane) return <AlignToolIcon size={32} />;          // ALIGN-PLANE-RESOLVE: режим «Выровнять»
      const axis = (op as { axis?: AlignAxis }).axis ?? 'X' as AlignAxis;
      const anchor = (op as { anchor?: AlignAnchor }).anchor ?? 'min' as AlignAnchor;
      const Icon = ALIGN_ICON_MAP[axis]?.[anchor] ?? AlignXMinIcon;
      return <Icon size={32} />;
    }
    case "group": {
      if (isPastedGroup(op)) return <PasteIcon size={32} />;
      const g = groupOpKind(op);
      return g === "intersect" ? <IntersectIcon size={32} /> : g === "subtract" ? <SubtractIcon size={32} /> : <UnionIcon size={32} />;
    }
    case "edit_child_params":
      return <ScaleIcon size={32} />;
    case "edit_step":
      return op.patch.kind === "mirror" ? <MirrorYZIcon size={32} /> : op.patch.kind === "extrude" ? <ScaleIcon size={32} /> : <MoveIcon size={32} />;
    case "delete":
      return <DeleteIcon size={32} />;
    case "visibility":
      return <EyeIcon size={32} />;
    case "lock":
      return op.locked ? <LockIcon size={32} /> : <UnlockIcon size={32} />;
    case "array":
      return <ArrayIcon size={32} />;
    case "color":
      return <ColorIcon size={32} />;
    case "rename":
      return <TextIcon size={32} />;
    default:
      return "?";
  }
}

// ---- Operation label ----
/**
 * UX-AUDIT-29: категория шага для фильтра истории — по тому, что написано в шаге, а не по типу
 * операции: «Повернуть» и «Масштаб» (move с kind) — свои категории, а не «Переместить»; любая
 * вставка («Вставить куб / CSG / импорт») — одна категория «Вставить», а не «Добавить» / «CSG» /
 * «Импорт». Ключи — `OP_FILTER_LABELS`.
 */
export function filterKeyOf(op: TinkerCraftOperation): string {
  if ((op.type === "add_shape" || op.type === "import_mesh") && op.pasted) return "paste";
  if (op.type === "import_mesh" && textOfOp(op) !== undefined) return "add_shape";     // «Добавить текст» (UX-AUDIT-31)
  if (op.type === "group" && op.source?.kind !== "extrude" && isPastedGroup(op)) return "paste";
  if (op.type === "move") {
    const k = (op as { kind?: string }).kind;
    if (k === "rotate" || k === "scale") return k;
  }
  return op.type;
}

export function opLabel(op: TinkerCraftOperation, t: (key: string, opts?: Record<string, unknown>) => string): string {
  switch (op.type) {
    case "add_shape":
      // UX-AUDIT-17: фигура — в винительном падеже («Добавить сферу», ru)
      if (op.pasted) return t('timeline.paste', { what: t(`shapesAcc.${op.shapeType}`) });
      if (op.shapeType === 'csg') return t('timeline.csgResult')
      return t('timeline.addShape', { shape: t(`shapesAcc.${op.shapeType}`) });
    case "import_mesh": {
      // UX-AUDIT-31: 3D-текст — «Добавить текст: Привет» / «Вставить текст», а не «Импорт Текст: …»
      const text = textOfOp(op);
      if (op.pasted) return t('timeline.paste', { what: text !== undefined ? t('shapesAcc.text') : t('timeline.pastedImport') });
      if (text !== undefined) return t('timeline.addText', { text });
      return t('timeline.importMesh', { name: (op as { name?: string }).name ?? "STL" });
    }
    case "move": {
      const k = (op as { kind?: string }).kind;
      return k === "scale" ? t("timeline.scale") : k === "rotate" ? t("timeline.rotate") : t("timeline.move");
    }
    case "resize_dims":
      return t("timeline.resizeDims");
    case "mirror":
      return t('timeline.mirror', { plane: op.plane });
    case "align":
      // ALIGN-PLANE-RESOLVE: режим «Выровнять» — по грани объекта A или по плоскости оси (X → YZ…)
      if (op.plane) return op.anchorId ? t('timeline.alignFace') : t('timeline.alignAxisPlane', { plane: AXIS_PLANE[op.axis] });
      return t('timeline.align', { axis: op.axis, anchor: op.anchor });
    case "group":
      // Фаза 9.5.4: группа extrude (source) подписана как выдавливание (эффективная глубина)
      if (op.source?.kind === "extrude") return t("timeline.extrude", { axis: op.source.axis, depth: fmtNum(op.source.depth) });
      if (isPastedGroup(op)) return t("timeline.paste", { what: "CSG" });
      {
        const g = groupOpKind(op);
        return g === "intersect" ? t("timeline.groupIntersect") : g === "subtract" ? t("timeline.groupSubtract") : t("timeline.groupUnion");
      }
    case "edit_child_params":
      return t("timeline.editChildParams");
    case "edit_step":
      return t("timeline.editStepOp", { step: op.stepIndex + 1, detail: patchDetail(op.patch, op.before, t) });
    case "delete":
      return t("timeline.delete");
    case "visibility":
      return t("timeline.visibility");
    case "lock":
      return t(op.locked ? "timeline.lock" : "timeline.unlock");
    case "array":
      // ARRAY-TOOL: «Массив: линейный ×3, шаг 20 (X)» / «Массив: круговой ×6, 360° (Y)»
      return op.params.kind === "circular"
        ? t("timeline.arrayCircular", { count: op.params.count, angle: Math.round((op.params.angle ?? 360) * 100) / 100, axis: op.params.axis })
        : t("timeline.arrayLinear", { count: op.params.count, step: Math.round((op.params.step ?? 0) * 100) / 100, axis: op.params.axis });
    case "color":
      return t("timeline.color");
    case "rename":
      return t("timeline.rename");
    default:
      return "";
  }
}

/** Фаза 9.5: «сдвиг (0, 0, 0) → (3, 0, 0)» / «зеркало YZ → XZ» / «выдавливание (глубина 5 → 10)». */
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const sameVec = (a: Vec3 | undefined, b: Vec3 | undefined): boolean => {
  const u = a ?? ZERO, v = b ?? ZERO;
  return Math.abs(u.x - v.x) < 1e-9 && Math.abs(u.y - v.y) < 1e-9 && Math.abs(u.z - v.z) < 1e-9;
};

/**
 * UX-AUDIT-40: подпись правки шага move — группы, которые правка меняет: «сдвиг (8, 0, 0) → (12, 0, 0)»,
 * «поворот (0, 0, 30)° → (0, 0, 45)°», «масштаб …». Было: всегда только сдвиг — правка поворота шага
 * читалась «сдвиг (0, 0, 0) → (0, 0, 0)». Без прежних значений (`before`) — сдвиг и ненулевые поворот /
 * масштаб; ничего не изменилось — сдвиг, как раньше.
 */
function movePatchDetail(
  p: Extract<StepPatch, { kind: "move" }>,
  before: Extract<StepPatch, { kind: "move" }> | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const groups: Array<{ key: string; from: Vec3 | undefined; to: Vec3 | undefined; unit: string }> = [
    { key: "stepPanel.offset", from: before?.delta, to: p.delta, unit: "" },
    { key: "stepPanel.rotation", from: before?.rotDelta, to: p.rotDelta, unit: "°" },
    { key: "stepPanel.scale", from: before?.scaleDelta, to: p.scaleDelta, unit: "" },
  ];
  const changed = before
    ? groups.filter((g) => !sameVec(g.from, g.to))
    : groups.filter((g, i) => i === 0 || !sameVec(g.to, ZERO));
  return (changed.length ? changed : groups.slice(0, 1))
    .map((g) => {
      const from = before ? `${fmtVec(g.from ?? ZERO)}${g.unit} → ` : "";
      return `${t(g.key).toLowerCase()} ${from}${fmtVec(g.to ?? ZERO)}${g.unit}`;
    })
    .join(", ");
}

function patchDetail(p: StepPatch, before: StepPatch | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (p.kind === "move") return movePatchDetail(p, before?.kind === "move" ? before : undefined, t);
  if (p.kind === "extrude") {
    const from = before?.kind === "extrude" ? `${fmtNum(before.depth)} → ` : "";
    return `${t("stepPanel.extrude").toLowerCase()} (${t("stepPanel.depth").toLowerCase()} ${from}${fmtNum(p.depth)})`;
  }
  const from = before?.kind === "mirror" ? `${before.plane} → ` : "";
  return `${t("stepPanel.mirror").toLowerCase()} ${from}${p.plane}`;
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
  /** Фаза 9.4/9.5: «править» шаг — цель шага (9.4) или сам шаг (9.5.2 move, 9.5.3 mirror, 9.5.4 extrude); index — сырой индекс */
  onEdit?: (op: TinkerCraftOperation, index: number) => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  // DOUBLE-CLICK-TIMING: прокручивается только список истории, не вся левая панель
  // (scrollIntoView двигал .panel-left — палитра уезжала из-под курсора)
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>(".tl-item.current");
    if (list && current) scrollListToItem(list, current);
  }, [historyIndex]);

  // PERF-R8-4: Мемоизация вычисления видимых операций
  const visible = useMemo(
    () => operations
      .map((op, i) => ({ op, i }))
      .filter(({ op }) => filters[filterKeyOf(op)] !== false),
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
                title={stepEdit ? t(op.type === "mirror" ? "timeline.editMirrorStep" : op.type === "group" ? "timeline.editExtrudeStep" : "timeline.editMoveStep") : t("timeline.editStep")}
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
