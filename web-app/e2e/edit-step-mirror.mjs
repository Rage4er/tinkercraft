// e2e/edit-step-mirror.mjs — Фаза 9.5.3: правка плоскости прошлого шага mirror с каскадом CSG.
// Призма (30, 3) → зеркало YZ (копия в −30, 3) → копия ∪ сфера → ✎ у шага «Зеркало YZ» в
// Timeline → XZ (сразу, без «Применить») → CSG пересчитан, pivot = новая копия (30, −3),
// уведомлений об отказе нет; undo возвращает YZ (−30), redo — XZ.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:edit-step-mirror` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/edit-step-mirror.mjs /tmp/mirror.png`.
import { openApp, toolbarButton, panelButton, placeShape } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
// поле позиции (UX-NUMINPUT: у позиции/поворота/масштаба свои id)
const prop = (axis) => right.locator(`#num-input-pos-${axis}`)
const pos = async () => [await prop('X').inputValue(), await prop('Y').inputValue()].join(',')
try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // призма в (30, 3)
  await placeShape(page, 'Призма')
  await page.waitForTimeout(800)
  await objRows.nth(0).click()
  await prop('X').fill('30'); await prop('X').press('Enter')
  await page.locator('.tl-item', { hasText: 'Переместить' }).waitFor({ timeout: 10000 })
  await prop('Y').fill('3'); await prop('Y').press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('.tl-item').length === 3, null, { timeout: 10000 })

  // зеркало YZ (кнопки тулбара без подписей: 17-я — зеркало YZ)
  await toolbarButton(page, 'Зеркало YZ').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2, null, { timeout: 15000 })
  await page.locator('.tl-item', { hasText: 'Зеркало YZ' }).waitFor({ timeout: 10000 })

  // сфера; объединить зеркальную копию (2-я строка) со сферой (3-я)
  await placeShape(page, 'Сфера')
  await page.waitForTimeout(800)
  await objRows.nth(1).click()
  await objRows.nth(2).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2, null, { timeout: 15000 })
  const csgRow = objRows.filter({ hasNotText: 'Призма' })
  await csgRow.click()
  if ((await pos()) !== '-30.0,3.0') fail('pivot CSG до правки: ' + (await pos()))
  const steps0 = await page.locator('.tl-item').count()

  // ✎ у шага mirror → панель «Шаг N: Зеркало», текущая плоскость YZ
  const mirrorRow = page.locator('.tl-item', { hasText: 'Зеркало' }).first()
  await mirrorRow.locator('.tl-edit').click()
  const panel = page.locator('[data-testid=step-panel]')
  await panel.waitFor({ timeout: 5000 })
  if (!(await panel.textContent())?.includes('Зеркало')) fail('заголовок панели шага')
  const plane = (p) => panel.locator(`[data-testid=step-plane-${p}]`)
  if ((await plane('YZ').getAttribute('aria-checked')) !== 'true') fail('текущая плоскость должна быть YZ')

  // повторный выбор текущей плоскости — без новой операции
  await plane('YZ').click()
  await page.waitForTimeout(300)
  if ((await page.locator('.tl-item').count()) !== steps0) fail('выбор той же плоскости добавил операцию')

  // YZ → XZ — применяется сразу
  await plane('XZ').click()
  await page.locator('.tl-item', { hasText: 'Правка шага' }).waitFor({ timeout: 15000 })
  if ((await page.locator('.tl-item').count()) !== steps0 + 1) fail('ожидалась ровно одна новая операция')
  if (!(await page.locator('.tl-item', { hasText: 'Правка шага' }).textContent())?.includes('YZ → XZ')) fail('подпись правки')
  if ((await mirrorRow.locator('[data-testid=tl-edited]').count()) !== 1) fail('шаг mirror должен показывать метку правки')
  if (!(await mirrorRow.textContent())?.includes('XZ')) fail('шаг mirror должен показывать новую плоскость')
  if ((await plane('XZ').getAttribute('aria-checked')) !== 'true') fail('панель: выбрана XZ')
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.some((m) => /отклонен|не удалось/i.test(m))) fail('уведомление об отказе в простом сценарии: ' + toasts.join(' | '))
  if (shot) await page.screenshot({ path: shot })

  // pivot CSG = зеркальная копия в новой плоскости: (30, −3)
  await csgRow.click()
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  if ((await pos()) !== '30.0,-3.0') fail('pivot CSG после правки: ' + (await pos()))

  // undo → YZ, redo → XZ
  await page.locator('.props-header').click() // убрать фокус с поля ввода
  await page.keyboard.press('Control+z')
  await page.locator('.tl-item.current', { hasText: 'Объединение' }).waitFor({ timeout: 10000 })
  await csgRow.click()
  if ((await pos()) !== '-30.0,3.0') fail('pivot CSG после undo: ' + (await pos()))
  await page.locator('.props-header').click()
  await page.keyboard.press('Control+y')
  await page.locator('.tl-item.current', { hasText: 'Правка шага' }).waitFor({ timeout: 10000 })
  await csgRow.click()
  if ((await pos()) !== '30.0,-3.0') fail('pivot CSG после redo: ' + (await pos()))

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e edit-step-mirror OK')
} finally {
  await browser.close()
}
