// ============================================================
// MirrorButtons — reusable mirror plane buttons (WARN-3)
// Used in both Toolbar (compact) and PropertiesPanel (full)
// ============================================================

type MirrorPlane = "XY" | "XZ" | "YZ";

export default function MirrorButtons({
  disabled,
  onMirror,
  variant = "compact",
}: {
  disabled: boolean;
  onMirror: (plane: MirrorPlane) => void;
  variant?: "compact" | "full";
}) {
  const planes: MirrorPlane[] = ["YZ", "XZ", "XY"];

  if (variant === "full") {
    return (
      <div className="csg-group">
        <div className="csg-group-title">Зеркало</div>
        <div style={{ display: "flex", gap: 4 }}>
          {planes.map((p) => (
            <button
              key={p}
              className="btn"
              style={{ flex: 1 }}
              disabled={disabled}
              onClick={() => onMirror(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="toolbar-group">
      {planes.map((p) => (
        <button
          key={p}
          className="btn"
          disabled={disabled}
          onClick={() => onMirror(p)}
          title={`Зеркало ${p}`}
        >
          ⟺{p}
        </button>
      ))}
    </div>
  );
}
