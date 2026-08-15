// ============================================================
// ============================================================
// AlignButtons — reusable alignment buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

import IconButton from "./IconButton";
import { useTranslation } from "react-i18next";
import { TOOLTIP_DATA } from "../constants";
import {
  AlignXMinIcon,
  AlignXCenterIcon,
  AlignXMaxIcon,
  AlignYMinIcon,
  AlignYCenterIcon,
  AlignYMaxIcon,
  AlignZMinIcon,
  AlignZCenterIcon,
  AlignZMaxIcon,
} from "./icons";

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
  const { t } = useTranslation();
  // 9 кнопок выравнивания — полная охват всех осей и anchor-точек
  const allButtons: { axis: AlignAxis; anchor: AlignAnchor; labelKey: string; tooltipKey: string }[] = [
    { axis: "X", anchor: "min", labelKey: "align.x_min", tooltipKey: "align_x_min" },
    { axis: "X", anchor: "center", labelKey: "align.x_center", tooltipKey: "align_x_center" },
    { axis: "X", anchor: "max", labelKey: "align.x_max", tooltipKey: "align_x_max" },
    { axis: "Y", anchor: "min", labelKey: "align.y_min", tooltipKey: "align_y_min" },
    { axis: "Y", anchor: "center", labelKey: "align.y_center", tooltipKey: "align_y_center" },
    { axis: "Y", anchor: "max", labelKey: "align.y_max", tooltipKey: "align_y_max" },
    { axis: "Z", anchor: "min", labelKey: "align.z_min", tooltipKey: "align_z_min" },
    { axis: "Z", anchor: "center", labelKey: "align.z_center", tooltipKey: "align_z_center" },
    { axis: "Z", anchor: "max", labelKey: "align.z_max", tooltipKey: "align_z_max" },
  ];

  // Маппинг иконок по оси
  const alignIcons: Record<string, React.ReactNode> = {
    "X-min": <AlignXMinIcon size={32} />,
    "X-center": <AlignXCenterIcon size={32} />,
    "X-max": <AlignXMaxIcon size={32} />,
    "Y-min": <AlignYMinIcon size={32} />,
    "Y-center": <AlignYCenterIcon size={32} />,
    "Y-max": <AlignYMaxIcon size={32} />,
    "Z-min": <AlignZMinIcon size={32} />,
    "Z-center": <AlignZCenterIcon size={32} />,
    "Z-max": <AlignZMaxIcon size={32} />,
  };

  const getIcon = (axis: string, anchor: string) =>
    alignIcons[`${axis}-${anchor}`] ?? <AlignXMinIcon size={32} />;

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
            {rowIndex === 0 && <div className="csg-group-title mt-4">{t("align.title")}</div>}
            <div className={rowIndex === 0 ? "flex-wrap" : "flex-wrap mt-1"}>
              {row.map((btn) => (
                <IconButton
                  key={`${btn.axis}-${btn.anchor}`}
                  icon={getIcon(btn.axis, btn.anchor)}
                  label={t(btn.labelKey)}
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
              icon={getIcon(btn.axis, btn.anchor)}
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
