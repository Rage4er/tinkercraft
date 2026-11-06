// e2e/tree.mjs — Фаза 9.1: CSG раскрывается в дереве, ребёнок выбирается.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:tree` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/tree.mjs /tmp/tree.png`.
import { openApp, panelButton } from './helpers.mjs'

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
  if ((await rows.count()) !== 2) fail('ожидалось 2 объекта в дереве')

  // раскрывать нечего — у примитивов нет шеврона
  if ((await page.locator('.ct-chevron').count()) !== 0) fail('у примитивов не должно быть шеврона')

  // выделить оба и объединить
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['Shift'] })
  // порядок кнопок в группе «CSG операции»: объединение, вычитание, пересечение
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })

  // CSG-результат: шеврон есть, дети скрыты
  const chevron = page.locator('.ct-item[data-object-id] .ct-chevron')
  if ((await chevron.count()) !== 1) fail('у CSG должен быть шеврон')
  if ((await page.locator('.ct-child').count()) !== 0) fail('дети должны быть свёрнуты по умолчанию')

  // раскрыть: два ребёнка (куб, сфера), редактируемые, с параметрами
  await chevron.click()
  const children = page.locator('.ct-child')
  if ((await children.count()) !== 2) fail('ожидалось 2 ребёнка, получено ' + (await children.count()))
  const texts = await children.allInnerTexts()
  if (!texts[0].includes('Куб') || !texts[1].includes('Сфера')) fail('порядок/названия детей: ' + texts.join(' | '))
  if (!/W\d/.test(texts[0]) || !/R\d/.test(texts[1])) fail('нет сводки параметров: ' + texts.join(' | '))
  if ((await page.locator('.ct-child.ct-readonly').count()) !== 0) fail('примитивы-дети должны быть редактируемыми')

  // выбор ребёнка: подсветка ребёнка, корень в сцене выделен
  await children.nth(0).click()
  if ((await page.locator('.ct-child-selected').count()) !== 1) fail('ребёнок не подсвечен')
  const selectedChild = await page.evaluate(() => document.querySelector('.ct-child-selected')?.getAttribute('data-node-id'))
  if (!selectedChild) fail('нет data-node-id у выбранного ребёнка')
  if (shot) await page.screenshot({ path: shot })

  // клик по корню снимает выбор ребёнка
  await page.locator('.ct-item[data-object-id] .ct-name').click()
  if ((await page.locator('.ct-child-selected').count()) !== 0) fail('выбор ребёнка не сброшен кликом по корню')

  // свернуть
  await chevron.click()
  if ((await page.locator('.ct-child').count()) !== 0) fail('дети не свернулись')

  // ── 9.9: индикатор «правка недоступна» ──
  // здоровый CSG: замков нет (раскрываем заново — раньше свернули)
  await chevron.click()
  await page.waitForTimeout(600)
  if ((await page.locator('[data-testid=ct-lock]').count()) !== 0) fail('у здорового CSG не должно быть замков')
  await chevron.click()

  // вложенный CSG, сдвинутый до объединения: двигаем результат по X и объединяем с цилиндром
  // (до NESTED-MOVED-EDIT — замки nested_moved, теперь — правится)
  await page.locator('.ct-item[data-object-id] .ct-name').click()
  const posX = page.locator('.panel-right input.props-input').first()
  await posX.fill('60')
  await posX.blur()
  await page.waitForTimeout(500)
  await page.getByText('Цилиндр', { exact: true }).first().click()
  await page.waitForTimeout(800)
  const rows2 = page.locator('.ct-item[data-object-id]')
  if ((await rows2.count()) !== 2) fail('ожидалось 2 объекта перед вторым CSG, получено ' + (await rows2.count()))
  await rows2.nth(0).click()
  await rows2.nth(1).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })
  await page.locator('.ct-item[data-object-id] .ct-chevron').click()

  // NESTED-MOVED-EDIT: вложенный CSG, сдвинутый до объединения, больше не заблокирован —
  // замков нет, ребёнок вложенного CSG открывает форму параметров (правка — e2e:nested-moved-edit)
  await page.waitForFunction(() => document.querySelectorAll('.ct-child').length >= 2, null, { timeout: 15000 })
  await page.waitForTimeout(1500)                                     // проверка согласованности корня (9.9)
  if ((await page.locator('[data-testid=ct-lock]').count()) !== 0) {
    const reasons = await page.locator('[data-testid=ct-lock]').evaluateAll((els) => els.map((e) => e.getAttribute('data-reason')))
    fail('у сдвинутого вложенного CSG не должно быть замков: ' + reasons.join(','))
  }
  await page.locator('.ct-child', { hasText: 'Цилиндр' }).click()
  await page.locator('[data-testid=child-form]').waitFor({ timeout: 5000 })
  if ((await page.locator('[data-testid=child-not-editable]').count()) !== 0) fail('вместо формы — сообщение «правка недоступна»')
  if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-nested.png') })

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e tree OK')
} finally {
  await browser.close()
}
