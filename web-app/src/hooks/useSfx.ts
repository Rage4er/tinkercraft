// ============================================================
// useSfx — когда звучит (SFX)
// ============================================================
// click   — клик по кнопке интерфейса (не отключённой);
// create  — новый шаг истории: фигура, импорт, 3D-текст, вставка;
// success — новый шаг CSG (объединение / вычитание / пересечение); новый размер — в `createDimension`;
// error   — уведомление-ошибка или предупреждение.
// Отмена / повтор / перемотка истории и загрузка проекта — без звука (новые шаги не появляются).

import { useEffect } from 'react'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { playSfx, type SfxKind } from '../sfx'
import type { TinkerCraftOperation } from '../csg/types'

/** Звук нового шага истории (или null — шаг без звука) */
export function sfxForOperation(op: TinkerCraftOperation): SfxKind | null {
  if (op.type === 'add_shape' || op.type === 'import_mesh') return 'create'
  if (op.type === 'group') return op.pasted ? 'create' : 'success'
  return null
}

type Hist = { operations: TinkerCraftOperation[]; historyIndex: number }
/**
 * Новый шаг пользователя: к истории до прежней позиции дописан один шаг (или несколько шагов вставки
 * Ctrl+V), позиция — в конце. Отмена / повтор / перемотка (тот же массив), загрузка проекта,
 * очистка, правка прошлого шага — null.
 */
export function newOperation(prev: Hist, next: Hist): TinkerCraftOperation | null {
  if (next.operations === prev.operations) return null
  const added = next.historyIndex - prev.historyIndex
  if (added < 1 || next.historyIndex !== next.operations.length) return null
  for (let i = 0; i < prev.historyIndex; i++) if (next.operations[i] !== prev.operations[i]) return null
  const fresh = next.operations.slice(prev.historyIndex)
  if (added > 1 && !fresh.every((op) => 'pasted' in op && op.pasted)) return null
  return fresh[fresh.length - 1] ?? null
}

export function useSfx(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const b = (e.target as Element | null)?.closest?.('button')
      if (b && !(b as HTMLButtonElement).disabled) playSfx('click')
    }
    document.addEventListener('click', onClick, true)
    const unDoc = useDocumentStore.subscribe((s, prev) => {
      const op = newOperation(prev, s)
      const kind = op ? sfxForOperation(op) : null
      if (kind) playSfx(kind)
    })
    const unNote = useNotifications.subscribe((s, prev) => {
      const fresh = s.notifications.filter((n) => !prev.notifications.some((p) => p.id === n.id))
      if (fresh.some((n) => n.type === 'error' || n.type === 'warning')) playSfx('error')
    })
    return () => { document.removeEventListener('click', onClick, true); unDoc(); unNote() }
  }, [])
}
