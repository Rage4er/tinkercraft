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
  maxRows,
}: {
  disabled: boolean;
  onCsg: (op: CsgOp) => void;
  variant?: "compact" | "full";
  nonManifoldSelected?: boolean;
  /** Количество строк для группы (из алгоритма layout) */
  maxRows?: number;
}) {
  const ops: { op: CsgOp; icon: React.ReactNode; label: string; tooltipKey: string }[] = [
    { op: "union", icon: <UnionIcon size={32} />, label: "Объединение", tooltipKey: "csg_union" },
    { op: "subtract", icon: <SubtractIcon size={32} />, label: "Вычитание", tooltipKey: "csg_subtract" },
    { op: "intersect", icon: <IntersectIcon size={32} />, label: "Пересечение", tooltipKey: "csg_intersect" },
  ];

  // Распределяем кнопки по строкам
  const rows = maxRows ?? 1;
  const buttonsPerRow = Math.ceil(ops.length / rows);
  const resultRows: typeof ops[] = [];
  for (let i = 0; i < rows; i++) {
    const start = i * buttonsPerRow;
    const end = Math.min(start + buttonsPerRow, ops.length);
    if (start < ops.length) {
      resultRows.push(ops.slice(start, end) as typeof ops);
    }
  }

  const title = disabled && nonManifoldSelected ? CSG_DISABLED_TITLE : undefined;

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">CSG операции</div>
        {resultRows.map((row, rowIndex) => (
          <div key={rowIndex} className={rowIndex === 0 ? "flex-row" : "flex-row mt-1"}>
            {row.map(({ op, icon, label, tooltipKey }) => (
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
        ))}
      </div>
    );
  }

  return (
    <div className="toolbar-group">
      {resultRows.map((row, rowIndex) => (
        <div key={rowIndex} className="toolbar-group-row">
          {row.map(({ op, icon, label, tooltipKey }) => (
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
      ))}
    </div>
  );
}
