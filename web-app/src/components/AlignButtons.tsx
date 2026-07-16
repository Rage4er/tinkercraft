// ============================================================
// AlignButtons — reusable alignment buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

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
    const buttons: { axis: AlignAxis; anchor: AlignAnchor; label: string }[] = [
      { axis: "X", anchor: "min", label: "X◧" },
      { axis: "X", anchor: "center", label: "X⊡" },
      { axis: "X", anchor: "max", label: "X◨" },
      { axis: "Y", anchor: "min", label: "Y◧" },
      { axis: "Y", anchor: "center", label: "Y⊡" },
      { axis: "Y", anchor: "max", label: "Y◨" },
    ];
    return (
      <>
        <div className="csg-group-title mt-4">
          Выравнивание
        </div>
        <div className="flex-wrap">
          {buttons.map(({ axis, anchor, label }) => (
            <button
              key={`${axis}-${anchor}`}
              className="btn flex-1 min-w-36"
              disabled={disabled}
              onClick={() => onAlign(axis, anchor)}
            >
              {label}
            </button>
          ))}
        </div>
      </>
    );
  }

  // Compact: X min/center/max + Y center + Z center
  const buttons: { axis: AlignAxis; anchor: AlignAnchor; label: string }[] = [
    { axis: "X", anchor: "min", label: "◧X" },
    { axis: "X", anchor: "center", label: "⊡X" },
    { axis: "X", anchor: "max", label: "◨X" },
    { axis: "Y", anchor: "center", label: "⊡Y" },
    { axis: "Z", anchor: "center", label: "⊡Z" },
  ];
  return (
    <div className="toolbar-group">
      {buttons.map(({ axis, anchor, label }) => (
        <button
          key={`${axis}-${anchor}`}
          className="btn"
          disabled={disabled}
          onClick={() => onAlign(axis, anchor)}
          title={label}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
