// ============================================================
// MirrorButtons — reusable mirror plane buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

import IconButton from "./IconButton";
import { TOOLTIP_DATA } from "../constants";
import { MirrorYZIcon, MirrorXZIcon, MirrorXYIcon } from "./icons";

type MirrorPlane = "XY" | "XZ" | "YZ";

export default function MirrorButtons({
  disabled,
  onMirror,
  onPreviewMirror,
  onPreviewEnd,
  variant = "compact",
}: {
  disabled: boolean;
  onMirror: (plane: MirrorPlane) => void;
  onPreviewMirror?: (plane: MirrorPlane) => void;
  onPreviewEnd?: () => void;
  variant?: "compact" | "full";
}) {
  const planes: { plane: MirrorPlane; icon: React.ReactNode; label: string; tooltipKey: string }[] = [
    { plane: "YZ", icon: <MirrorYZIcon size={variant === "full" ? 16 : 14} />, label: "YZ", tooltipKey: "mirror_yz" },
    { plane: "XZ", icon: <MirrorXZIcon size={variant === "full" ? 16 : 14} />, label: "XZ", tooltipKey: "mirror_xz" },
    { plane: "XY", icon: <MirrorXYIcon size={variant === "full" ? 16 : 14} />, label: "XY", tooltipKey: "mirror_xy" },
  ];

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">Зеркало</div>
        <div className="flex-row">
          {planes.map(({ plane, icon, label, tooltipKey }) => (
            <IconButton
              key={plane}
              icon={icon}
              label={label}
              onClick={() => onMirror(plane)}
              disabled={disabled}
              tooltip={TOOLTIP_DATA[tooltipKey]}
              onMouseEnter={() => onPreviewMirror?.(plane)}
              onMouseLeave={() => onPreviewEnd?.()}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="toolbar-group">
      {planes.map(({ plane, icon, label, tooltipKey }) => (
        <IconButton
          key={plane}
          icon={icon}
          onClick={() => onMirror(plane)}
          disabled={disabled}
          tooltip={TOOLTIP_DATA[tooltipKey]}
          onMouseEnter={() => onPreviewMirror?.(plane)}
          onMouseLeave={() => onPreviewEnd?.()}
        />
      ))}
    </div>
  );
}
