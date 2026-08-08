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
}: {
  disabled: boolean;
  onAlign: (axis: AlignAxis, anchor: AlignAnchor) => void;
  variant?: "compact" | "full";
}) {
  if (variant === "full") {
    const buttons: { axis: AlignAxis; anchor: AlignAnchor; label: string; tooltipKey: string }[] = [
      { axis: "X", anchor: "min", label: "X min", tooltipKey: "align_x_min" },
      { axis: "X", anchor: "center", label: "X center", tooltipKey: "align_x_center" },
      { axis: "X", anchor: "max", label: "X max", tooltipKey: "align_x_max" },
      { axis: "Y", anchor: "min", label: "Y min", tooltipKey: "align_y_min" },
      { axis: "Y", anchor: "center", label: "Y center", tooltipKey: "align_y_center" },
      { axis: "Y", anchor: "max", label: "Y max", tooltipKey: "align_y_max" },
    ];
    return (
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
  }

  // Compact: X min/center/max + Y center + Z center
  const buttons: { axis: AlignAxis; anchor: AlignAnchor; label: string; tooltipKey: string }[] = [
    { axis: "X", anchor: "min", label: "X min", tooltipKey: "align_x_min" },
    { axis: "X", anchor: "center", label: "X center", tooltipKey: "align_x_center" },
    { axis: "X", anchor: "max", label: "X max", tooltipKey: "align_x_max" },
    { axis: "Y", anchor: "center", label: "Y center", tooltipKey: "align_y_center" },
    { axis: "Z", anchor: "center", label: "Z center", tooltipKey: "align_z_center" },
  ];
  return (
    <div className="toolbar-group">
      {buttons.map(({ axis, anchor, label, tooltipKey }) => (
        <IconButton
          key={`${axis}-${anchor}`}
          icon={<AlignIcon size={14} />}
          onClick={() => onAlign(axis, anchor)}
          disabled={disabled}
          tooltip={TOOLTIP_DATA[tooltipKey]}
        />
      ))}
    </div>
  );
}
