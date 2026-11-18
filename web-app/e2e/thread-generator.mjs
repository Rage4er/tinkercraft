// e2e/thread-generator.mjs — THREAD-GENERATOR: палитра «Резьба» → окно «Резьба»
// (серия, размер, длина, болт/гайка) → «Создать» → тело на сцене.
// Метрическая M6 (болт) → undo/redo; дюймовая 1/4"-20 UNC (болт); гайка M6; ∪ куб → CSG.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:thread-generator` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/thread-generator.mjs /tmp/thread.png`.
import { openApp, placeShape } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
try {
  const objects = () => page.locator('.object-list-item')
  const waitObjects = (n) => page.waitForFunction(
    (k) => document.querySelectorAll('.object-list-item').length === k, n, { timeout: 15000 },
  )

  // ── Палитра «Резьба» → окно «Резьба»: серия/размер/длина/болт-гайка ──
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  const modal = page.locator('[data-testid=thread-modal]')
  await modal.waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=thread-series]').inputValue()) !== 'metric') fail('серия по умолчанию — metric')
  if ((await page.locator('[data-testid=thread-size]').inputValue()) !== 'M6') fail('размер по умолчанию — M6')
  if ((await page.locator('[data-testid=thread-length]').inputValue()) !== '20') fail('длина по умолчанию — 20')
  if ((await page.locator('[data-testid=thread-kind]').inputValue()) !== 'bolt') fail('тип по умолчанию — bolt')

  // ── Метрическая M6 × 20, болт → «Создать» → «Резьба: M6×20» ──
  await page.locator('[data-testid=thread-create]').click()
  await modal.waitFor({ state: 'detached', timeout: 15000 })
  await waitObjects(1)
  const name1 = await objects().nth(0).locator('.object-list-label').innerText()
  if (!name1.includes('Резьба: M6×20')) fail('в списке нет «Резьба: M6×20»: ' + name1)

  // undo/redo: резьба убирается и возвращается
  await page.keyboard.press('Control+z')
  await waitObjects(0)
  await page.keyboard.press('Control+y')
  await waitObjects(1)

  // ── Дюймовая 1/4"-20 UNC, болт, длина 25 ──
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  await modal.waitFor({ timeout: 10000 })
  await page.locator('[data-testid=thread-series]').selectOption('imperial')
  const imperialFirst = await page.locator('[data-testid=thread-size] option').first().innerText()
  if (!/1\/4"-20 UNC/.test(imperialFirst)) fail('первая дюймовая — 1/4"-20 UNC: ' + imperialFirst)
  await page.locator('[data-testid=thread-length]').fill('25')
  await page.locator('[data-testid=thread-create]').click()
  await modal.waitFor({ state: 'detached', timeout: 15000 })
  await waitObjects(2)
  const names = await objects().locator('.object-list-label').allInnerTexts()
  if (!names.some((n) => n.includes('Резьба: 1/4-20 UNC×25'))) fail('нет «Резьба: 1/4-20 UNC×25»: ' + names.join(' | '))

  // ── Гайка M6 ──
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  await modal.waitFor({ timeout: 10000 })
  await page.locator('[data-testid=thread-series]').selectOption('metric')
  await page.locator('[data-testid=thread-size]').selectOption('M6')
  await page.locator('[data-testid=thread-kind]').selectOption('nut')
  await page.locator('[data-testid=thread-length]').fill('8')
  await page.locator('[data-testid=thread-create]').click()
  await modal.waitFor({ state: 'detached', timeout: 15000 })
  await waitObjects(3)
  const names3 = await objects().locator('.object-list-label').allInnerTexts()
  if (!names3.some((n) => n.includes('Гайка: M6'))) fail('нет «Гайка: M6»: ' + names3.join(' | '))

  // ── M6 ∪ куб → один CSG ──
  await placeShape(page, 'Куб')
  await waitObjects(4)
  const rows = objects()
  const m6row = rows.filter({ hasText: 'Резьба: M6×20' })
  await m6row.click()
  await rows.filter({ hasText: 'Куб' }).click({ modifiers: ['Shift'] })
  await page.locator('.panel-right').getByRole('button', { name: 'Объединение', exact: true }).click()
  await waitObjects(3)
  const tlText = (await page.locator('.tl-item').allInnerTexts()).join(' | ')
  if (!/Объединение/.test(tlText)) fail('история без шага «Объединение»: ' + tlText)

  if (shot) await page.screenshot({ path: shot })
  if (errors.length > 0) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e thread-generator OK (M6×20 болт + 1/4"-20 UNC×25 болт + гайка M6; undo/redo; M6 ∪ куб → CSG)')
} finally {
  await browser.close()
}
