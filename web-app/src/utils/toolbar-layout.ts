// ============================================================
// toolbar-layout.ts — Алгоритм распределения кнопок по строкам
// ============================================================
// Профессиональный алгоритм ленточного интерфейса (AutoCAD, MS Office):
// - Сужение: увеличиваем rows у самых широких групп
// - Расширение: уменьшаем rows с гистерезисом
// - Ширина = max(ceil(buttonCount / rows)) для каждой группы

const BTN_SIZE = 34 // px — ширина кнопки
const GAP = 2 // px — gap между кнопками
const SEPARATOR_WIDTH = 2 // px — ширина разделителя
const PADDING = 20 // px — отступы слева/справа в toolbar

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
 * @param availableWidth — полная ширина toolbar (включая padding)
 * @returns layout с количеством строк для каждой группы
 */
export function calculateToolbarLayout(
  groups: ToolbarGroup[],
  availableWidth: number,
): GroupLayout[] {
  if (groups.length === 0) {
    return []
  }

  // Инициализация: все группы в 1 строку
  let layout: GroupLayout[] = groups.map((g) => ({
    id: g.id,
    rows: 1,
    buttonCount: g.buttonCount,
    maxRows: g.maxRows ?? 3,
  }))

  // Фаза 1: Сужение (push down)
  layout = contract(layout, availableWidth)

  // Фаза 2: Расширение (pull up) с гистерезисом
  layout = expand(layout, availableWidth)

  return layout
}

/**
 * Сужение: пока места мало, увеличиваем rows у самых широких групп.
 */
function contract(layout: GroupLayout[], availableWidth: number): GroupLayout[] {
  const totalSeparators = (layout.length - 1) * SEPARATOR_WIDTH
  let maxIterations = 100 // защита от бесконечного цикла

  while (maxIterations-- > 0) {
    // Считаем текущую ширину
    const currentWidth = calcWidth(layout) + totalSeparators + PADDING

    // Если места хватает — выходим
    if (currentWidth <= availableWidth) {
      break
    }

    // Проверяем, есть ли группы которые могут принять ещё строку
    const canExpand = layout.some((g) => g.rows < g.maxRows)
    if (!canExpand) {
      break // Все группы достигли MAX_ROWS
    }

    // Находим самую большую первую строку
    const firstRowLengths = layout.map((g) => ceilDiv(g.buttonCount, g.rows))
    const maxLen = Math.max(...firstRowLengths)

    // Находим кандидатов (самые широкие + могут расшириться)
    const candidates = layout.filter(
      (g, i) => firstRowLengths[i] === maxLen && g.rows < g.maxRows,
    )

    if (candidates.length === 0) {
      break
    }

    // Создаём новую layout с увеличенными rows у кандидатов
    const newLayout = layout.map((g) => {
      const isCandidate = candidates.some((c) => c.id === g.id)
      if (isCandidate) {
        return { ...g, rows: Math.min(g.rows + 1, g.maxRows) }
      }
      return g
    })

    // Проверяем, хватило ли места
    const newWidth = calcWidth(newLayout) + totalSeparators + PADDING
    if (newWidth <= availableWidth) {
      return newLayout
    }

    layout = newLayout
  }

  return layout
}

/**
 * Расширение: когда места много, уменьшаем rows у самых высоких групп.
 * С гистерезисом для защиты от дребезга.
 */
function expand(layout: GroupLayout[], availableWidth: number): GroupLayout[] {
  const totalSeparators = (layout.length - 1) * SEPARATOR_WIDTH
  let maxIterations = 100

  while (maxIterations-- > 0) {
    // Считаем текущую ширину и пустое место
    const currentWidth = calcWidth(layout) + totalSeparators + PADDING
    const emptySpace = availableWidth - currentWidth

    // Находим максимальное количество строк
    const maxRows = Math.max(...layout.map((g) => g.rows))

    // Если все группы в 1 строку — выходим
    if (maxRows <= 1) {
      break
    }

    // Находим всех кандидатов (группы с макс. rows > 1)
    const candidates = layout.filter(
      (g) => g.rows === maxRows && g.rows > 1,
    )

    if (candidates.length === 0) {
      break
    }

    const N = candidates.length

    // Рассчитываем порог с гистерезисом
    // Нужно место для N кнопок + защитная подушка 1W
    const threshold = N * BTN_SIZE + BTN_SIZE

    // Если места хватает с запасом — уменьшаем rows
    if (emptySpace >= threshold) {
      const newLayout = layout.map((g) => {
        const isCandidate = candidates.some((c) => c.id === g.id)
        if (isCandidate) {
          return { ...g, rows: Math.max(g.rows - 1, 1) }
        }
        return g
      })

      // Проверяем, что новая ширина не превышает доступную
      const newWidth = calcWidth(newLayout) + totalSeparators + PADDING
      if (newWidth <= availableWidth) {
        layout = newLayout
      } else {
        break // Место не позволяет уменьшить rows
      }
    } else {
      break // Гистерезис сработал — не дергаемся
    }
  }

  return layout
}

/**
 * Считает необходимую ширину для layout.
 * Width = SUM(ceil(buttonCount / rows)) * BTN_SIZE для КАЖДОЙ группы
 */
function calcWidth(layout: GroupLayout[]): number {
  if (layout.length === 0) {
    return 0
  }
  // Каждая группа имеет свою ширину = maxInRow * BTN_SIZE
  // Общая ширина = сумма ширин всех групп
  const totalWidth = layout.reduce((sum, g) => {
    const perRow = ceilDiv(g.buttonCount, g.rows)
    return sum + perRow * BTN_SIZE
  }, 0)
  return totalWidth
}

/**
 * Ceiling division: ceil(a / b)
 */
function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b)
}
