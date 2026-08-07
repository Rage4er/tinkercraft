// ============================================================
// MirrorButtons — reusable mirror plane buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

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
  const planes: { plane: MirrorPlane; icon: React.ReactNode; label: string }[] = [
    { plane: "YZ", icon: <MirrorYZIcon size={variant === "full" ? 16 : 14} />, label: "YZ" },
    { plane: "XZ", icon: <MirrorXZIcon size={variant === "full" ? 16 : 14} />, label: "XZ" },
    { plane: "XY", icon: <MirrorXYIcon size={variant === "full" ? 16 : 14} />, label: "XY" },
  ];

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">Зеркало</div>
        <div className="flex-row">
          {planes.map(({ plane, icon, label }) => (
            <button
              key={plane}
              className="btn flex-1"
              disabled={disabled}
              onClick={() => onMirror(plane)}
              onMouseEnter={() => onPreviewMirror?.(plane)}
              onMouseLeave={() => onPreviewEnd?.()}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="toolbar-group">
      {planes.map(({ plane, icon, label }) => (
        <button
          key={plane}
          className="btn"
          disabled={disabled}
          onClick={() => onMirror(plane)}
          onMouseEnter={() => onPreviewMirror?.(plane)}
          onMouseLeave={() => onPreviewEnd?.()}
          title={`Зеркало ${label}`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
