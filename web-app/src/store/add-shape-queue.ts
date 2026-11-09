// ============================================================
// add-shape-queue — фигура, когда стор свободен (UX-AUDIT-9)
// ============================================================
//
// Раньше кнопка фигуры была неактивна, пока стор `busy`, а `addShape` при `busy` молча
// выходил: фигура, заказанная во время построения прошлой, терялась. Теперь она ждёт
// освобождения стора (до ADD_SHAPE_WAIT_MS), фигуры добавляются по очереди, ни одна не теряется.
// PLUG-AND-PLAY: фигуру ставит режим размещения (`placement-mode.ts`: клик / Enter); клик по
// иконке палитры только включает режим, поэтому прежний фильтр двойного клика по иконке
// (UX-AUDIT-9, DOUBLE-CLICK-TIMING: 200 мс по `event.timeStamp`) не нужен и удалён — двойной клик
// по иконке — тот же один режим, фигура появляется только при размещении.

import type { ShapeType, TransformNR } from '../csg/types'
import { ADD_SHAPE_WAIT_MS } from '../constants'
import { useDocumentStore } from './document-store'

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
 * Добавить фигуру, когда стор освободится. Несколько ожидающих добавляют фигуры по очереди:
 * `addShape` занимает стор синхронно, остальные снова ждут. `at` — место (режим размещения);
 * без него — рядом с прошлыми. `false` — стор занят дольше `timeoutMs`, фигура не создана.
 */
export async function addShapeWhenIdle(
  type: ShapeType,
  { at, timeoutMs = ADD_SHAPE_WAIT_MS }: { at?: TransformNR; timeoutMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const left = deadline - Date.now()
    if (left <= 0 || !(await waitNotBusy(left))) return false
    if (!useDocumentStore.getState().busy) {
      await useDocumentStore.getState().addShape(type, undefined, at)
      return true
    }
  }
}
