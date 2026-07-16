import { useState, useEffect } from "react";

// ---- Numeric input with draft editing ----
export default function NumInput({
  label,
  value,
  disabled,
  unit = "мм",
  min,
  step,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  unit?: string;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const decimals = step !== undefined && step > 0 && step < 1 ? Math.ceil(-Math.log10(step)) : 1;
  const [draft, setDraft] = useState(value.toFixed(decimals));
  useEffect(() => {
    setDraft(value.toFixed(decimals));
  }, [value, decimals]);
  return (
    <div className="props-row">
      <span className="props-label">{label}</span>
      <div className="flex-row" style={{ gap: 3 }}>
        <input
          className="props-input"
          type="number"
          step={step ?? 1}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            let v = parseFloat(draft);
            if (isNaN(v)) {
              setDraft(value.toFixed(1));
              return;
            }
            if (min !== undefined) v = Math.max(min, v);
            onChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(value.toFixed(1));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="num-label">
          {unit}
        </span>
      </div>
    </div>
  );
}
