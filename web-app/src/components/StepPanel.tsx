// ============================================================
// StepPanel — правка прошлого шага истории (Фаза 9.5.2: move, 9.5.3: mirror, 9.5.4: extrude)
// ============================================================
// Открывается кнопкой ✎ у шага в Timeline (ui-store.selectedStep — сырой индекс шага).
// Показывается вместо PropertiesPanel/ChildPropertiesPanel (панель, не модалка —
// PHASE_9_5_DESIGN §6). Move — значение коммитится по Enter / уходу из поля (NumInput);
// mirror — плоскость коммитится сразу по выбору; extrude — глубина (Enter/blur, ось — только
// просмотр). Затем
// document-store.editStepParams записывает edit_step с каскадом пересчёта CSG и
// align ниже по истории (store/edit-step.ts). Результат виден в 3D сразу; при
// отказе store показывает уведомление с номером шага.

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import NumInput from './NumInput'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { effectiveOpAt, effectivePatches } from '../store/project-history'
import { isStepEditable } from '../store/edit-step'
import { buildRebuildMeta } from '../store/rebuild'
import { displayName } from './ComponentTree'
import type { MoveOperation, MirrorPlane, StepPatch, Vec3 } from '../csg/types'

type Group = 'delta' | 'rotDelta' | 'scaleDelta'
type Axis = 'x' | 'y' | 'z'
const AXES: Axis[] = ['x', 'y', 'z']

/** Шаг поля и единицы — по группе (точность показа NumInput следует из шага). */
const FIELD: Record<Group, { step: number; unit?: string }> = {
  delta: { step: 0.1 },                 // единица — «мм» NumInput на языке интерфейса (UX-AUDIT-7)
  rotDelta: { step: 1, unit: '°' },
  scaleDelta: { step: 0.01, unit: '' },
}
const decimalsOf = (step: number) => (step < 1 ? Math.ceil(-Math.log10(step)) : 1)
const nonZero = (v: Vec3 | undefined): boolean =>
  !!v && (Math.abs(v.x) > 1e-9 || Math.abs(v.y) > 1e-9 || Math.abs(v.z) > 1e-9)

/** Число для подписи: до 0.001, без «-0». */
export function fmtNum(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return String(r === 0 ? 0 : r)
}

/** «(5, 0, −2.5)» — компактная запись вектора для подписи. */
export function fmtVec(v: Vec3 | undefined): string {
  const u = v ?? { x: 0, y: 0, z: 0 }
  return `(${fmtNum(u.x)}, ${fmtNum(u.y)}, ${fmtNum(u.z)})`
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
    if (!raw || !isStepEditable(raw) || (raw.type !== 'move' && raw.type !== 'mirror' && raw.type !== 'group')) return null
    if (!eff || eff.type !== raw.type || (eff.type !== 'move' && eff.type !== 'mirror' && eff.type !== 'group')) return null
    // имена объектов на момент шага — по эффективной истории до него
    // (mirror — объекты, которые зеркалятся: копии появляются этим шагом)
    const meta = buildRebuildMeta(prefix.slice(0, stepIndex)).meta
    const edit = effectivePatches(prefix).get(stepIndex)
    // mirror — что зеркалится; extrude — что выдавливается (база)
    const ids = raw.type === 'mirror' ? raw.originalIds : raw.type === 'group' ? [raw.source!.baseId] : raw.ids
    return {
      names: ids.map((id) => (meta[id] ? displayName({ id, shapeType: meta[id].shapeType, name: meta[id].name, text: meta[id].text }, t) : id)).join(', '),
      original: raw.type === 'move' ? `Δ ${fmtVec(raw.delta)}`
        : raw.type === 'mirror' ? raw.plane
          : `${fmtNum(raw.source!.depth)} (${raw.source!.axis})`,
      eff,
      editedBy: edit ? edit.editIndex + 1 : null,
    }
  }, [stepIndex, operations, historyIndex, t])

  if (stepIndex === null || !info) return null
  const { eff } = info
  const edit = (patch: StepPatch | null) => { if (patch) void editStepParams(stepIndex, patch) }

  return (
    <div data-testid="step-panel" data-step={stepIndex}>
      <div className="props-row">
        <button className="btn btn-compact" onClick={() => setSelectedStep(null)}>
          ← {t('stepPanel.back')}
        </button>
      </div>
      <div className="props-section-title">
        {t('stepPanel.title', { step: stepIndex + 1, name: t(eff.type === 'mirror' ? 'stepPanel.mirror' : eff.type === 'group' ? 'stepPanel.extrude' : 'stepPanel.move') })}
      </div>
      <div className="props-row">
        <span className="props-label">{t('stepPanel.target')}</span>
        <span className="props-value">{info.names}</span>
      </div>
      <div className="props-row">
        <span className="props-label">{t('stepPanel.original')}</span>
        <span className="props-value" data-testid="step-original">{info.original}</span>
      </div>
      {info.editedBy !== null && (
        <div className="text-sm text-muted-xs" data-testid="step-edited" style={{ padding: '2px 12px 6px' }}>
          {t('stepPanel.edited', { step: info.editedBy })}
        </div>
      )}
      {eff.type === 'move'
        ? <MoveForm stepIndex={stepIndex} op={eff} busy={busy} onPatch={edit} />
        : eff.type === 'mirror'
          ? <MirrorForm plane={eff.plane} busy={busy} onPatch={edit} />
          : eff.source && <ExtrudeForm stepIndex={stepIndex} axis={eff.source.axis} depth={eff.source.depth} busy={busy} onPatch={edit} />}
      <div className="text-sm text-muted-xs" data-testid="step-status" style={{ padding: '4px 12px' }}>
        {busy ? t('stepPanel.recomputing') : t(eff.type === 'mirror' ? 'stepPanel.hintMirror' : 'stepPanel.hint')}
      </div>
    </div>
  )
}

