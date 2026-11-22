// ============================================================
// add-thread — THREAD-GENERATOR / THREAD-PARAMETRIC: резьба в сцену
// ============================================================
// Валидация — здесь (ошибка до изменения документа), создание объекта и операции
// `thread` — в document-store.addThread. Меш при rebuild строится заново из params.

import { useDocumentStore } from './document-store'
import { normalizeThreadParams, THREAD_LENGTH_MIN, THREAD_LENGTH_MAX, type ThreadHand, type ThreadKind, type ThreadSeries } from '../csg/thread-table'
import { notify } from './notifications'
import i18n from '../i18n'

export async function addThreadObject(input: {
  series: ThreadSeries
  sizeId: string
  length: number
  kind: ThreadKind
  hand?: ThreadHand
  starts?: number
}): Promise<boolean> {
  const params = normalizeThreadParams(input)
  if (!params) {
    notify(i18n.t('errors.threadBadParams', { min: THREAD_LENGTH_MIN, max: THREAD_LENGTH_MAX }), 'error')
    return false
  }
  return useDocumentStore.getState().addThread(params)
}
