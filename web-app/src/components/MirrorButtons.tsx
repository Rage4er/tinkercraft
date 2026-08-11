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
  maxRows,
}: {
  disabled: boolean;
  onMirror: (plane: MirrorPlane) => void;
  onPreviewMirror?: (plane: MirrorPlane) => void;
  onPreviewEnd?: () => void;
  variant?: "compact" | "full";
  /** Количество строк для группы (из алгоритма layout) */
  maxRows?: number;
}) {
  const planes: { plane: MirrorPlane; icon: React.ReactNode; label: string; tooltipKey: string }[] = [
    { plane: "YZ", icon: <MirrorYZIcon size={32} />, label: "YZ", tooltipKey: "mirror_yz" },
    { plane: "XZ", icon: <MirrorXZIcon size={32} />, label: "XZ", tooltipKey: "mirror_xz" },
    { plane: "XY", icon: <MirrorXYIcon size={32} />, label: "XY", tooltipKey: "mirror_xy" },
  ];

  // Распределяем кнопки по строкам
  const rows = maxRows ?? 1;
  const buttonsPerRow = Math.ceil(planes.length / rows);
  const resultRows: typeof planes[] = [];
  for (let i = 0; i < rows; i++) {
    const start = i * buttonsPerRow;
    const end = Math.min(start + buttonsPerRow, planes.length);
    if (start < planes.length) {
      resultRows.push(planes.slice(start, end) as typeof planes);
    }
  }

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">Зеркало</div>
        {resultRows.map((row, rowIndex) => (
          <div key={rowIndex} className={rowIndex === 0 ? "flex-row" : "flex-row mt-1"}>
            {row.map((btn) => (
              <IconButton
                key={btn.plane}
                icon={btn.icon}
                label={btn.label}
                onClick={() => onMirror(btn.plane)}
                disabled={disabled}
                tooltip={TOOLTIP_DATA[btn.tooltipKey]}
                onMouseEnter={() => onPreviewMirror?.(btn.plane)}
                onMouseLeave={() => onPreviewEnd?.()}
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
          {row.map((btn) => (
            <IconButton
              key={btn.plane}
              icon={btn.icon}
              onClick={() => onMirror(btn.plane)}
              disabled={disabled}
              tooltip={TOOLTIP_DATA[btn.tooltipKey]}
              onMouseEnter={() => onPreviewMirror?.(btn.plane)}
              onMouseLeave={() => onPreviewEnd?.()}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
