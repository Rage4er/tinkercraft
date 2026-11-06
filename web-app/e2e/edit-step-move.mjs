// e2e/edit-step-move.mjs — Фаза 9.5.2: правка прошлого шага move с каскадом CSG.
// Куб → X=8 (шаг move) → сфера → ∪ → ✎ у шага move в Timeline → ΔX 8 → 12 (Enter) →
// CSG пересчитан (новая операция «Правка шага»), pivot результата = новая позиция куба,
// уведомлений об отказе нет; undo возвращает pivot 8, redo — 12.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:edit-step-move` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/edit-step-move.mjs /tmp/step.png`.
import { openApp, panelButton } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
/** Позиция X выделенного объекта в панели свойств. */
const propX = () => right.locator('#num-input-X').first().inputValue()  // первое X — позиция (у поворота тот же id)
try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // куб, сдвиг X 0 → 8 через панель свойств (шаг «Переместить»)
  await page.getByText('Куб', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await objRows.nth(0).click()
  const x = right.locator('#num-input-X').first()
  await x.fill('8'); await x.press('Enter')
  await page.locator('.tl-item', { hasText: 'Переместить' }).waitFor({ timeout: 10000 })

  // сфера, затем объединение
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await objRows.nth(0).click()
  await objRows.nth(1).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })
  await objRows.nth(0).click()
  if ((await propX()) !== '8.0') fail('pivot CSG до правки: ' + (await propX()))
  const steps0 = await page.locator('.tl-item').count()

  // ✎ у шага move → панель «Шаг N» (выделение в сцене снимается)
  const moveRow = page.locator('.tl-item', { hasText: 'Переместить' }).first()
  await moveRow.locator('.tl-edit').click()
  const panel = page.locator('[data-testid=step-panel]')
  await panel.waitFor({ timeout: 5000 })
  if (!(await panel.textContent())?.includes('Перемещение')) fail('заголовок панели шага')
  const dx = panel.locator('[data-testid=step-delta] input.props-input').first()
  if ((await dx.inputValue()) !== '8.0') fail('ΔX шага: ' + (await dx.inputValue()))

  // уход из поля без изменения — без новой операции
  await dx.focus(); await dx.blur()
  await page.waitForTimeout(300)
  if ((await page.locator('.tl-item').count()) !== steps0) fail('blur без изменений добавил операцию')

  // ΔX 8 → 12, коммит по Enter
  await dx.fill('12'); await dx.press('Enter')
  await page.locator('.tl-item', { hasText: 'Правка шага' }).waitFor({ timeout: 15000 })
  if ((await page.locator('.tl-item').count()) !== steps0 + 1) fail('ожидалась ровно одна новая операция')
  if (!(await page.locator('.tl-item', { hasText: 'Правка шага' }).textContent())?.includes('(8, 0, 0) → (12, 0, 0)')) fail('подпись правки')
  if ((await moveRow.locator('[data-testid=tl-edited]').count()) !== 1) fail('шаг move должен показывать метку правки')
  if ((await panel.locator('[data-testid=step-edited]').count()) !== 1) fail('панель: метка «изменён»')
  if ((await dx.inputValue()) !== '12.0') fail('панель: ΔX после правки ' + (await dx.inputValue()))
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.some((m) => /отклонен|не удалось/i.test(m))) fail('уведомление об отказе в простом сценарии: ' + toasts.join(' | '))
  if (shot) await page.screenshot({ path: shot })

  // pivot CSG (gizmo результата) — на новой позиции операнда A
  if ((await objRows.count()) !== 1) fail('CSG-объект потерян')
  await objRows.nth(0).click()
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  if ((await propX()) !== '12.0') fail('pivot CSG после правки: ' + (await propX()))

  // undo → pivot 8, redo → 12
  await page.locator('.props-header').click() // убрать фокус с поля ввода
  await page.keyboard.press('Control+z')
  await page.locator('.tl-item.current', { hasText: 'Объединение' }).waitFor({ timeout: 10000 })
  await objRows.nth(0).click()
  if ((await propX()) !== '8.0') fail('pivot CSG после undo: ' + (await propX()))
  await page.locator('.props-header').click()
  await page.keyboard.press('Control+y')
  await page.locator('.tl-item.current', { hasText: 'Правка шага' }).waitFor({ timeout: 10000 })
  await objRows.nth(0).click()
  if ((await propX()) !== '12.0') fail('pivot CSG после redo: ' + (await propX()))

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e edit-step-move OK')
} finally {
  await browser.close()
}
