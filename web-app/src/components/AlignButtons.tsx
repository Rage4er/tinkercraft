// ============================================================
// ============================================================
// AlignButtons — reusable alignment buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

import IconButton from "./IconButton";
import { TOOLTIP_DATA } from "../constants";
import { AlignIcon } from "./icons";

type AlignAxis = "X" | "Y" | "Z";
type AlignAnchor = "min" | "center" | "max";

export default function AlignButtons({
  disabled,
  onAlign,
  variant = "compact",
  maxRows,
}: {
  disabled: boolean;
  onAlign: (axis: AlignAxis, anchor: AlignAnchor) => void;
  variant?: "compact" | "full";
  /** Количество строк для группы (из алгоритма layout) */
  maxRows?: number;
}) {
  const allButtons: { axis: AlignAxis; anchor: AlignAnchor; label: string; tooltipKey: string }[] = [
    { axis: "X", anchor: "min", label: "X min", tooltipKey: "align_x_min" },
    { axis: "X", anchor: "center", label: "X center", tooltipKey: "align_x_center" },
    { axis: "X", anchor: "max", label: "X max", tooltipKey: "align_x_max" },
    { axis: "Y", anchor: "min", label: "Y min", tooltipKey: "align_y_min" },
    { axis: "Y", anchor: "center", label: "Y center", tooltipKey: "align_y_center" },
    { axis: "Y", anchor: "max", label: "Y max", tooltipKey: "align_y_max" },
  ];

  // Распределяем кнопки по строкам
  const rows = maxRows ?? 1;
  const buttonsPerRow = Math.ceil(allButtons.length / rows);
  const resultRows: typeof allButtons[] = [];
  for (let i = 0; i < rows; i++) {
    const start = i * buttonsPerRow;
    const end = Math.min(start + buttonsPerRow, allButtons.length);
    if (start < allButtons.length) {
      resultRows.push(allButtons.slice(start, end) as typeof allButtons);
    }
  }

  if (variant === "full") {
    return (
      <>
        {resultRows.map((row, rowIndex) => (
          <div key={rowIndex}>
            {rowIndex === 0 && <div className="csg-group-title mt-4">Выравнивание</div>}
            <div className={rowIndex === 0 ? "flex-wrap" : "flex-wrap mt-1"}>
              {row.map((btn) => (
                <IconButton
                  key={`${btn.axis}-${btn.anchor}`}
                  icon={<AlignIcon size={16} />}
                  label={btn.label}
                  onClick={() => onAlign(btn.axis, btn.anchor)}
                  disabled={disabled}
                  tooltip={TOOLTIP_DATA[btn.tooltipKey]}
                />
              ))}
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="toolbar-group">
      {resultRows.map((row, rowIndex) => (
        <div key={rowIndex} className="toolbar-group-row">
          {row.map((btn) => (
            <IconButton
              key={`${btn.axis}-${btn.anchor}`}
              icon={<AlignIcon size={14} />}
              onClick={() => onAlign(btn.axis, btn.anchor)}
              disabled={disabled}
              tooltip={TOOLTIP_DATA[btn.tooltipKey]}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
