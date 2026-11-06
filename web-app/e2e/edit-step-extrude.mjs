// e2e/edit-step-extrude.mjs — Фаза 9.5.4: правка глубины прошлого шага extrude с каскадом CSG.
// Выдавливания в интерфейсе сейчас нет (UX-3 убрал его из панели свойств, на панель
// инструментов не вернули) — сцена открывается из фикстуры e2e/fixtures/extrude-union.3dtc
// (Ctrl+O): сфера, куб A (x = 25) → extrude Z 5 → ∪ сфера C. Фикстура создана тем же
// store-сценарием, что `scene(5)` в src/__tests__/edit-step-extrude.test.ts.
// ✎ у шага «Выдавить Z на 5» → глубина 10 (Enter) → CSG пересчитан (меш другой), pivot прежний,
// уведомлений об отказе нет; undo возвращает 5, redo — 10.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:edit-step-extrude` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/edit-step-extrude.mjs /tmp/extrude.png`.
import { fileURLToPath } from 'node:url'
import { openApp } from './helpers.mjs'

const FIXTURE = fileURLToPath(new URL('./fixtures/extrude-union.3dtc', import.meta.url))
const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const propX = () => right.locator('#num-input-X').first().inputValue()  // первое X — позиция
try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // открыть проект (Ctrl+O → системный выбор файла)
  const chooser = page.waitForEvent('filechooser')
  await page.locator('canvas').first().click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+o')
  await (await chooser).setFiles(FIXTURE)
  await page.locator('.tl-item', { hasText: 'Выдавить Z на 5' }).waitFor({ timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2, null, { timeout: 15000 })
  const csgRow = objRows.filter({ hasNotText: 'Сфера' })
  const tris = async () => (await csgRow.locator('.ct-tri').textContent())?.replace(/\D/g, '')
  const tris5 = await tris()
  await csgRow.click()
  if ((await propX()) !== '25.0') fail('pivot CSG из файла: ' + (await propX()))
  const steps0 = await page.locator('.tl-item').count()

  // ✎ у шага extrude → панель «Шаг N: Выдавливание»: ось — только текст, глубина 5
  const extRow = page.locator('.tl-item', { hasText: 'Выдавить' }).first()
  await extRow.locator('.tl-edit').click()
  const panel = page.locator('[data-testid=step-panel]')
  await panel.waitFor({ timeout: 5000 })
  if (!(await panel.textContent())?.includes('Выдавливание')) fail('заголовок панели шага')
  if ((await panel.locator('[data-testid=step-axis]').textContent()) !== 'Z') fail('ось шага')
  if ((await panel.locator('[data-testid=step-axis] input').count()) !== 0) fail('ось должна быть только для просмотра')
  const depth = panel.locator('[data-testid=step-extrude] input.props-input')
  if ((await depth.inputValue()) !== '5.0') fail('глубина шага: ' + (await depth.inputValue()))

  // уход из поля без изменения — без новой операции
  await depth.focus(); await depth.blur()
  await page.waitForTimeout(300)
  if ((await page.locator('.tl-item').count()) !== steps0) fail('blur без изменений добавил операцию')

  // 5 → 10, коммит по Enter
  await depth.fill('10'); await depth.press('Enter')
  await page.locator('.tl-item', { hasText: 'Правка шага' }).waitFor({ timeout: 15000 })
  if ((await page.locator('.tl-item').count()) !== steps0 + 1) fail('ожидалась ровно одна новая операция')
  if (!(await page.locator('.tl-item', { hasText: 'Правка шага' }).textContent())?.includes('5 → 10')) fail('подпись правки')
  if ((await extRow.textContent())?.includes('на 10') !== true) fail('шаг extrude должен показывать глубину 10')
  if ((await extRow.locator('[data-testid=tl-edited]').count()) !== 1) fail('метка правки у шага extrude')
  if ((await depth.inputValue()) !== '10.0') fail('панель: глубина после правки ' + (await depth.inputValue()))
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.some((m) => /отклонен|не удалось/i.test(m))) fail('уведомление об отказе в простом сценарии: ' + toasts.join(' | '))
  const tris10 = await tris()
  if (tris10 === tris5) fail(`меш CSG не пересчитан (треугольников ${tris5} → ${tris10})`)
  if (shot) await page.screenshot({ path: shot })

  // pivot CSG прежний (pivot = позиция базы, глубина его не меняет)
  await csgRow.click()
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  if ((await propX()) !== '25.0') fail('pivot CSG после правки: ' + (await propX()))

  // undo → 5, redo → 10
  await page.locator('.props-header').click() // убрать фокус с поля ввода
  await page.keyboard.press('Control+z')
  await page.locator('.tl-item.current', { hasText: 'Объединение' }).waitFor({ timeout: 10000 })
  if (!(await extRow.textContent())?.includes('на 5')) fail('после undo шаг должен показывать глубину 5')
  if ((await tris()) !== tris5) fail('после undo меш должен вернуться')
  await page.keyboard.press('Control+y')
  await page.locator('.tl-item.current', { hasText: 'Правка шага' }).waitFor({ timeout: 10000 })
  if ((await tris()) !== tris10) fail('после redo меш должен быть правленым')

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log(`e2e edit-step-extrude OK (треугольников CSG: ${tris5} → ${tris10})`)
} finally {
  await browser.close()
}
