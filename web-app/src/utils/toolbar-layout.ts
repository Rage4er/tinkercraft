// ============================================================
// toolbar-layout.ts — Алгоритм распределения кнопок по строкам
// ============================================================
// Профессиональный алгоритм ленточного интерфейса (AutoCAD, MS Office):
// - Сужение: перенос у самых широких групп когда width > toolbarWidth
// - Расширение: подъём у самых высоких групп (с гистерезисом)
// - MAX_ROWS = 3 — максимум строк в группе
// - Гистерезис = 1W — защитная подушка 1 кнопка

const SEPARATOR_WIDTH = 2 // px — ширина разделителя
const PADDING = 16 // px — горизонтальные отступы тулбара
const MAX_ROWS = 3 // максимум строк в группе
const HYSTERESIS = 1 // защита от дребезга (1 кнопка)

export interface ToolbarGroup {
  id: string
  buttonCount: number
  maxRows?: number
}

export interface GroupLayout {
  id: string
  rows: number
  buttonCount: number
  maxRows: number
}

/**
 * Рассчитывает оптимальное количество строк для каждой группы.
 * @param groups — массив конфигураций групп
 * @param toolbarWidth — полная ширина toolbar
 * @param btnWidth — реальная ширина кнопки (из DOM)
 * @returns layout с количеством строк для каждой группы
 */
export function calculateToolbarLayout(
  groups: ToolbarGroup[],
  toolbarWidth: number,
  btnWidth: number,
): GroupLayout[] {
  if (groups.length === 0) {
    return []
  }

  // Инициализация: все группы в 1 строку
  let layout: GroupLayout[] = groups.map((g) => ({
    id: g.id,
    rows: 1,
    buttonCount: g.buttonCount,
    maxRows: g.maxRows ?? MAX_ROWS,
  }))

  // Единый расчёт: сужение + расширение
  layout = calculateLayout(layout, toolbarWidth, btnWidth)

  return layout
}

/**
 * Единый расчёт: сужение (если места мало) или расширение (если много).
 * С гистерезисом для защиты от дребезга.
 */
function calculateLayout(
  layout: GroupLayout[],
  toolbarWidth: number,
  btnWidth: number,
): GroupLayout[] {
  const totalSeparators = (layout.length - 1) * SEPARATOR_WIDTH

  // Считаем общую ширину всех групп (SUM по всем группам)
  const totalButtonsWidth = layout.reduce((sum, g) => {
    const perRow = ceilDiv(g.buttonCount, g.rows)
    return sum + perRow * btnWidth
  }, 0) + totalSeparators + PADDING

  // === ФАЗА 1: ЕСЛИ ВСЕ В 1 СТРОКУ — проверяем влезает ли ===
  if (layout.every((g) => g.rows === 1)) {
    // Если места достаточно — все в 1 строку (без требования запаса!)
    if (totalButtonsWidth <= toolbarWidth) {
      return layout
    }
    // Места мало — начинаем сужение
    return contract(layout, toolbarWidth, totalSeparators, btnWidth)
  }

  // === ФАЗА 2: ЕСТЬ МНОГО СТРОК — пробуем расширение ===
  return expand(layout, toolbarWidth, totalSeparators, btnWidth)
}

/**
 * Сужение: пока totalWidth > toolbarWidth, увеличиваем rows у самых широких групп.
 * БЕЗ требования запаса — переносим сразу когда не влезает.
 */
function contract(
  layout: GroupLayout[],
  toolbarWidth: number,
  totalSeparators: number,
  btnWidth: number,
): GroupLayout[] {
  let rowsMap: Record<string, number> = {}
  for (const g of layout) {
    rowsMap[g.id] = g.rows
  }

  let maxIterations = 100

  while (maxIterations-- > 0) {
    // Считаем текущую ширину
    const currentWidth = layout.reduce((sum, g) => {
      const perRow = ceilDiv(g.buttonCount, rowsMap[g.id])
      return sum + perRow * btnWidth
    }, 0) + totalSeparators + PADDING

    // Если влезает — выходим
    if (currentWidth <= toolbarWidth) {
      return layout.map((g) => ({ ...g, rows: rowsMap[g.id] }))
    }

    // 1. Находим самую широкую группу (по кнопкам в первой строке)
    const firstRowLengths = layout.map((g) => ceilDiv(g.buttonCount, rowsMap[g.id]))
    const maxLen = Math.max(...firstRowLengths)

    // 2. Кандидаты (самые широкие, не достигли MAX_ROWS)
    const candidates = layout.filter(
      (g, i) => firstRowLengths[i] === maxLen && rowsMap[g.id] < MAX_ROWS,
    )

    if (candidates.length === 0) {
      break // некуда переносить
    }

    // 3. Переносим по 1 кнопке у всех кандидатов
    const newRowsMap = { ...rowsMap }
    for (const g of candidates) {
      newRowsMap[g.id] = (newRowsMap[g.id] || 1) + 1
    }

    rowsMap = newRowsMap
  }

  // Вернулись к GroupLayout[]
  return layout.map((g) => ({ ...g, rows: rowsMap[g.id] }))
}

/**
 * Расширение: когда места много, уменьшаем rows у самых высоких групп.
 * С гистерезисом для защиты от дребезга.
 */
function expand(
  layout: GroupLayout[],
  toolbarWidth: number,
  totalSeparators: number,
  btnWidth: number,
): GroupLayout[] {
  let rowsMap: Record<string, number> = {}
  for (const g of layout) {
    rowsMap[g.id] = g.rows
  }

  // Если все уже в 1 строке — ничего не делаем
  const allOne = layout.every((g) => rowsMap[g.id] === 1)
  if (allOne) {
    return layout
  }

  let maxIterations = 100

  while (maxIterations-- > 0) {
    // 1. Находим максимальное количество строк
    const maxRows = Math.max(...layout.map((g) => rowsMap[g.id]))

    // 2. Кандидаты (группы с макс. rows > 1)
    const candidates = layout.filter(
      (g) => rowsMap[g.id] === maxRows && rowsMap[g.id] > 1,
    )

    if (candidates.length === 0) {
      break
    }

    const N = candidates.length

    // 3. Считаем порог для подъёма (с гистерезисом)
    const neededSpace = N * btnWidth
    const threshold = neededSpace + HYSTERESIS * btnWidth

    // 4. Считаем текущую ширину и пустое место
    const currentWidth = layout.reduce((sum, g) => {
      const perRow = ceilDiv(g.buttonCount, rowsMap[g.id])
      return sum + perRow * btnWidth
    }, 0) + totalSeparators + PADDING

    const emptySpace = toolbarWidth - currentWidth

    // 5. Проверяем, можно ли поднять
    if (emptySpace < threshold) {
      return layout // недостаточно места — гистерезис сработал
    }

    // 6. Поднимаем всех кандидатов
    const newRowsMap = { ...rowsMap }
    for (const g of candidates) {
      newRowsMap[g.id] = Math.max(1, (newRowsMap[g.id] || 1) - 1)
    }

    // 7. Проверяем новую ширину
    const newWidth = layout.reduce((sum, g) => {
      const perRow = ceilDiv(g.buttonCount, newRowsMap[g.id])
      return sum + perRow * btnWidth
    }, 0) + totalSeparators + PADDING

    if (newWidth <= toolbarWidth) {
      rowsMap = newRowsMap
    } else {
      break // место не позволяет уменьшить rows
    }
  }

  // Вернулись к GroupLayout[]
  return layout.map((g) => ({ ...g, rows: rowsMap[g.id] }))
}

/**
 * Ceiling division: ceil(a / b)
 */
function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b)
}
