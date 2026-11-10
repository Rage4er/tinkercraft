// ============================================================
// useAutosave — автосохранение в IndexedDB и восстановление при старте (UX-AUDIT-1)
// ============================================================
//
// Раньше App только писал сессию (`triggerAutosave`), а `restoreAutosave` не вызывал
// никто: после перезагрузки сцена была пустой, хотя README обещает восстановление.
// Теперь: как только CSG-воркер готов — один раз восстановить прошлую сессию (если сцена
// пуста) и сообщить об этом; дальше — запись через AUTOSAVE_DELAY_MS после изменений.
// `clearScene` чистит запись сам (store), иначе очищенная сессия вернулась бы при старте.

import { useEffect, useRef } from 'react'
import { useDocumentStore } from '../store/document-store'
import { useDimensionsStore } from '../store/dimensions-store'
import { notify } from '../store/notifications'
import { AUTOSAVE_DELAY_MS } from '../constants'
import i18n from '../i18n'

export function useAutosave(workerOk: boolean): void {
  const operations = useDocumentStore((s) => s.operations)
  const historyIndex = useDocumentStore((s) => s.historyIndex)
  const triggerAutosave = useDocumentStore((s) => s.triggerAutosave)
  // DIMENSIONS: слой размеров — тоже в автосохранении (меняется без шагов истории)
  const dimensions = useDimensionsStore((s) => s.dimensions)
  const restoreAutosave = useDocumentStore((s) => s.restoreAutosave)

  // восстановление — один раз за запуск (StrictMode монтирует эффекты дважды)
  const restoreStarted = useRef(false)
  useEffect(() => {
    if (!workerOk || restoreStarted.current) return
    restoreStarted.current = true
    restoreAutosave()
      .then((restored) => { if (restored) notify(i18n.t('autosave.restored'), 'info') })
      .catch((e) => console.warn('[AutoSave] restore error:', e))
  }, [workerOk, restoreAutosave])

  // запись: через AUTOSAVE_DELAY_MS после последнего изменения истории или размеров
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (operations.length === 0) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void triggerAutosave() }, AUTOSAVE_DELAY_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [operations, historyIndex, dimensions, triggerAutosave])
}
