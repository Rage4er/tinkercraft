// ============================================================
// ToolbarRowSplit — split-ит кнопки группы на строки
// ============================================================
// Использует algorithm layout для распределения кнопок по строкам
// rows — количество строк для группы

import React from "react"

interface ToolbarRowSplitProps {
  /** Количество строк для группы (из алгоритма) */
  rows: number
  /** Все кнопки группы */
  buttons: React.ReactNode[]
}

export default function ToolbarRowSplit({
  rows,
  buttons,
}: ToolbarRowSplitProps) {
  // Распределяем кнопки по строкам
  const buttonsPerRow = Math.ceil(buttons.length / rows)

  const resultRows: React.ReactNode[][] = []
  for (let i = 0; i < rows; i++) {
    const start = i * buttonsPerRow
    const end = Math.min(start + buttonsPerRow, buttons.length)
    if (start < buttons.length) {
      resultRows.push(buttons.slice(start, end))
    }
  }

  return (
    <div className="toolbar-group">
      {resultRows.map((rowButtons, rowIndex) => (
        <div key={rowIndex} className="toolbar-group-row">
          {rowButtons.map((btn, btnIndex) => (
            <React.Fragment key={btnIndex}>{btn}</React.Fragment>
          ))}
        </div>
      ))}
    </div>
  )
}