/** Поля шага move: ΔX/ΔY/ΔZ; поворот/масштаб — только если шаг их меняет. */
function MoveForm({ stepIndex, op, busy, onPatch }: {
  stepIndex: number; op: MoveOperation; busy: boolean; onPatch: (p: StepPatch | null) => void
}) {
  const { t } = useTranslation()
  const groups: Array<{ group: Group; title: string; vec: Vec3 }> = [
    { group: 'delta', title: t('stepPanel.offset'), vec: op.delta },
  ]
  // Поворот и масштаб — только если шаг их меняет (moveObject пишет их всегда, обычно
  // нулями; gizmo поворота/масштаба — отдельными шагами). В патч они уходят целиком.
  if (nonZero(op.rotDelta)) groups.push({ group: 'rotDelta', title: t('stepPanel.rotation'), vec: op.rotDelta! })
  if (nonZero(op.scaleDelta)) groups.push({ group: 'scaleDelta', title: t('stepPanel.scale'), vec: op.scaleDelta! })
  return (
    <>
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
              onChange={(v) => onPatch(movePatchWith(op, group, axis, v))}
            />
          ))}
        </div>
      ))}
    </>
  )
}

const PLANES: MirrorPlane[] = ['YZ', 'XZ', 'XY']

/** Плоскость шага mirror: выбор применяется сразу (без «Применить»), та же — ничего не делает. */
function MirrorForm({ plane, busy, onPatch }: {
  plane: MirrorPlane; busy: boolean; onPatch: (p: StepPatch | null) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="csg-group" data-testid="step-mirror">
      <div className="csg-group-title" id="step-plane-label">{t('stepPanel.plane')}</div>
      <div className="props-row" role="radiogroup" aria-labelledby="step-plane-label" style={{ gap: 4 }}>
        {PLANES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === plane}
            className={`btn btn-compact${p === plane ? ' active' : ''}`}
            data-testid={`step-plane-${p}`}
            disabled={busy}
            onClick={() => onPatch(p === plane ? null : { kind: 'mirror', plane: p })}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Новая глубина extrude из поля: `null` — не изменилась с точностью показа (0.1) или ~0
 * (плита нулевой толщины). Знак задаёт сторону: минус выдавливает от грани min.
 */
export function extrudePatchWith(depth: number, value: number): StepPatch | null {
  if (Number(depth.toFixed(1)) === value || Math.abs(value) < 0.01) return null
  return { kind: 'extrude', depth: value }
}

/** Глубина шага extrude (Enter/blur); ось — только просмотр (смена оси — новый extrude). */
function ExtrudeForm({ stepIndex, axis, depth, busy, onPatch }: {
  stepIndex: number; axis: 'X' | 'Y' | 'Z'; depth: number; busy: boolean; onPatch: (p: StepPatch | null) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="csg-group" data-testid="step-extrude">
      <div className="csg-group-title">{t('stepPanel.extrude')}</div>
      <div className="props-row">
        <span className="props-label">{t('stepPanel.axis')}</span>
        <span className="props-value" data-testid="step-axis">{axis}</span>
      </div>
      <NumInput
        key={`${stepIndex}:depth`}
        label={t('stepPanel.depth')}
        step={0.1}
        value={depth}
        disabled={busy}
        onChange={(v) => onPatch(extrudePatchWith(depth, v))}
      />
    </div>
  )
}

