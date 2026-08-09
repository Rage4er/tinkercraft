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
  maxFirstRow,
}: {
  disabled: boolean;
  onAlign: (axis: AlignAxis, anchor: AlignAnchor) => void;
  variant?: "compact" | "full";
  /** Сколько кнопок показать в первой строке (из алгоритма layout) */
  maxFirstRow?: number;
}) {
  const allButtons: { axis: AlignAxis; anchor: AlignAnchor; label: string; tooltipKey: string }[] = [
    { axis: "X", anchor: "min", label: "X min", tooltipKey: "align_x_min" },
    { axis: "X", anchor: "center", label: "X center", tooltipKey: "align_x_center" },
    { axis: "X", anchor: "max", label: "X max", tooltipKey: "align_x_max" },
    { axis: "Y", anchor: "min", label: "Y min", tooltipKey: "align_y_min" },
    { axis: "Y", anchor: "center", label: "Y center", tooltipKey: "align_y_center" },
    { axis: "Y", anchor: "max", label: "Y max", tooltipKey: "align_y_max" },
  ];

  // Split buttons into rows based on maxFirstRow
  const firstRow = maxFirstRow !== undefined ? allButtons.slice(0, maxFirstRow) : allButtons;
  const restButtons = maxFirstRow !== undefined && maxFirstRow < allButtons.length ? allButtons.slice(maxFirstRow) : [];

  if (variant === "full") {
    const renderButtons = (buttons: typeof allButtons) => (
      <>
        <div className="csg-group-title mt-4">
          Выравнивание
        </div>
        <div className="flex-wrap">
          {buttons.map(({ axis, anchor, label, tooltipKey }) => (
            <IconButton
              key={`${axis}-${anchor}`}
              icon={<AlignIcon size={16} />}
              label={label}
              onClick={() => onAlign(axis, anchor)}
              disabled={disabled}
              tooltip={TOOLTIP_DATA[tooltipKey]}
            />
          ))}
        </div>
      </>
    );

    return (
      <>
        {renderButtons(firstRow)}
        {restButtons.length > 0 && (
          <div className="mt-1">{renderButtons(restButtons)}</div>
        )}
      </>
    );
  }

  return (
    <div className="toolbar-group">
      {/* First row */}
      <div className="toolbar-group-row">
        {firstRow.map(({ axis, anchor, label, tooltipKey }) => (
          <IconButton
            key={`${axis}-${anchor}`}
            icon={<AlignIcon size={14} />}
            onClick={() => onAlign(axis, anchor)}
            disabled={disabled}
            tooltip={TOOLTIP_DATA[tooltipKey]}
          />
        ))}
      </div>
      {/* Additional row with remaining buttons */}
      {restButtons.length > 0 && (
        <div className="toolbar-group-row">
          {restButtons.map(({ axis, anchor, label, tooltipKey }) => (
            <IconButton
              key={`${axis}-${anchor}`}
              icon={<AlignIcon size={14} />}
              onClick={() => onAlign(axis, anchor)}
              disabled={disabled}
              tooltip={TOOLTIP_DATA[tooltipKey]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
