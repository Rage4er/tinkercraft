// ============================================================
// CsgButtons — reusable CSG operation buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

import IconButton from "./IconButton";
import { UnionIcon, SubtractIcon, IntersectIcon } from "./icons";

type CsgOp = "union" | "subtract" | "intersect";

const CSG_DISABLED_TITLE = "CSG операции с данным объектом невозможны (non-manifold геометрия)";

export default function CsgButtons({
  disabled,
  onCsg,
  variant = "compact",
  nonManifoldSelected = false,
}: {
  disabled: boolean;
  onCsg: (op: CsgOp) => void;
  variant?: "compact" | "full";
  nonManifoldSelected?: boolean;
}) {
  const ops: { op: CsgOp; icon: React.ReactNode; label: string }[] = [
    { op: "union", icon: <UnionIcon size={variant === "full" ? 16 : 14} />, label: "Объединение" },
    { op: "subtract", icon: <SubtractIcon size={variant === "full" ? 16 : 14} />, label: "Вычитание" },
    { op: "intersect", icon: <IntersectIcon size={variant === "full" ? 16 : 14} />, label: "Пересечение" },
  ];

  const title = disabled && nonManifoldSelected ? CSG_DISABLED_TITLE : undefined;

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">CSG операции</div>
        {ops.map(({ op, icon, label }) => (
          <IconButton
            key={op}
            icon={icon}
            label={label}
            onClick={() => onCsg(op)}
            disabled={disabled}
            title={title ?? label}
            buttonVariant="primary"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="toolbar-group">
      {ops.map(({ op, icon, label }) => (
        <IconButton
          key={op}
          icon={icon}
          onClick={() => onCsg(op)}
          disabled={disabled}
          title={title ?? label}
          buttonVariant="primary"
        />
      ))}
    </div>
  );
}
