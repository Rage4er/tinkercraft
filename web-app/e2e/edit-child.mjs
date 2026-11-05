// e2e/edit-child.mjs — Фаза 9.2/9.3: правка параметра ребёнка CSG пересобирает результат.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:edit-child` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/edit-child.mjs /tmp/edit.png`.
import { openApp } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
try {
  await page.getByText('Куб', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.waitForTimeout(800)

  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  const rows = page.locator('.ct-item[data-object-id]')
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['Shift'] })
  await page.locator('.panel-right .csg-group', { hasText: 'CSG операции' }).locator('button').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })

  // раскрыть и выбрать куб
  await page.locator('.ct-item[data-object-id] .ct-chevron').click()
  const cubeRow = page.locator('.ct-child').nth(0)
  await cubeRow.click()
  const panel = page.locator('[data-testid=child-props]')
  await panel.waitFor({ timeout: 5000 })
  const inputs = panel.locator('input.props-input')
  if ((await inputs.count()) !== 3) fail('у куба должно быть 3 поля, получено ' + (await inputs.count()))
  if ((await inputs.nth(0).inputValue()) !== '20.0') fail('ширина куба: ' + (await inputs.nth(0).inputValue()))

  // правка ширины 20 → 34
  await inputs.nth(0).fill('34')
  await inputs.nth(0).blur()
  await page.waitForFunction(
    () => /W34/.test(document.querySelector('.ct-child')?.textContent ?? ''),
    null, { timeout: 15000 },
  )
  // выбор ребёнка сохранился, панель показывает новое значение
  if ((await page.locator('.ct-child-selected').count()) !== 1) fail('выбор ребёнка потерян после правки')
  if ((await panel.locator('input.props-input').nth(0).inputValue()) !== '34.0') fail('поле не обновилось')
  if (shot) await page.screenshot({ path: shot })

  // blur без изменений не создаёт новую операцию
  const histCount = async () => page.locator('.tl-item').count()
  const h1 = await histCount()
  await inputs.nth(0).focus(); await inputs.nth(0).blur()
  await page.waitForTimeout(300)
  if ((await histCount()) !== h1) fail('blur без изменений добавил операцию')

  // undo → ширина 20
  await page.locator('.props-header').click() // убрать фокус с поля ввода
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })
  // раскрытие сохраняется между undo/redo (id корня тот же) — повторный клик не нужен
  await page.waitForFunction(
    () => /W20/.test(document.querySelector('.ct-child')?.textContent ?? ''),
    null, { timeout: 15000 },
  )

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e edit-child OK')
} finally {
  await browser.close()
}
