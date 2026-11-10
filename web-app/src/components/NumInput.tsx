import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Значение поля для показа без «-0.0» (UX-NUMINPUT): если после округления до
 * `decimals` знаков получается ноль (−0, −1e-6, −0.04 при 1 знаке), минус убирается.
 * Только отображение — само значение не меняется.
 */
export function formatNum(v: number, decimals: number): string {
  const s = v.toFixed(decimals);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

// ---- Numeric input with draft editing ----
export default function NumInput({
  id,
  label,
  value,
  disabled,
  unit,
  min,
  max,
  step,
  integer,
  onChange,
}: {
  /** id поля (связь с <label>); по умолчанию `num-input-<label>` — задавайте, если метки повторяются */
  id?: string;
  label: string;
  value: number;
  disabled?: boolean;
  /** единица у поля; по умолчанию — «мм» на языке интерфейса (UX-AUDIT-7) */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** целое поле (граней и т.п.): показ без дробной части, шаг 1, ввод округляется (UX-AUDIT-8) */
  integer?: boolean;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  const unitLabel = unit ?? t("units.mm");
  const decimals = integer ? 0 : step !== undefined && step > 0 && step < 1 ? Math.ceil(-Math.log10(step)) : 1;
  const inputId = id ?? `num-input-${label}`;
  const [draft, setDraft] = useState(formatNum(value, decimals));
  useEffect(() => {
    setDraft(formatNum(value, decimals));
  }, [value, decimals]);
  return (
    <div className="props-row">
      <label className="props-label" htmlFor={inputId}>{label}</label>
      <div className="flex-row" style={{ gap: 3 }}>
        <input
          id={inputId}
          className="props-input"
          type="number"
          step={integer ? 1 : step ?? 1}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            let v = parseFloat(draft);
            if (isNaN(v)) {
              setDraft(formatNum(value, decimals));
              return;
            }
            if (integer) v = Math.round(v);
            if (min !== undefined) v = Math.max(min, v);
            // FIX (MED-18-36): Validate max value — user can enter arbitrarily large numbers
            if (max !== undefined) v = Math.min(max, v);
            onChange(v === 0 ? 0 : v); // −0 → 0
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(formatNum(value, decimals));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="num-label">
          {unitLabel}
        </span>
      </div>
    </div>
  );
}
