// ============================================================
// toolbar-layout.ts — Алгоритм распределения кнопок по строкам
// ============================================================
// Алгоритм управляет переносом кнопок в toolbar-группах:
// - Сужение: переносит последние кнопки с первой строки вниз
// - Расширение: поднимает кнопки с нижних строк вверх (с гистерезисом)
// - MAX_ROWS = 3 — максимальное количество строк в группе
// - Гистерезис = 1W — защита от дребезга при расширении

const BTN_SIZE = 34 // px — ширина кнопки из CSS
const GAP = 2 // px — gap между кнопками из CSS
const MAX_ROWS = 3
const HYSTERESIS = BTN_SIZE // 1W — защитная подушка

export interface ToolbarGroup {
  id: string
  buttons: ToolbarButton[]
}

export interface ToolbarButton {
  id: string
  width: number
}

export interface ToolbarLayout {
  /** Для каждой группы: сколько кнопок в первой строке */
  firstRowCount: number[]
}

/**
 * Рассчитывает оптимальное распределение кнопок по строкам.
 * @param groups — массив групп с кнопками
 * @param availableWidth — доступная ширина тулбара (после вычета padding)
 * @returns layout с количеством кнопок в первой строке для каждой группы
 */
export function calculateToolbarLayout(
  groups: ToolbarGroup[],
  availableWidth: number,
): ToolbarLayout {
  if (groups.length === 0) {
    return { firstRowCount: [] }
  }

  // Инициализация: каждая группа в 1 строку (все кнопки)
  const initialCounts = groups.map((group) => group.buttons.length)

  // Фаза 1: Сужение (push down)
  const contracted = contractGroups(groups, initialCounts, availableWidth)

  // Фаза 2: Расширение (pull up) с гистерезисом
  const expanded = expandGroups(groups, contracted, availableWidth)

  return { firstRowCount: expanded }
}

/**
 * Сужение: пока места мало, переносим последние кнопки с первой строки вниз.
 * Приоритет у самых широких групп (с наибольшим количеством кнопок в первой строке).
 */
function contractGroups(
  groups: ToolbarGroup[],
  firstRowCount: number[],
  availableWidth: number,
): number[] {
  let rows = [...firstRowCount]
  let changed = true

  while (changed) {
    changed = false

    // Считаем необходимую ширину (максимум по всем группам)
    const maxLen = Math.max(...rows.map((r) => Math.max(r, 1)))
    const neededWidth = maxLen * (BTN_SIZE + GAP)

    // Если места хватает — выходим
    if (neededWidth <= availableWidth) {
      break
    }

    // Проверяем, есть ли группы которые могут принять ещё строку
    const canExpand = groups.some((_, i) => rows[i] < MAX_ROWS)
    if (!canExpand) {
      break // Все группы достигли MAX_ROWS
    }

    // Находим максимальную длину первой строки
    let maxFirstRowLen = 0
    for (let i = 0; i < groups.length; i++) {
      maxFirstRowLen = Math.max(maxFirstRowLen, rows[i])
    }

    // Находим все группы с максимальной первой строкой и возможностью расшириться
    const candidates: number[] = []
    for (let i = 0; i < groups.length; i++) {
      if (rows[i] === maxFirstRowLen && rows[i] < MAX_ROWS) {
        candidates.push(i)
      }
    }

    if (candidates.length === 0) {
      break
    }

    // Переносим последнюю кнопку из первой строки у всех кандидатов
    for (const idx of candidates) {
      rows[idx]--
      changed = true
    }
  }

  return rows
}

/**
 * Расширение: когда места стало много, поднимаем кнопки с нижних строк вверх.
 * С гистерезисом (HYSTERESIS = 1W) для защиты от дребезга.
 */
function expandGroups(
  groups: ToolbarGroup[],
  firstRowCount: number[],
  availableWidth: number,
): number[] {
  let rows = [...firstRowCount]
  let changed = true

  while (changed) {
    changed = false

    // Считаем необходимую ширину
    const maxLen = Math.max(...rows.map((r) => Math.max(r, 1)))
    const neededWidth = maxLen * (BTN_SIZE + GAP)

    // Считаем пустое место
    const emptySpace = availableWidth - neededWidth

    // Находим максимальное количество строк
    const totalButtons = groups.map((g) => g.buttons.length)
    const currentRows = rows.map((r, i) => Math.max(1, totalButtons[i] - r + 1))
    let maxCurrentRows = 0
    for (const r of currentRows) {
      maxCurrentRows = Math.max(maxCurrentRows, r)
    }

    // Если все группы в 1 строку — выходим
    if (maxCurrentRows <= 1) {
      break
    }

    // Находим все группы с максимальным количеством строк
    const candidates: number[] = []
    for (let i = 0; i < groups.length; i++) {
      if (currentRows[i] === maxCurrentRows && currentRows[i] > 1) {
        candidates.push(i)
      }
    }

    if (candidates.length === 0) {
      break
    }

    const N = candidates.length

    // Рассчитываем порог с гистерезисом
    const threshold = N * BTN_SIZE + HYSTERESIS

    // Если места хватает с запасом — поднимаем кнопки
    if (emptySpace >= threshold) {
      for (const idx of candidates) {
        rows[idx]++
        changed = true
      }
    }
    // Иначе — выходим (гистерезис сработал, не дергаемся)
  }

  return rows
}
