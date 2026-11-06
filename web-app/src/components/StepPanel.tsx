// ============================================================
// StepPanel — правка прошлого шага истории (Фаза 9.5.2: move)
// ============================================================
// Открывается кнопкой ✎ у шага в Timeline (ui-store.selectedStep — сырой индекс шага).
// Показывается вместо PropertiesPanel/ChildPropertiesPanel (панель, не модалка —
// PHASE_9_5_DESIGN §6). Значение коммитится по Enter / уходу из поля (NumInput):
// document-store.editStepParams записывает edit_step с каскадом пересчёта CSG и
// align ниже по истории (store/edit-step.ts). Результат виден в 3D сразу; при
// отказе store показывает уведомление с номером шага.

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import NumInput from './NumInput'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { effectiveOpAt, effectivePatches } from '../store/project-history'
import { buildRebuildMeta } from '../store/rebuild'
import { displayName } from './ComponentTree'
import type { MoveOperation, StepPatch, Vec3 } from '../csg/types'

type Group = 'delta' | 'rotDelta' | 'scaleDelta'
type Axis = 'x' | 'y' | 'z'
const AXES: Axis[] = ['x', 'y', 'z']

/** Шаг поля и единицы — по группе (точность показа NumInput следует из шага). */
const FIELD: Record<Group, { step: number; unit: string }> = {
  delta: { step: 0.1, unit: 'мм' },
  rotDelta: { step: 1, unit: '°' },
  scaleDelta: { step: 0.01, unit: '' },
}
const decimalsOf = (step: number) => (step < 1 ? Math.ceil(-Math.log10(step)) : 1)
const nonZero = (v: Vec3 | undefined): boolean =>
  !!v && (Math.abs(v.x) > 1e-9 || Math.abs(v.y) > 1e-9 || Math.abs(v.z) > 1e-9)

/** «(5, 0, −2.5)» — компактная запись вектора для подписи. */
export function fmtVec(v: Vec3 | undefined): string {
  const f = (n: number) => String(Math.round(n * 1000) / 1000)
  const u = v ?? { x: 0, y: 0, z: 0 }
  return `(${f(u.x)}, ${f(u.y)}, ${f(u.z)})`
}

/**
 * Новый патч шага: прежние эффективные дельты с заменой одного поля.
 * `null` — значение не изменилось с точностью показа поля (NumInput коммитит и
 * без правки, при уходе из поля — это не должно создавать шаг истории).
 */
export function movePatchWith(op: MoveOperation, group: Group, axis: Axis, value: number): StepPatch | null {
  const cur = op[group]?.[axis] ?? 0
  const dec = decimalsOf(FIELD[group].step)
  if (Number(cur.toFixed(dec)) === value) return null
  const base: Vec3 = { ...(op[group] ?? { x: 0, y: 0, z: 0 }) }
  base[axis] = value
  return {
    kind: 'move',
    delta: group === 'delta' ? base : { ...op.delta },
    ...(group === 'rotDelta' ? { rotDelta: base } : op.rotDelta ? { rotDelta: { ...op.rotDelta } } : {}),
    ...(group === 'scaleDelta' ? { scaleDelta: base } : op.scaleDelta ? { scaleDelta: { ...op.scaleDelta } } : {}),
  }
}

export default function StepPanel() {
  const { t } = useTranslation()
  const stepIndex = useUiStore((s) => s.selectedStep)
  const setSelectedStep = useUiStore((s) => s.setSelectedStep)
  const operations = useDocumentStore((s) => s.operations)
  const historyIndex = useDocumentStore((s) => s.historyIndex)
  const busy = useDocumentStore((s) => s.busy)
  const editStepParams = useDocumentStore((s) => s.editStepParams)

  const info = useMemo(() => {
    if (stepIndex === null || stepIndex >= historyIndex) return null
    const prefix = operations.slice(0, historyIndex)
    const raw = prefix[stepIndex]
    const eff = effectiveOpAt(prefix, stepIndex)
    if (!raw || raw.type !== 'move' || !eff || eff.type !== 'move') return null
    // имена объектов на момент шага — по эффективной истории до него
    const meta = buildRebuildMeta(prefix.slice(0, stepIndex)).meta
    const edit = effectivePatches(prefix).get(stepIndex)
    return {
      names: raw.ids.map((id) => (meta[id] ? displayName({ id, shapeType: meta[id].shapeType, name: meta[id].name }, t) : id)).join(', '),
      original: raw,
      eff,
      editedBy: edit ? edit.editIndex + 1 : null,
    }
  }, [stepIndex, operations, historyIndex, t])

  if (stepIndex === null || !info) return null
  const { eff } = info

  const commit = (group: Group, axis: Axis, v: number) => {
    const patch = movePatchWith(eff, group, axis, v)
    if (patch) void editStepParams(stepIndex, patch)
  }

  const groups: Array<{ group: Group; title: string; vec: Vec3 }> = [
    { group: 'delta', title: t('stepPanel.offset'), vec: eff.delta },
  ]
  // Поворот и масштаб — только если шаг их меняет (moveObject пишет их всегда, обычно
  // нулями; gizmo поворота/масштаба — отдельными шагами). В патч они уходят целиком.
  if (nonZero(eff.rotDelta)) groups.push({ group: 'rotDelta', title: t('stepPanel.rotation'), vec: eff.rotDelta! })
  if (nonZero(eff.scaleDelta)) groups.push({ group: 'scaleDelta', title: t('stepPanel.scale'), vec: eff.scaleDelta! })

  return (
    <div data-testid="step-panel" data-step={stepIndex}>
      <div className="props-row">
        <button className="btn btn-compact" onClick={() => setSelectedStep(null)}>
          ← {t('stepPanel.back')}
        </button>
      </div>
      <div className="props-section-title">
        {t('stepPanel.title', { step: stepIndex + 1, name: t('stepPanel.move') })}
      </div>
      <div className="props-row">
        <span className="props-label">{t('stepPanel.target')}</span>
        <span className="props-value">{info.names}</span>
      </div>
      <div className="props-row">
        <span className="props-label">{t('stepPanel.original')}</span>
        <span className="props-value" data-testid="step-original">Δ {fmtVec(info.original.delta)}</span>
      </div>
      {info.editedBy !== null && (
        <div className="text-sm text-muted-xs" data-testid="step-edited" style={{ padding: '2px 12px 6px' }}>
          {t('stepPanel.edited', { step: info.editedBy })}
        </div>
      )}
      {groups.map(({ group, title, vec }) => (
        <div className="csg-group" data-testid={`step-${group}`} key={group}>
          <div className="csg-group-title">{title}</div>
          {AXES.map((axis) => (
            <NumInput
              key={`${stepIndex}:${group}:${axis}`}
              label={group === 'delta' ? `Δ${axis.toUpperCase()}` : `${title} ${axis.toUpperCase()}`}
              unit={FIELD[group].unit}
              step={FIELD[group].step}
              value={vec[axis]}
              disabled={busy}
              onChange={(v) => commit(group, axis, v)}
            />
          ))}
        </div>
      ))}
      <div className="text-sm text-muted-xs" data-testid="step-status" style={{ padding: '4px 12px' }}>
        {busy ? t('stepPanel.recomputing') : t('stepPanel.hint')}
      </div>
    </div>
  )
}
