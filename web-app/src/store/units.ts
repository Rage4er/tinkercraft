// ============================================================
// units.ts — единицы длины в интерфейсе (APP-SETTINGS)
// ============================================================
// Модель и файлы — всегда в миллиметрах. Единица из настроек — только показ и ввод: поля длины
// (`NumInput` без явной единицы), линейка, размеры. Пересчёт: показ = мм / k, ввод → мм = значение × k.

export type LengthUnit = 'mm' | 'cm' | 'in'
export const LENGTH_UNITS: readonly LengthUnit[] = ['mm', 'cm', 'in']
/** Миллиметров в единице */
export const MM_PER_UNIT: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4 }
/** Сколько знаков добавить к точности мм, чтобы шаг поля остался ≈ 0,1 мм */
const EXTRA_DECIMALS: Record<LengthUnit, number> = { mm: 0, cm: 1, in: 2 }

export function isLengthUnit(v: unknown): v is LengthUnit {
  return typeof v === 'string' && (LENGTH_UNITS as readonly string[]).includes(v)
}
/** мм → значение в единице */
export function toUnit(mm: number, unit: LengthUnit): number { return mm / MM_PER_UNIT[unit] }
/** значение в единице → мм */
export function fromUnit(v: number, unit: LengthUnit): number { return v * MM_PER_UNIT[unit] }
/** Знаков после запятой в единице при `mmDecimals` знаках для мм */
export function unitDecimals(mmDecimals: number, unit: LengthUnit): number { return mmDecimals + EXTRA_DECIMALS[unit] }
/** Длина (мм) строкой в единице: `mmDecimals` — точность для мм; без «-0.0» */
export function formatLength(mm: number, unit: LengthUnit, mmDecimals = 2): string {
  const d = unitDecimals(mmDecimals, unit)
  const f = 10 ** d
  return (Math.round(toUnit(mm, unit) * f) / f + 0).toFixed(d)
}
/** Ключ i18n подписи единицы */
export const unitLabelKey = (unit: LengthUnit) => `units.${unit}`
/** Подпись длины «20.0 мм» / «2.00 см» / «0.787 дюйм»: шаблон `dimensions.label` ({{value}} {{unit}}) */
export function lengthLabel(t: (key: string, opts?: Record<string, unknown>) => string, mm: number, unit: LengthUnit, mmDecimals = 1): string {
  return t('dimensions.label', { value: formatLength(mm, unit, mmDecimals), unit: t(unitLabelKey(unit)) })
}
