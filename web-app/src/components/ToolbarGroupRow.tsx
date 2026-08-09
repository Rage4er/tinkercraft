// ============================================================
// ToolbarGroupRow — рендер строки группы кнопок
// ============================================================
// Используется алгоритмом layout для распределения кнопок по строкам

import React from "react"

interface ToolbarGroupRowProps {
  /** Кнопки для рендера */
  children: React.ReactNode
  /** Количество кнопок в строке */
  count: number
}

export default function ToolbarGroupRow({
  children,
  count,
}: ToolbarGroupRowProps) {
  return (
    <div
      className="toolbar-group-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        justifyContent: "center",
        flex: 1,
      }}
    >
      {children}
    </div>
  )
}
