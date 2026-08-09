// ============================================================
// ToolbarRowSplit — split-ит кнопки группы на строки
// ============================================================
// Используется алгоритмом layout для распределения кнопок по строкам
// firstRowCount — сколько кнопок в первой строке
// totalButtons — общее количество кнопок в группе

import React from "react"

interface ToolbarRowSplitProps {
  /** Все кнопки группы */
  buttons: React.ReactNode[]
  /** Сколько кнопок в первой строке (из алгоритма) */
  firstRowCount: number
}

export default function ToolbarRowSplit({
  buttons,
  firstRowCount,
}: ToolbarRowSplitProps) {
  // Если firstRowCount не задан или >= total — все в одну строку
  if (firstRowCount === undefined || firstRowCount >= buttons.length) {
    return (
      <div className="toolbar-group">
        {buttons.map((btn, i) => (
          <div key={i} className="toolbar-group-row">{btn}</div>
        ))}
      </div>
    )
  }

  // Split buttons into rows
  const firstRow = buttons.slice(0, firstRowCount)
  const rest = buttons.slice(firstRowCount)

  return (
    <div className="toolbar-group">
      {/* Первая строка */}
      <div className="toolbar-group-row">
        {firstRow.map((btn, i) => (
          <React.Fragment key={i}>{btn}</React.Fragment>
        ))}
      </div>
      {/* Дополнительные строки */}
      {rest.map((btn, i) => (
        <div key={i + firstRowCount} className="toolbar-group-row">
          {btn}
        </div>
      ))}
    </div>
  )
}
