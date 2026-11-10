// ============================================================
// placement-mode.ts — режим размещения фигуры (PLUG-AND-PLAY)
// ============================================================
// Клик по фигуре палитры не создаёт её сразу, а включает режим: полупрозрачное превью
// следует за курсором и встаёт на плоскость под ним — грань объекта, сетку (XY) или
// плоскость оси (клавиши X / Y / Z: YZ / XZ / XY; та же клавиша ещё раз — снова грань /
// сетка). Клик — фигура создаётся там, где превью (стоит на плоскости, повёрнута по её
// нормали), режим выключается. Enter — то же; без превью (курсор не во вьюпорте) — рядом с
// прошлыми, как раньше. Esc / правый клик / «Отмена» — выход, фигура не создаётся.
// Клик мимо любой плоскости (в небо) — ничего, режим остаётся. Двойной клик по иконке —
// тот же один режим (фигур не прибавляется).
//
// Геометрия — `placement.ts` (чистые функции). Превью — меш той же фигуры из воркера
// (параметры по умолчанию, кэш по типу): по нему видно форму и считается основание
// (`meshBottom`), так что созданная фигура совпадает с превью. Не совмещается с режимами
// «Выровнять» и CSG A → B (вход сюда выходит из них, их вход — отсюда: `usePlacementMode`),
// с линейкой; гизмо на время режима скрыт (Viewport3D).

import { create } from 'zustand'
import type { ShapeType, TransformNR } from '../csg/types'
import { workerBuildShape, workerDeleteObjects } from '../csg/worker-client'
import { defaultShapeParams } from './helpers'
import { addShapeWhenIdle } from './add-shape-queue'
import { useUiStore } from './ui-store'
import { useAlignModeStore } from './align-mode'
import { useCsgGroupModeStore } from './csg-group-mode'
import { meshBottom, resolvePlacement, type PlacementAim, type PlacementAxis, type PlacementPreview } from './placement'

/** Фигуры палитры, которые размещаются (текст — своё окно ввода). */
export type PlaceableShape = Exclude<ShapeType, 'csg' | 'imported' | 'text'>

/** Меш превью: вершины в origin (центр масс), как у объекта. */
export interface PreviewMesh { vertices: Float32Array; indices: Uint32Array; normals: Float32Array | null }

export interface PlacementModeState {
  active: true
  shapeType: PlaceableShape
  /** Плоскость оси, зафиксированная клавишей X / Y / Z (null — грань / сетка под курсором). */
  lock: PlacementAxis | null
  /** Превью под курсором (null — курсор не во вьюпорте или луч мимо плоскостей). */
  preview: PlacementPreview | null
  /** Меш превью (null — ещё строится). */
  mesh: PreviewMesh | null
}

interface PlacementModeStore {
  placementMode: PlacementModeState | null
  startPlacement: (shapeType: PlaceableShape) => void
  setPreview: (preview: PlacementPreview | null) => void
  /** Зафиксировать плоскость оси (null — снова грань / сетка под курсором). */
  setSnap: (axis: PlacementAxis | null) => void
  /** Клавиша X / Y / Z: та же ось — снять фиксацию, другая — сменить. */
  toggleAxis: (axis: PlacementAxis) => void
  /** Курсор во вьюпорте: луч и грань под ним (null — курсор ушёл) → превью. */
  aim: (aim: PlacementAim | null) => void
  /**
   * Поставить фигуру: `at` — клик (луч и грань в точке клика); без `at` — Enter: в превью,
   * а без него — рядом с прошлыми. `true` — фигура создана; клик мимо плоскостей — `false`,
   * режим остаётся.
   */
  confirmPlacement: (at?: PlacementAim) => Promise<boolean>
  cancelPlacement: () => void
}

const PREVIEW_ID = '__placement_preview__'
/** Меши превью по типу (параметры по умолчанию — меш не меняется). */
const meshCache = new Map<PlaceableShape, PreviewMesh>()
const meshLoading = new Map<PlaceableShape, Promise<PreviewMesh>>()
/** Последнее положение курсора во вьюпорте (Enter, смена оси, догрузка меша — без движения мыши). */
let lastAim: PlacementAim | null = null

