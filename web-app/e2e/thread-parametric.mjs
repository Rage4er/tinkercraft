// THREAD-PARAMETRIC: многозаходная резьба, правка в PropertiesPanel, undo/redo и CSG.
import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }

try {
  const objects = () => page.locator('.object-list-item')
  const modal = page.locator('[data-testid=thread-modal]')
  const names = async () => (await objects().locator('.object-list-label').allInnerTexts()).join(' | ')
  const triangles = async () => Number((await page.locator('.props-row').filter({ hasText: 'Триг.' }).locator('.props-value').innerText()).replace(/\s/g, ''))
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.viewport-busy'), null, { timeout: 30000 })
  }

  // ── Многозаходная M10, 3 захода ──
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  await modal.waitFor({ timeout: 10000 })
  await page.locator('[data-testid=thread-series]').selectOption('metric')
  await page.locator('[data-testid=thread-nominal]').selectOption('M10')
  await page.locator('[data-testid=thread-size]').selectOption('M10')
  await page.locator('[data-testid=thread-starts]').selectOption('3')
  await page.locator('[data-testid=thread-length]').fill('20')
  await page.locator('[data-testid=thread-create]').click()
  await modal.waitFor({ state: 'detached', timeout: 30000 })
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 1, null, { timeout: 30000 })
  await settle()
  if (!(await names()).includes('Резьба: M10×20')) fail('нет M10×20: ' + await names())

  // ── Параметрическая панель: 3 захода ──
  const props = page.locator('[data-testid=props-thread]')
  await props.waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '3') fail('в свойствах не 3 захода')
  const tris3 = await triangles()

  // ── Правка: 4 захода и длина 30 → edit_step ──
  await page.locator('[data-testid=props-thread-starts]').selectOption('4')
  await page.waitForFunction(() => document.querySelectorAll('.tl-item').length === 2, null, { timeout: 30000 })
  await settle()
  await page.locator('[data-testid=props-thread-length]').fill('30')
  await page.locator('[data-testid=props-thread-length]').press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('.tl-item').length === 3, null, { timeout: 30000 })
  await settle()
  if (!(await names()).includes('Резьба: M10×30')) fail('имя не обновилось: ' + await names())
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '4') fail('в свойствах не 4 захода')
  const tris4 = await triangles()
  if (tris4 === tris3) fail(`меш не пересобран: треугольников ${tris3} → ${tris4}`)
  const tl = (await page.locator('.tl-item').allInnerTexts()).join(' | ')
  if (!/Правка шага 1/.test(tl)) fail('нет шага правки: ' + tl)

  // ── Undo / redo обеих правок (длина, затем заходы) ──
  await objects().filter({ hasText: 'Резьба:' }).click()
  await toolbarButton(page, 'Отменить').click()
  await page.waitForFunction(() => document.body.innerText.includes('Резьба: M10×20'), null, { timeout: 30000 })
  await settle()
  if (!(await names()).includes('Резьба: M10×20')) fail('undo не вернул длину 20: ' + await names())
  await objects().filter({ hasText: 'Резьба:' }).click()
  await page.locator('[data-testid=props-thread]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '4') fail('undo длины не должен менять заходы')

  await toolbarButton(page, 'Отменить').click()
  await settle()
  await objects().filter({ hasText: 'Резьба:' }).click()
  await page.locator('[data-testid=props-thread]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '3') fail('undo не вернул 3 захода')

  await toolbarButton(page, 'Повторить').click()
  await settle()
  await objects().filter({ hasText: 'Резьба:' }).click()
  await page.locator('[data-testid=props-thread]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '4') fail('redo не вернул 4 захода')
  await toolbarButton(page, 'Повторить').click()
  await page.waitForFunction(() => document.body.innerText.includes('Резьба: M10×30'), null, { timeout: 30000 })
  await settle()
  if (!(await names()).includes('Резьба: M10×30')) fail('redo не вернул длину 30: ' + await names())

  // ── Параметрическая резьба участвует в CSG ──
  await placeShape(page, 'Куб')
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 2, null, { timeout: 30000 })
  const rows = objects()
  await rows.filter({ hasText: 'Резьба:' }).click()
  await rows.filter({ hasText: 'Куб' }).click({ modifiers: ['Shift'] })
  await page.locator('.panel-right').getByRole('button', { name: 'Объединение', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 1, null, { timeout: 30000 })
  await settle()
  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))

  if (shot) await page.screenshot({ path: shot })
  console.log('e2e thread-parametric OK (M10, 3→4 захода, длина 20→30, undo/redo, CSG)')
} finally {
  await browser.close()
}
