// ============================================================
// useToolbarLayout — хук для алгоритма распределения кнопок
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react"
import {
  calculateToolbarLayout,
  type ToolbarGroup,
} from "../utils/toolbar-layout"

export function useToolbarLayout(groups: ToolbarGroup[]) {
  const [firstRowCounts, setFirstRowCounts] = useState<number[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeObserver = useRef<ResizeObserver | null>(null)

  const recalc = useCallback(() => {
    if (!containerRef.current || groups.length === 0) {
      setFirstRowCounts([])
      return
    }

    const rect = containerRef.current.getBoundingClientRect()
    const availableWidth = rect.width - 20

    const result = calculateToolbarLayout(groups, availableWidth)
    setFirstRowCounts(result.firstRowCount)
  }, [groups])

  useEffect(() => {
    recalc()

    resizeObserver.current = new ResizeObserver(recalc)
    if (containerRef.current) {
      resizeObserver.current.observe(containerRef.current)
    }

    return () => {
      resizeObserver.current?.disconnect()
    }
  }, [recalc])

  return { containerRef, firstRowCounts }
}
