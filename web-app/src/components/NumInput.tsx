import { useState, useEffect } from "react";

// ---- Numeric input with draft editing ----
export default function NumInput({
  label,
  value,
  disabled,
  unit = "мм",
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  unit?: string;
  min?: number;
  max?: number;
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
      <label className="props-label" htmlFor={`num-input-${label}`}>{label}</label>
      <div className="flex-row" style={{ gap: 3 }}>
        <input
          id={`num-input-${label}`}
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
            // FIX (MED-18-36): Validate max value — user can enter arbitrarily large numbers
            if (max !== undefined) v = Math.min(max, v);
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
