// ============================================================
// useToolbarLayout — хук для алгоритма распределения кнопок
// ============================================================
// ПРОФЕССИОНАЛЬНАЯ РЕАЛИЗАЦИЯ (AutoCAD/MS Office level):
// - useLayoutEffect: синхронное обновление до рендера (без flickering)
// - Измерение реальной ширины кнопки (не фиксированное)
// - rowsMap: Record<string, number> — чистое состояние
// - ResizeObserver без бесконечных циклов
// - Алгоритм чистый, отделён от React

import { useState, useRef, useCallback, useLayoutEffect } from "react"
import {
  calculateToolbarLayout,
  type ToolbarGroup,
  type GroupLayout,
} from "../utils/toolbar-layout"

interface UseToolbarLayoutResult {
  /** Ref для toolbar контейнера */
  toolbarRef: React.RefObject<HTMLDivElement>
  /** Карта rows по id группы: { 'file': 1, 'csg': 2, ... } */
  rowsMap: Record<string, number>
}

export function useToolbarLayout(groups: ToolbarGroup[]): UseToolbarLayoutResult {
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Состояние: rows по каждой группе (Record, не массив!)
  const [rowsMap, setRowsMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, 1]))
  )

  // Измеряем реальную ширину кнопки в DOM
  const measureButtonWidth = useCallback((): number => {
    if (!toolbarRef.current) return 34
    const btn = toolbarRef.current.querySelector(".toolbar-group .btn") as HTMLElement
    if (!btn) return 34
    // Реальная ширина + gap (2px)
    return btn.getBoundingClientRect().width + 4
  }, [])

  // Чистая функция расчёта layout (без React зависимостей)
  const calculateAndSetLayout = useCallback(
    (width: number, btnWidth: number) => {
      if (groups.length === 0) {
        setRowsMap({})
        return
      }

      const result = calculateToolbarLayout(groups, width)

      // Преобразуем GroupLayout[] → Record<string, number>
      const newRowsMap: Record<string, number> = {}
      for (const g of result) {
        newRowsMap[g.id] = g.rows
      }
      setRowsMap(newRowsMap)
    },
    [groups],
  )

  // useLayoutEffect: выполняется синхронно ДО рендера
  useLayoutEffect(() => {
    if (!toolbarRef.current) return

    // Инициализация: измеряем ширину и считаем layout
    const initialWidth = toolbarRef.current.getBoundingClientRect().width
    const btnWidth = measureButtonWidth()
    calculateAndSetLayout(initialWidth, btnWidth)

    // ResizeObserver — БЕЗ бесконечных циклов
    // Зависимости: только calculateAndSetLayout и measureButtonWidth
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const width = entry.contentRect.width
      const btnWidth = measureButtonWidth()
      calculateAndSetLayout(width, btnWidth)
    })

    observer.observe(toolbarRef.current)

    return () => observer.disconnect()
  }, [calculateAndSetLayout, measureButtonWidth]) // ← правильные зависимости!

  return { toolbarRef, rowsMap }
}
