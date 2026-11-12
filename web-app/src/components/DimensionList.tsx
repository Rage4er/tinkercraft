import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDimensionsStore } from "../store/dimensions-store";
import { useDocumentStore } from "../store/document-store";
import { deleteDimension } from "../store/dimension-mode";
import { dimensionValue } from "../store/dimensions";
import { useSettingsStore } from "../store/settings";
import { lengthLabel } from "../store/units";
import { displayName } from "./ComponentTree";
import { DeleteIcon } from "./icons";

/**
 * DIMENSIONS: список размеров (левая панель, секция «Размеры»): «Куб 1 — Сфера 2 · 25.0 мм»,
 * клик — выделить размер (как клик по нему во вьюпорте), корзина — удалить. Размеры, чьих
 * объектов сейчас нет (ушли в CSG, удалены, отменены), не показываются — вернутся с объектами.
 * Число — живое: пересчитывается при сдвиге / масштабе / смене размеров объектов.
 */
export default function DimensionList() {
  const { t } = useTranslation();
  const dimensions = useDimensionsStore((s) => s.dimensions);
  const selectedId = useDimensionsStore((s) => s.selectedDimensionId);
  const show = useDimensionsStore((s) => s.showDimensions);
  const selectDimension = useDimensionsStore((s) => s.selectDimension);
  const clearSelection = useDocumentStore((s) => s.clearSelection);
  const objects = useDocumentStore((s) => s.objects);
  const units = useSettingsStore((s) => s.units);   // APP-SETTINGS: значения — в единице из настроек
  const rows = useMemo(() => dimensions.flatMap((d) => {
    const value = dimensionValue(d, objects);
    if (value === null) return [];
    const a = displayName(objects[d.objectIdA], t);
    const b = displayName(objects[d.objectIdB], t);
    return [{ id: d.id, names: d.objectIdA === d.objectIdB ? a : `${a} — ${b}`, value: lengthLabel(t, value, units), color: d.style.color }];
  }), [dimensions, objects, t, units]);

  if (rows.length === 0) return <div className="ct-empty" data-testid="dimension-empty">{t("dimensions.empty")}</div>;
  return (
    <div className="object-list dim-list" data-testid="dimension-list">
      {!show && <div className="ct-empty">{t("dimensions.hidden")}</div>}
      {rows.map((r) => (
        <div
          key={r.id}
          className={`object-list-item${r.id === selectedId ? " selected" : ""}`}
          data-testid="dimension-row"
          data-dimension-id={r.id}
          onClick={() => {
            selectDimension(r.id);
            clearSelection();
          }}
        >
          <div className="object-list-swatch" style={{ background: r.color }} />
          <span className="object-list-label" title={r.names}>{r.names}</span>
          <strong className="dim-list-value" data-testid="dimension-value">{r.value}</strong>
          <button
            type="button"
            className="ct-btn ct-del"
            aria-label={t("dimensions.delete")}
            title={t("dimensions.delete")}
            data-testid="dimension-delete"
            onClick={(e) => {
              e.stopPropagation();
              deleteDimension(r.id);
            }}
          >
            <DeleteIcon size={32} />
          </button>
        </div>
      ))}
    </div>
  );
}
