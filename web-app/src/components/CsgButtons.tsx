// ============================================================
// CsgButtons — reusable CSG operation buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

type CsgOp = "union" | "subtract" | "intersect";

export default function CsgButtons({
  disabled,
  onCsg,
  variant = "compact",
}: {
  disabled: boolean;
  onCsg: (op: CsgOp) => void;
  variant?: "compact" | "full";
}) {
  const ops: { op: CsgOp; icon: string; label: string }[] = [
    { op: "union", icon: "∪", label: "Объединение" },
    { op: "subtract", icon: "−", label: "Вычитание" },
    { op: "intersect", icon: "∩", label: "Пересечение" },
  ];

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">CSG операции</div>
        {ops.map(({ op, icon, label }) => (
          <button
            key={op}
            className="btn primary"
            disabled={disabled}
            onClick={() => onCsg(op)}
          >
            {icon} {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="toolbar-group">
      {ops.map(({ op, icon }) => (
        <button
          key={op}
          className="btn primary"
          disabled={disabled}
          onClick={() => onCsg(op)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
