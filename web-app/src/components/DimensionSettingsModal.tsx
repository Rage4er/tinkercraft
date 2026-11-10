import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../store/ui-store";
import { useDimensionsStore } from "../store/dimensions-store";
import { restyleDimension } from "../store/dimension-mode";
import {
  DIMENSION_FONTS, DIMENSION_KINDS, DIMENSION_OFFSET_RANGE, DIMENSION_SIZE_RANGE,
  clampDimensionOffset, clampDimensionSize,
  type DimensionFont, type DimensionKind,
} from "../store/dimensions";

const KIND_KEY: Record<DimensionKind, string> = { standard: "dimensions.kindStandard", offset: "dimensions.kindOffset", projection: "dimensions.kindProjection" };
const KIND_TIP: Record<DimensionKind, string> = { standard: "dimensions.kindStandardTip", offset: "dimensions.kindOffsetTip", projection: "dimensions.kindProjectionTip" };
const FONT_KEY: Record<DimensionFont, string> = { "sans-serif": "dimensions.fontSans", monospace: "dimensions.fontMono", serif: "dimensions.fontSerif" };

/**
 * DIMENSIONS: «Настройки размеров» — тип (Стандарт / С отступом / Проекция), цвет, шрифт,
 * высота текста, отступ; единицы — мм. «Применить к новым» — так будут выглядеть следующие
 * размеры (`ui-store.dimensionDefaults`); «Применить к выбранному» — выделенному размеру.
 * Открывается со стилем выделенного размера (если есть), иначе — с настройками новых.
 * Esc / фон / «Отмена» — без изменений; клавиши не уходят в сочетания App.
 */
export default function DimensionSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const defaults = useUiStore((s) => s.dimensionDefaults);
  const setDefaults = useUiStore((s) => s.setDimensionDefaults);
  const selected = useDimensionsStore((s) => s.dimensions.find((d) => d.id === s.selectedDimensionId) ?? null);
  const init = selected ? { style: selected.style, offset: selected.offset } : defaults;
  const [kind, setKind] = useState<DimensionKind>(init.style.kind);
  const [color, setColor] = useState(init.style.color);
  const [font, setFont] = useState<DimensionFont>(init.style.font);
  const [size, setSize] = useState(String(init.style.size));
  const [offset, setOffset] = useState(String(init.offset));

  const draft = () => ({
    style: { kind, color, font, size: clampDimensionSize(Number(size)), units: "mm" as const },
    offset: clampDimensionOffset(Number(offset)),
  });
  const applyNew = () => { setDefaults(draft()); onClose(); };
  const applySelected = () => {
    if (!selected) return;
    const d = draft();
    restyleDimension(selected.id, { ...d.style, offset: d.offset });
    onClose();
  };

  return (
    <div
      className="text-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="text-modal-box dim-settings-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dim-settings-title"
        data-testid="dimension-settings"
      >
        <div className="text-modal-title" id="dim-settings-title">{t("dimensions.settings")}</div>

        <div className="dim-settings-field">
          <span className="dim-settings-label">{t("dimensions.type")}</span>
          <div className="dim-kind-group" role="radiogroup" aria-label={t("dimensions.type")}>
            {DIMENSION_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={kind === k ? "btn btn-compact active" : "btn btn-compact"}
                title={t(KIND_TIP[k])}
                data-testid={`dim-kind-${k}`}
                onClick={() => setKind(k)}
              >
                {t(KIND_KEY[k])}
              </button>
            ))}
          </div>
        </div>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("dimensions.color")}</span>
          <input type="color" value={color} data-testid="dim-color" onChange={(e) => setColor(e.target.value)} />
        </label>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("dimensions.font")}</span>
          <select className="text-modal-num dim-settings-select" value={font} data-testid="dim-font" onChange={(e) => setFont(e.target.value as DimensionFont)}>
            {DIMENSION_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{t(FONT_KEY[f])}</option>)}
          </select>
        </label>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("dimensions.size")}</span>
          <span>
            <input type="number" className="text-modal-num" min={DIMENSION_SIZE_RANGE.min} max={DIMENSION_SIZE_RANGE.max} step={0.5}
              value={size} data-testid="dim-size" onChange={(e) => setSize(e.target.value)} /> {t("units.mm")}
          </span>
        </label>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("dimensions.offset")}</span>
          <span>
            <input type="number" className="text-modal-num" min={DIMENSION_OFFSET_RANGE.min} max={DIMENSION_OFFSET_RANGE.max} step={1}
              value={offset} data-testid="dim-offset" disabled={kind !== "offset"} onChange={(e) => setOffset(e.target.value)} /> {t("units.mm")}
          </span>
        </label>

        <div className="dim-settings-field">
          <span className="dim-settings-label">{t("dimensions.units")}</span>
          <span data-testid="dim-units">{t("units.mm")}</span>
        </div>

        <div className="text-modal-actions">
          <button className="btn primary flex-1" data-testid="dim-apply-new" title={t("dimensions.applyNewTip")} onClick={applyNew}>
            {t("dimensions.applyNew")}
          </button>
          <button className="btn flex-1" data-testid="dim-apply-selected" title={t("dimensions.applySelectedTip")} disabled={!selected} onClick={applySelected}>
            {t("dimensions.applySelected")}
          </button>
          <button className="btn" onClick={onClose} autoFocus>
            {t("textModal.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
