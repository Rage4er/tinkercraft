// e2e/view-modes.mjs — VIEW-MODES: реалистичный / каркас / скрытые линии.
//
//  A. Кнопка режима рядом с ViewCube, меню из 3 пунктов с галочкой.
//  B. Реалистичный: заливка и тени (data-view-shadows > 0), рёбра не форсируются.
//  C. Каркас: рёбра (data-view-edges > 0), теней нет, depthTest off (задние рёбра видны).
//  D. Скрытые линии: рёбра + depthTest on, теней нет, заливка цветом фона.
//  E. Выбор переживает перезагрузку (localStorage).
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:view-modes`.

import { openApp, placeShape } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vp = page.locator('.viewport-canvas')
const attr = (name) => vp.getAttribute(name)
const openMenu = async () => {
  if (!(await page.locator('[data-testid=view-mode-menu]').count())) {
    await page.locator('[data-testid=view-mode-button]').click()
  }
  await page.locator('[data-testid=view-mode-menu]').waitFor({ timeout: 5000 })
}
const choose = async (mode) => {
  await openMenu()
  await page.locator(`[data-testid=view-mode-${mode}]`).click()
  await page.waitForFunction((m) => document.querySelector('.viewport-canvas')?.getAttribute('data-view-mode') === m, mode, { timeout: 5000 })
  await page.waitForTimeout(250)
}

try {
  // ── A. Меню ──
  stage = 'A. меню'
  await placeShape(page, 'Куб')
  await page.locator('[data-testid=view-mode-button]').waitFor({ timeout: 5000 })
  await openMenu()
  const items = page.locator('[data-testid=view-mode-menu] [role=menuitemradio]')
  if ((await items.count()) !== 3) fail(`A: пунктов ${await items.count()}, ждали 3`)
  const labels = await items.allTextContents()
  if (!labels.some((s) => s.includes('Реалистичный')) || !labels.some((s) => s.includes('Каркас')) || !labels.some((s) => s.includes('Скрытые линии'))) {
    fail('A: подписи пунктов: ' + labels.join(' | '))
  }
  ok.push('A: меню рядом с ViewCube — 3 пункта')

  // ── B. Реалистичный ──
  stage = 'B. реалистичный'
  await choose('realistic')
  if ((await attr('data-view-mode')) !== 'realistic') fail('B: режим не realistic')
  if (Number(await attr('data-view-shadows')) < 1) fail('B: тени выключены в реалистичном режиме')
  if (Number(await attr('data-view-edges')) !== 0) fail('B: рёбра форсируются в реалистичном режиме')
  ok.push('B: реалистичный — заливка и тени')

  // ── C. Каркас ──
  stage = 'C. каркас'
  await choose('wireframe')
  if (Number(await attr('data-view-edges')) < 1) fail('C: нет рёбер в каркасе')
  if (Number(await attr('data-view-shadows')) !== 0) fail('C: тени остались в каркасе')
  if ((await attr('data-view-depth-test')) !== '0') fail('C: depthTest рёбер должен быть выключен')
  ok.push('C: каркас — только рёбра, без теней, задние рёбра видны')

  // ── D. Скрытые линии ──
  stage = 'D. скрытые линии'
  await choose('hidden-line')
  if (Number(await attr('data-view-edges')) < 1) fail('D: нет рёбер в скрытых линиях')
  if (Number(await attr('data-view-shadows')) !== 0) fail('D: тени остались в скрытых линиях')
  if ((await attr('data-view-depth-test')) !== '1') fail('D: depthTest рёбер должен быть включён')
  ok.push('D: скрытые линии — непрозрачная заливка фоном + рёбра с depthTest')

  // ── E. Сохранение выбора ──
  stage = 'E. перезагрузка'
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Загрузка CSG'), null, { timeout: 30000 })
  if ((await attr('data-view-mode')) !== 'hidden-line') fail('E: режим не сохранился после перезагрузки')
  await choose('realistic')
  ok.push('E: выбор режима сохраняется (hidden-line после перезагрузки)')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e view-modes OK (меню у ViewCube, реалистичный / каркас / скрытые линии, сохранение)')
} catch (e) {
  console.error(`e2e view-modes FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
