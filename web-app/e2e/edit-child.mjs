// e2e/edit-child.mjs — Фаза 9.2/9.3: правка параметра ребёнка CSG пересобирает результат.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:edit-child` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/edit-child.mjs /tmp/edit.png`.
import { openApp, toolbarButton, panelButton } from './helpers.mjs'

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
  await panelButton(page, 'Объединение').click()
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

  // Timeline: ✎ у шага «Добавить куб» снова выбирает ребёнка (после сброса выбора кликом по корню)
  await page.locator('.ct-item[data-object-id] .ct-name').click()
  if ((await page.locator('[data-testid=child-props]').count()) !== 0) fail('панель ребёнка должна закрыться')
  await page.locator('.tl-item', { hasText: 'Добавить куб' }).locator('.tl-edit').click()
  await page.locator('[data-testid=child-props]').waitFor({ timeout: 5000 })
  if ((await page.locator('.ct-child-selected').count()) !== 1) fail('Timeline-правка не выбрала ребёнка')
  // индикатор проверки (9.9) разрешает правку
  await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
  if ((await page.locator('[data-testid=child-unavailable]').count()) !== 0) fail('правка должна быть доступна')

  // undo → ширина 20
  await page.locator('.props-header').click() // убрать фокус с поля ввода
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })
  // раскрытие сохраняется между undo/redo (id корня тот же) — повторный клик не нужен
  await page.waitForFunction(
    () => /W20/.test(document.querySelector('.ct-child')?.textContent ?? ''),
    null, { timeout: 15000 },
  )

  // ── 9.8: правка зеркального ребёнка ──
  // чистая сцена: перезагрузка страницы (autosave может восстановить сессию — очищаем хранилища)
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear()
    for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name)
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Загрузка CSG'), null, { timeout: 30000 })
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  await page.getByText('Призма', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.waitForTimeout(800)
  const objRows = page.locator('.ct-item[data-object-id]')
  if ((await objRows.count()) !== 2) fail('ожидалось 2 объекта (призма, сфера), получено ' + (await objRows.count()))

  // зеркало призмы по YZ (кнопки тулбара без подписей: 17-я — зеркало YZ)
  await objRows.nth(0).click()
  await toolbarButton(page, 'Зеркало YZ').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 3, null, { timeout: 15000 })

  // объединить зеркальную копию (3-я строка) со сферой (2-я)
  await objRows.nth(2).click()
  await objRows.nth(1).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2, null, { timeout: 15000 })

  // раскрыть CSG-результат и выбрать зеркальную призму: замка нет, форма есть
  await page.locator('.ct-item[data-object-id] .ct-chevron').click()
  const mirrorRow = page.locator('.ct-child', { hasText: 'зеркало' })
  if ((await mirrorRow.count()) !== 1) fail('зеркальный ребёнок не помечен «зеркало»: ' + (await page.locator('.ct-child').allInnerTexts()).join(' | '))
  await mirrorRow.click()
  await page.locator('[data-testid=child-props]').waitFor({ timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
  if ((await page.locator('[data-testid=ct-lock]').count()) !== 0) fail('у зеркального примитива не должно быть замка')
  if ((await page.locator('[data-testid=child-not-editable]').count()) !== 0) fail('зеркальный примитив должен быть редактируемым')
  const mInputs = page.locator('[data-testid=child-form] input.props-input')
  if ((await mInputs.count()) !== 3) fail('у призмы 3 поля (R, H, грани), получено ' + (await mInputs.count()))

  // правка радиуса → результат пересобран, строка показывает R20, зеркало сохранено
  await mInputs.nth(0).fill('20')
  await mInputs.nth(0).blur()
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.ct-child')).some((e) => /R20/.test(e.textContent ?? '') && /зеркало/.test(e.textContent ?? '')),
    null, { timeout: 15000 },
  )
  if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-mirrored.png') })

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e edit-child OK')
} finally {
  await browser.close()
}
