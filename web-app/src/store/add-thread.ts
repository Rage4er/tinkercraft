// ============================================================
// add-thread — THREAD-GENERATOR: резьба (болт/гайка) в сцену
// ============================================================
// Меш строит воркер, объект добавляется как import_mesh через addRawMesh.
// История, undo/redo, CSG и .3dtc — как у импорта; тело не параметрическое.

import { useDocumentStore } from './document-store'
import { nextId } from './helpers'
import { workerBuildThread } from '../csg/worker-client'
import { sanitizeThreadParams, threadSizeOf, THREAD_LENGTH_MIN, THREAD_LENGTH_MAX, type ThreadHand, type ThreadKind, type ThreadSeries } from '../csg/thread-table'
import { notify } from './notifications'
import i18n from '../i18n'

export async function addThreadObject(
  input: { series: ThreadSeries; sizeId: string; length: number; kind: ThreadKind; hand?: ThreadHand },
  build: (objId: string, params: { series: string; sizeId: string; length: number; kind: string; hand?: string }) => Promise<{ vertices: Float32Array | number[]; indices: Uint32Array | number[] }> =
    (objId, params) => workerBuildThread(objId, params).then((r) => ({ vertices: r.vertices, indices: r.indices })),
): Promise<boolean> {
  const p = sanitizeThreadParams(input)
  if (!p) {
    notify(i18n.t('errors.threadBadParams', { min: THREAD_LENGTH_MIN, max: THREAD_LENGTH_MAX }), 'error')
    return false
  }
  const size = threadSizeOf(p.series, p.sizeId)!
  const store = useDocumentStore.getState()
  const objId = nextId('thr')
  let mesh: { vertices: Float32Array | number[]; indices: Uint32Array | number[] }
  try {
    mesh = await build(objId, { series: p.series, sizeId: p.sizeId, length: p.length, kind: p.kind, hand: p.hand ?? 'right' })
  } catch (e) {
    console.warn('addThreadObject:', e)
    notify(i18n.t('errors.threadFailed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
    return false
  }
  const hand = p.hand === 'left' ? ` ${i18n.t('threadModal.leftHandShort')}` : ''
  const sizeDisp = size.id.replace(/-UNC$/, ' UNC').replace(/-UNF$/, ' UNF') + hand
  const name = p.kind === 'nut'
    ? i18n.t('threadModal.nutName', { size: sizeDisp })
    : i18n.t('threadModal.boltName', { size: sizeDisp, length: p.length })
  const before = Object.keys(useDocumentStore.getState().objects).length
  await useDocumentStore.getState().addRawMesh(name, mesh.vertices, mesh.indices, undefined, 'thr')
  return Object.keys(useDocumentStore.getState().objects).length > before
}
