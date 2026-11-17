// e2e/svg-extrude.mjs — SVG-EXTRUDE: загрузка .svg → контур 2D → глубина/масштаб → 3D-тело.
// Палитра «SVG» → file picker (.svg) → окно «SVG → 3D» (глубина, масштаб, «Создать») → тело
// import_mesh «SVG: profile.svg» на сцене; undo/redo; ∪ куб → один CSG.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:svg-extrude` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/svg-extrude.mjs /tmp/svg.png`.
import { fileURLToPath } from 'node:url'
import { openApp, placeShape } from './helpers.mjs'

const shot = process.argv[2]
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
try {
  // ── Загрузка SVG: палитра «SVG» → file picker принимает .svg → окно «SVG → 3D» ──
  const chooser = page.waitForEvent('filechooser')
  await page.locator('.shape-btn', { hasText: 'SVG' }).click()
  const fc = await chooser
  if ((await fc.element().getAttribute('accept')) !== '.svg') fail('палитра «SVG» — не выбор .svg')
  await fc.setFiles(fixture('profile.svg'))
  const modal = page.locator('[data-testid=svg-modal]')
  await modal.waitFor({ timeout: 10000 })
  const nameRow = await page.locator('[data-testid=svg-file-name]').innerText()
  if (!nameRow.includes('profile.svg')) fail('в окне нет имени файла: ' + nameRow)
  if ((await page.locator('[data-testid=svg-depth]').inputValue()) !== '10') fail('глубина по умолчанию — 10')
  if ((await page.locator('[data-testid=svg-scale]').inputValue()) !== '1') fail('масштаб по умолчанию — 1')

  // ── Глубина 20, масштаб 0.5 → «Создать» → тело 50×30×20 ──
  await page.locator('[data-testid=svg-depth]').fill('20')
  await page.locator('[data-testid=svg-scale]').fill('0.5')
  await page.locator('[data-testid=svg-create]').click()
  await modal.waitFor({ state: 'detached', timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 1, null, { timeout: 15000 })
  const rowText = await page.locator('.object-list-item .object-list-label').innerText()
  if (!rowText.includes('SVG: profile.svg')) fail('в списке нет «SVG: profile.svg»: ' + rowText)

  // undo/redo: тело убирается и возвращается
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 0, null, { timeout: 10000 })
  await page.keyboard.press('Control+y')
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 1, null, { timeout: 10000 })
  const svgId = await page.locator('.object-list-item').getAttribute('title').then((s) => s?.split('—')[1].trim())

  // ── SVG ∪ куб → один CSG ──
  await placeShape(page, 'Куб')
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 2, null, { timeout: 15000 })
  const rows = page.locator('.object-list-item')
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['Shift'] })
  await page.locator('.panel-right').getByRole('button', { name: 'Объединение', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 1, null, { timeout: 15000 })
  const tlText = (await page.locator('.tl-item').allInnerTexts()).join(' | ')
  if (!/Объединение/.test(tlText)) fail('история без шага «Объединение»: ' + tlText)

  // дерево: дети CSG — SVG (baked 🔒) и куб
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  await page.locator('.ct-chevron').click()
  const kidIds = await page.locator('.ct-child').evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id')))
  if (kidIds.length !== 2) fail('детей CSG — 2, получено ' + kidIds.length)
  const svgKid = page.locator(`.ct-child[data-node-id="${svgId}"]`)
  if ((await svgKid.count()) !== 1) fail('нет ребёнка «SVG: profile.svg» (' + svgId + '): ' + kidIds.join(' | '))
  if ((await svgKid.locator('[data-testid=ct-lock]').getAttribute('data-reason')) !== 'baked') fail('SVG-ребёнок не 🔒 baked')

  if (shot) await page.screenshot({ path: shot })
  if (errors.length > 0) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log(`e2e svg-extrude OK (SVG → 3D-тело «SVG: profile.svg» ${svgId}, глубина 20, масштаб 0.5; undo/redo; ∪ куб → CSG с детьми)`)
} finally {
  await browser.close()
}