const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

/** Меш фигуры с параметрами по умолчанию (воркер; временный объект в кэше воркера удаляется). */
export function loadPreviewMesh(shapeType: PlaceableShape): Promise<PreviewMesh> {
  const cached = meshCache.get(shapeType)
  if (cached) return Promise.resolve(cached)
  const pending = meshLoading.get(shapeType)
  if (pending) return pending
  const id = `${PREVIEW_ID}${shapeType}`
  const p = (async () => {
    try {
      const r = await workerBuildShape(id, shapeType, defaultShapeParams(shapeType), IDENTITY)
      await workerDeleteObjects([id]).catch(() => { })
      const mesh: PreviewMesh = { vertices: r.vertices, indices: r.indices, normals: r.normals }
      meshCache.set(shapeType, mesh)
      return mesh
    } finally {
      meshLoading.delete(shapeType)
    }
  })()
  meshLoading.set(shapeType, p)
  return p
}

function previewFor(m: PlacementModeState, aim: PlacementAim | null, mesh: PreviewMesh | null): PlacementPreview | null {
  if (!aim || !mesh) return null
  return resolvePlacement(aim, { lock: m.lock, snap: useUiStore.getState().snapValue, bottom: meshBottom(mesh.vertices) })
}

export const usePlacementModeStore = create<PlacementModeStore>((set, get) => ({
  placementMode: null,

  startPlacement: (shapeType) => {
    const cur = get().placementMode
    if (cur?.shapeType === shapeType) return                  // повторный / двойной клик по той же иконке
    // режим не совмещается с «Выровнять», режимом CSG A → B и линейкой
    useAlignModeStore.getState().exitAlignMode()
    if (useCsgGroupModeStore.getState().csgGroupMode) useCsgGroupModeStore.getState().cancelCsgGroup()
    useUiStore.getState().setRulerActive(false)
    const mesh = meshCache.get(shapeType) ?? null
    const state: PlacementModeState = { active: true, shapeType, lock: cur?.lock ?? null, preview: null, mesh }
    set({ placementMode: { ...state, preview: previewFor(state, lastAim, mesh) } })
    if (!mesh) {
      loadPreviewMesh(shapeType).then((loaded) => {
        const m = get().placementMode
        if (m?.shapeType !== shapeType || m.mesh) return
        const next = { ...m, mesh: loaded }
        set({ placementMode: { ...next, preview: previewFor(next, lastAim, loaded) } })
      }, (e: unknown) => { console.error('placement preview:', e) })
    }
  },

  setPreview: (preview) => {
    const m = get().placementMode
    if (!m) return
    set({ placementMode: { ...m, preview } })
  },

  setSnap: (axis) => {
    const m = get().placementMode
    if (!m) return
    const next = { ...m, lock: axis }
    set({ placementMode: { ...next, preview: previewFor(next, lastAim, m.mesh) } })
  },

  toggleAxis: (axis) => {
    const m = get().placementMode
    if (!m) return
    get().setSnap(m.lock === axis ? null : axis)
  },

  aim: (aim) => {
    lastAim = aim
    const m = get().placementMode
    if (!m) return
    get().setPreview(previewFor(m, aim, m.mesh))
  },

  confirmPlacement: async (at) => {
    const m = get().placementMode
    if (!m) return false
    const aim = at ?? lastAim
    let transform: TransformNR | undefined
    if (aim) {
      const mesh = m.mesh ?? await loadPreviewMesh(m.shapeType).catch(() => null)
      const preview = mesh ? previewFor(m, aim, mesh) : null
      if (!preview) return false                               // мимо плоскостей — режим остаётся
      transform = preview.transform
    }
    if (get().placementMode !== m) return false               // отменён / уже поставлен, пока ждали меш
    set({ placementMode: null })
    lastAim = null
    return addShapeWhenIdle(m.shapeType, { at: transform })
  },

  cancelPlacement: () => {
    lastAim = null
    if (get().placementMode) set({ placementMode: null })
  },
}))
