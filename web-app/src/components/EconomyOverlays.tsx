// src/components/EconomyOverlays.tsx — оверлеи экономики и платных операций (yandex-only)
// Y.5 (рефакторинг yandex-games): вынесено из App.tsx, чтобы merge
// main → yandex-games не конфликтовал в общем файле.
// Монтирует: онбординг (§6.7), модалку аренды 24ч (UB-1), модалки экспорта/импорта
// STL (§3.1). Флаги модалок — в ui-store (открывает их Toolbar через App).
import { useCallback } from 'react'
import EconomyOnboarding from './EconomyOnboarding'
import RentalModal from './RentalModal'
import ExportModal from './ExportModal'
import ImportModal from './ImportModal'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { isEconomyAvailable } from '../platform'
import type { ExportPaymentMethod } from '../store/economy-types'

export default function EconomyOverlays() {
  const showExportModal = useUiStore((s) => s.showExportModal)
  const setShowExportModal = useUiStore((s) => s.setShowExportModal)
  const showImportModal = useUiStore((s) => s.showImportModal)
  const setShowImportModal = useUiStore((s) => s.setShowImportModal)
  const objects = useDocumentStore((s) => s.objects)
  const operations = useDocumentStore((s) => s.operations)
  const exportStl = useDocumentStore((s) => s.exportStl)
  const importStl = useDocumentStore((s) => s.importStl)

  // Выполнить экспорт после выбора в модалке.
  // U8: method передаётся в exportStl() — от него зависит модель кэшбэка:
  // при 'tokens' кэшбэк уже учтён в цене модалки (нет повторного начисления),
  // при 'ad' — начисляется после экспорта (P1-1).
  const handleExportExecute = useCallback((method?: ExportPaymentMethod) => {
    exportStl(method)
  }, [exportStl])

  // Выполнить импорт после оплаты в модалке.
  // U12: файл может быть выбран ДО показа рекламы (ImportModal открывает
  // file chooser в момент клика — user activation). Если файла нет
  // (подписка/clean-bypass) — importStl сам откроет диалог.
  const handleImportExecute = useCallback((file?: File) => {
    void importStl(file)
  }, [importStl])

  return (
    <>
      {/* ── ЭКОНОМИКА: онбординг (§6.7) ── */}
      {/* P0-6: только при реальном Yandex SDK (не clean-фолбэк) */}
      {isEconomyAvailable() && <EconomyOnboarding />}

      {/* ── FIX (UB-1): модалка аренды 24ч (3D-текст / расширенная палитра) ── */}
      {/* Рендерится всегда: сама возвращает null, если ключ не выставлен либо
          экономика недоступна (clean-версия). */}
      <RentalModal />

      {/* ── Export Modal ── */}
      {showExportModal && (
        <ExportModal
          objects={objects}
          operations={operations}
          onClose={() => setShowExportModal(false)}
          onExport={handleExportExecute}
        />
      )}

      {/* ── Import Modal ── */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImportExecute}
        />
      )}
    </>
  )
}
