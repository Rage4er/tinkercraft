// ============================================================
// add-shape-queue — клик по фигуре палитры (UX-AUDIT-9)
// ============================================================
//
// Раньше кнопка фигуры была неактивна, пока стор `busy`, а `addShape` при `busy` молча
// выходил: второй клик, пришедший во время построения первой фигуры, терялся — двойной
// клик давал одну фигуру случайно, а не по правилу, и быстрые клики могли пропадать.
// Теперь правило явное:
//  • повторный клик по ТОЙ ЖЕ фигуре раньше ADD_SHAPE_DEBOUNCE_MS (200 мс) — случайный
//    двойной клик, отбрасывается (без уведомления);
//  • позже — ещё одна фигура: если стор занят, клик ждёт освобождения (до ADD_SHAPE_WAIT_MS),
//    фигуры добавляются по очереди, ни одна не теряется.

import type { ShapeType } from '../csg/types'
import { ADD_SHAPE_DEBOUNCE_MS, ADD_SHAPE_WAIT_MS } from '../constants'
import { useDocumentStore } from './document-store'

/**
 * Фильтр двойного клика: true — клик принять. Отсчёт — от последнего ПРИНЯТОГО клика той же
 * фигуры (тройной клик 0 / 150 / 300 мс → две фигуры). Разные фигуры не мешают друг другу.
 */
export function createAddShapeGate(now: () => number = () => performance.now()): (type: ShapeType) => boolean {
  const last = new Map<ShapeType, number>()
  return (type) => {
    const t = now()
    const prev = last.get(type)
    if (prev !== undefined && t - prev < ADD_SHAPE_DEBOUNCE_MS) return false
    last.set(type, t)
    return true
  }
}

/** Дождаться, пока стор не занят (false — не дождались за `timeoutMs`). */
function waitNotBusy(timeoutMs: number): Promise<boolean> {
  if (!useDocumentStore.getState().busy) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsub(); resolve(false) }, timeoutMs)
    const unsub = useDocumentStore.subscribe((s) => {
      if (!s.busy) { clearTimeout(timer); unsub(); resolve(true) }
    })
  })
}

/**
 * Добавить фигуру, когда стор освободится. Несколько ожидающих кликов добавляют фигуры
 * по очереди: `addShape` занимает стор синхронно, остальные снова ждут.
 */
export async function addShapeWhenIdle(type: ShapeType, timeoutMs = ADD_SHAPE_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const left = deadline - Date.now()
    if (left <= 0 || !(await waitNotBusy(left))) return false
    if (!useDocumentStore.getState().busy) {
      await useDocumentStore.getState().addShape(type)
      return true
    }
  }
}
