import { useTranslation } from "react-i18next";
import { useDimensionsStore } from "../store/dimensions-store";
import { useDocumentStore } from "../store/document-store";
import { useUiStore } from "../store/ui-store";
import { deleteDimension, restyleDimension } from "../store/dimension-mode";
import { DIMENSION_KINDS, DIMENSION_OFFSET_RANGE, dimensionValue, type DimensionKind } from "../store/dimensions";
import { useSettingsStore } from "../store/settings";
import { lengthLabel } from "../store/units";
import { displayName } from "./ComponentTree";
import NumInput from "./NumInput";

const KIND_KEY: Record<DimensionKind, string> = { standard: "dimensions.kindStandard", offset: "dimensions.kindOffset", projection: "dimensions.kindProjection" };

/**
 * DIMENSIONS: панель выделенного размера (вместо свойств объекта): значение (живое), между какими
 * объектами, тип (Стандарт / С отступом / Проекция), отступ, «Стиль…» (окно настроек — цвет,
 * шрифт, высота текста), «Удалить размер» (= Delete).
 */
export default function DimensionPanel() {
  const { t } = useTranslation();
  const dim = useDimensionsStore((s) => s.dimensions.find((d) => d.id === s.selectedDimensionId) ?? null);
  const selectDimension = useDimensionsStore((s) => s.selectDimension);
  const units = useSettingsStore((s) => s.units);   // APP-SETTINGS: значение — в единице из настроек
  const objects = useDocumentStore((s) => s.objects);
  const setShowSettings = useUiStore((s) => s.setShowDimensionSettings);
  if (!dim) return null;
  const value = dimensionValue(dim, objects);
  const A = objects[dim.objectIdA], B = objects[dim.objectIdB];
  const names = A && B ? (A.id === B.id ? displayName(A, t) : `${displayName(A, t)} — ${displayName(B, t)}`) : "—";

  return (
    <div data-testid="dimension-panel" data-dimension-id={dim.id} data-kind={dim.style.kind} data-color={dim.style.color} data-font={dim.style.font}>
      <div className="props-row">
        <button className="btn btn-compact" onClick={() => selectDimension(null)}>
          ← {t("stepPanel.back")}
        </button>
      </div>
      <div className="props-section-title">{t("dimensions.panelTitle")}</div>
      <div className="props-row">
        <span className="props-label">{t("dimensions.value")}</span>
        <strong className="props-value" data-testid="dimension-panel-value">
          {value === null ? "—" : lengthLabel(t, value, units)}
        </strong>
      </div>
      <div className="props-row">
        <span className="props-label">{t("dimensions.between")}</span>
        <span className="props-value">{names}</span>
      </div>
      <div className="props-row">
        <span className="props-label">{t("dimensions.type")}</span>
        <div className="dim-kind-group" role="radiogroup" aria-label={t("dimensions.type")}>
          {DIMENSION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={dim.style.kind === k}
              className={dim.style.kind === k ? "btn btn-compact active" : "btn btn-compact"}
              data-testid={`dimension-panel-kind-${k}`}
              onClick={() => restyleDimension(dim.id, { kind: k })}
            >
              {t(KIND_KEY[k])}
            </button>
          ))}
        </div>
      </div>
      {dim.style.kind === "offset" && (
        <NumInput
          label={t("dimensions.offset")}
          value={dim.offset}
          min={DIMENSION_OFFSET_RANGE.min}
          max={DIMENSION_OFFSET_RANGE.max}
          onChange={(v) => restyleDimension(dim.id, { offset: v })}
        />
      )}
      <div className="props-row dim-panel-actions">
        <button className="btn btn-compact" data-testid="dimension-panel-style" onClick={() => setShowSettings(true)}>
          {t("dimensions.style")}
        </button>
        <button className="btn btn-compact danger" data-testid="dimension-panel-delete" onClick={() => deleteDimension(dim.id)}>
          {t("dimensions.delete")}
        </button>
      </div>
    </div>
  );
}
