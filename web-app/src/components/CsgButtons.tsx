// ============================================================
// CsgButtons — reusable CSG operation buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

import IconButton from "./IconButton";
import { TOOLTIP_DATA } from "../constants";
import { UnionIcon, SubtractIcon, IntersectIcon } from "./icons";

type CsgOp = "union" | "subtract" | "intersect";

const CSG_DISABLED_TITLE = "CSG операции с данным объектом невозможны (non-manifold геометрия)";

export default function CsgButtons({
  disabled,
  onCsg,
  variant = "compact",
  nonManifoldSelected = false,
  maxFirstRow,
}: {
  disabled: boolean;
  onCsg: (op: CsgOp) => void;
  variant?: "compact" | "full";
  nonManifoldSelected?: boolean;
  /** Сколько кнопок показать в первой строке (из алгоритма layout) */
  maxFirstRow?: number;
}) {
  const ops: { op: CsgOp; icon: React.ReactNode; label: string; tooltipKey: string }[] = [
    { op: "union", icon: <UnionIcon size={variant === "full" ? 16 : 14} />, label: "Объединение", tooltipKey: "csg_union" },
    { op: "subtract", icon: <SubtractIcon size={variant === "full" ? 16 : 14} />, label: "Вычитание", tooltipKey: "csg_subtract" },
    { op: "intersect", icon: <IntersectIcon size={variant === "full" ? 16 : 14} />, label: "Пересечение", tooltipKey: "csg_intersect" },
  ];

  // Split buttons into rows based on maxFirstRow
  const firstRow = maxFirstRow !== undefined ? ops.slice(0, maxFirstRow) : ops;
  const restButtons = maxFirstRow !== undefined && maxFirstRow < ops.length ? ops.slice(maxFirstRow) : [];

  const title = disabled && nonManifoldSelected ? CSG_DISABLED_TITLE : undefined;

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">CSG операции</div>
        <div className="flex-row">
          {firstRow.map(({ op, icon, label, tooltipKey }) => (
            <IconButton
              key={op}
              icon={icon}
              label={label}
              onClick={() => onCsg(op)}
              disabled={disabled}
              tooltip={TOOLTIP_DATA[tooltipKey]}
              buttonVariant="primary"
            />
          ))}
        </div>
        {restButtons.length > 0 && (
          <div className="flex-row mt-1">
            {restButtons.map(({ op, icon, label, tooltipKey }) => (
              <IconButton
                key={op}
                icon={icon}
                label={label}
                onClick={() => onCsg(op)}
                disabled={disabled}
                tooltip={TOOLTIP_DATA[tooltipKey]}
                buttonVariant="primary"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="toolbar-group">
      {/* First row */}
      <div className="toolbar-group-row">
        {firstRow.map(({ op, icon, label, tooltipKey }) => (
          <IconButton
            key={op}
            icon={icon}
            onClick={() => onCsg(op)}
            disabled={disabled}
            tooltip={TOOLTIP_DATA[tooltipKey]}
            buttonVariant="primary"
          />
        ))}
      </div>
      {/* Additional row with remaining buttons */}
      {restButtons.length > 0 && (
        <div className="toolbar-group-row">
          {restButtons.map(({ op, icon, label, tooltipKey }) => (
            <IconButton
              key={op}
              icon={icon}
              onClick={() => onCsg(op)}
              disabled={disabled}
              tooltip={TOOLTIP_DATA[tooltipKey]}
              buttonVariant="primary"
            />
          ))}
        </div>
      )}
    </div>
  );
}
