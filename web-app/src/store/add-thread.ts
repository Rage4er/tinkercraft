// ============================================================
// add-thread — THREAD-GENERATOR: резьба (болт/гайка) в сцену
// ============================================================
//
// Как у SVG-EXTRUDE (store/add-svg.ts): меш строит воркер (workerBuildThread —
// свип витка вдоль спирали + булевы с цилиндром/шестигранником), объект —
// import_mesh через addRawMesh (префикс id `thr`, baked-узел дерева). История,
// undo/redo, CSG, .3dtc — как у импорта. Тело не параметрическое (шаг import_mesh).

import { useDocumentStore } from './document-store'
import { nextId } from './helpers'
import { workerBuildThread } from '../csg/worker-client'
import { sanitizeThreadParams, threadSizeOf, THREAD_LENGTH_MIN, THREAD_LENGTH_MAX, type ThreadKind, type ThreadSeries } from '../csg/thread-table'
import { notify } from './notifications'
import i18n from '../i18n'

/**
 * Создать резьбу: табличный размер (серия + id) × длина × болт/гайка.
 * true — объект добавлен (модалку можно закрыть). `build` — подмена для тестов.
 */
export async function addThreadObject(
  input: { series: ThreadSeries; sizeId: string; length: number; kind: ThreadKind },
  build: (objId: string, params: { series: string; sizeId: string; length: number; kind: string }) => Promise<{ vertices: Float32Array | number[]; indices: Uint32Array | number[] }> =
    (objId, params) => workerBuildThread(objId, params).then((r) => ({ vertices: r.vertices, indices: r.indices })),
): Promise<boolean> {
  const p = sanitizeThreadParams(input)
  if (!p) {
    notify(i18n.t('errors.threadBadParams', { min: THREAD_LENGTH_MIN, max: THREAD_LENGTH_MAX }), 'error')
    return false
  }
  const size = threadSizeOf(p.series, p.sizeId)!
  const store = useDocumentStore.getState()
  const objId = nextId('thr')   // ключ кэша воркера; объект получит свой id в addRawMesh
  let mesh: { vertices: Float32Array | number[]; indices: Uint32Array | number[] }
  try {
    mesh = await build(objId, { series: p.series, sizeId: p.sizeId, length: p.length, kind: p.kind })
  } catch (e) {
    console.warn('addThreadObject:', e)
    notify(i18n.t('errors.threadFailed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
    return false
  }
  const sizeDisp = size.id.replace(/-UNC$/, ' UNC').replace(/-UNF$/, ' UNF')
  const name = p.kind === 'nut'
    ? i18n.t('threadModal.nutName', { size: sizeDisp })
    : i18n.t('threadModal.boltName', { size: sizeDisp, length: p.length })
  const before = Object.keys(useDocumentStore.getState().objects).length
  await useDocumentStore.getState().addRawMesh(name, mesh.vertices, mesh.indices, undefined, 'thr')
  return Object.keys(useDocumentStore.getState().objects).length > before
}
