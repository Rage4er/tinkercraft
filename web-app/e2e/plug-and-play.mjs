// e2e/plug-and-play.mjs — PLUG-AND-PLAY: размещение фигуры с привязкой к плоскости.
//  A. «Куб» → режим (статус-бар «Разместить куб…», иконка нажата, курсор — прицел), фигуры нет →
//     курсор над сеткой: превью встаёт на сетку (плоскость «сетка (XY)», Z = 10 — стоит на ней) →
//     клик → куб там, где было превью (X/Y — точка клика с шагом привязки, Z = 10), режим выключен.
//  B. «Сфера» → курсор над верхней гранью куба: плоскость — грань куба (нормаль +Z) → клик →
//     сфера стоит на грани (Z = верх куба 20 + радиус, X/Y — в пределах грани).
//  C. «Цилиндр» → X: плоскость YZ (камера со стороны +X — нормаль +X) → клик → цилиндр лёжа
//     на YZ: поворот Y = 90, X = половина высоты; Y → плоскость XZ, Z → XY, та же клавиша — снять.
//  D. Esc → отмена (фигуры нет); правый клик по сцене → отмена; Enter над сценой — в превью.
// Уведомлений («нельзя» и др.) и ошибок консоли нет. Логика — __tests__/plug-and-play.test.tsx (WASM).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:plug-and-play` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/plug-and-play.mjs /tmp/shots`.
import os from 'node:os'
import path from 'node:path'
import { openApp } from './helpers.mjs'

const shotDir = process.argv[2]
const { browser, page, errors } = await openApp()
let stage = 'старт'
const fail = (msg) => { throw new Error(msg) }
const rows = page.locator('.ct-item[data-object-id]')
const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const vpLoc = page.locator('.viewport-canvas')
const mode = page.locator('[data-testid=placement-mode]')
const where = () => page.locator('[data-testid=placement-where]').textContent()
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }
const attrs = () => vpLoc.evaluate((e) => ({
  shape: e.dataset.placement ?? null, plane: e.dataset.placementPlane ?? null, face: e.dataset.placementFace ?? null,
  normal: e.dataset.placementNormal ?? null, pos: e.dataset.placementPos ? e.dataset.placementPos.split(',').map(Number) : null,
  cursor: getComputedStyle(e).cursor,
}))
const waitRows = (n) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: 15000 })
/** Поля выбранного объекта: [X, Y, Z, rotX, rotY, rotZ]. */
async function fieldsOf(id) {
  await page.locator(`.ct-item[data-object-id="${id}"]`).click()
  await page.waitForTimeout(150)
  const v = await page.locator('.panel-right input').evaluateAll((els) => els.slice(1, 7).map((e) => Number(e.value)))
  return v
}
/** Наведение: курсор в точку, ждём превью (throttle 50 мс). */
async function hover(x, y) {
  await page.mouse.move(x, y)
  await page.waitForTimeout(120)
  return attrs()
}
const near = (a, b, eps = 0.06) => Math.abs(a - b) <= eps
/** Новая строка после действия. */
async function created(before) {
  await waitRows(before.length + 1)
  return (await ids()).find((i) => !before.includes(i))
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  const vp = await vpLoc.boundingBox()
  const [gx, gy] = [vp.x + vp.width * 0.5, vp.y + vp.height * 0.66]   // сетка перед камерой

  // ── A. «Куб» → превью над сеткой → клик → куб на сетке ──
  stage = 'A. куб на сетку'
  await page.getByText('Куб', { exact: true }).first().click()
  await mode.waitFor({ timeout: 5000 })
  if ((await mode.getAttribute('data-shape')) !== 'cube') fail('A: режим не для куба')
  const hint = await page.locator('[data-testid=placement-hint]').textContent()
  if (!hint.startsWith('Разместить куб: наведите на грань объекта или сетку')) fail('A: подсказка: ' + hint)
  if ((await page.locator('.shape-btn.active').innerText()).trim() !== 'Куб') fail('A: иконка «Куб» не нажата')
  if ((await rows.count()) !== 0) fail('A: клик по иконке создал фигуру')
  const a = await hover(gx, gy)
  if (a.plane !== 'grid' || !a.pos || !near(a.pos[2], 10)) fail('A: превью не на сетке: ' + JSON.stringify(a))
  if (a.cursor !== 'crosshair') fail('A: курсор ' + a.cursor)
  if (!(await where()).startsWith('сетка (XY) · X ')) fail('A: статус-бар: ' + (await where()))
  await shot('pnp-a-preview.png')
  let before = await ids()
  await page.mouse.click(gx, gy)
  const cube = await created(before)
  if (await mode.count()) fail('A: режим не выключился')
  const cf = await fieldsOf(cube)
  if (!near(cf[0], a.pos[0]) || !near(cf[1], a.pos[1]) || !near(cf[2], 10)) fail(`A: куб не там, где превью: ${cf} vs ${a.pos}`)
  if (Math.round(cf[0]) !== cf[0] || Math.round(cf[1]) !== cf[1]) fail('A: шаг привязки 1 мм: ' + cf)
  if (cf[0] === 0 && cf[1] === 0) fail('A: куб в начале координат')
  console.log(`✅ A. «Куб» → режим (0 фигур) → превью на сетке → клик → куб в (${cf.slice(0, 3)}), стоит на сетке`)

  // ── B. «Сфера» → верхняя грань куба → клик → сфера стоит на кубе ──
  stage = 'B. сфера на грань куба'
  await page.mouse.click(vp.x + 10, vp.y + vp.height - 10)            // снять выделение (клик в пустоту)
  await page.getByText('Сфера', { exact: true }).first().click()
  await mode.waitFor({ timeout: 5000 })
  let top = null
  for (let dy = 4; dy < 200 && !top; dy += 4) {                       // вверх от основания куба на экране
    const h = await hover(gx, gy - dy)
    if (h.plane === 'face' && h.face === cube && h.normal === '0.00,0.00,1.00') top = { x: gx, y: gy - dy, ...h }
  }
  if (!top) fail('B: верхняя грань куба не найдена под курсором')
  if (!(await where()).startsWith('грань «Куб')) fail('B: статус-бар: ' + (await where()))
  if (!(top.pos[2] > 30)) fail('B: превью не над гранью: ' + top.pos)
  await shot('pnp-b-face.png')
  before = await ids()
  await page.mouse.click(top.x, top.y)
  const sphere = await created(before)
  const sf = await fieldsOf(sphere)
  if (!near(sf[0], top.pos[0]) || !near(sf[1], top.pos[1]) || !near(sf[2], top.pos[2])) fail(`B: сфера не там, где превью: ${sf} vs ${top.pos}`)
  if (Math.abs(sf[0] - cf[0]) > 10 || Math.abs(sf[1] - cf[1]) > 10) fail(`B: сфера вне грани куба: ${sf} / куб ${cf}`)
  if (!(sf[2] >= 31.5 && sf[2] <= 32.1)) fail('B: сфера не стоит на грани (Z = 20 + R12): ' + sf[2])
  console.log(`✅ B. «Сфера» → грань куба (нормаль +Z) → клик → сфера стоит на кубе: Z = ${sf[2]}, X/Y в пределах грани`)

  // ── C. «Цилиндр» → X / Y / Z → плоскости YZ / XZ / XY ──
  stage = 'C. X / Y / Z'
  await page.mouse.click(vp.x + 10, vp.y + vp.height - 10)
  await page.getByText('Цилиндр', { exact: true }).first().click()
  await mode.waitFor({ timeout: 5000 })
  const [cx, cy] = [vp.x + vp.width * 0.3, vp.y + vp.height * 0.4]
  await hover(cx, cy)
  await page.keyboard.press('KeyY')
  let h = await hover(cx + 1, cy)
  if (h.plane !== 'Y' || h.normal !== '0.00,-1.00,0.00') fail('C: Y → плоскость XZ (нормаль −Y, к камере): ' + JSON.stringify(h))
  if (!(await where()).startsWith('плоскость XZ (Y)')) fail('C: статус-бар: ' + (await where()))
  await page.keyboard.press('KeyZ')
  h = await hover(cx, cy)
  if (h.plane !== 'Z' || h.normal !== '0.00,0.00,1.00') fail('C: Z → плоскость XY: ' + JSON.stringify(h))
  await page.keyboard.press('KeyZ')                                    // снять
  h = await hover(cx + 1, cy)
  if (h.plane === 'Z' || (await mode.getAttribute('data-lock')) !== '') fail('C: та же клавиша не сняла плоскость: ' + JSON.stringify(h))
  await page.keyboard.press('KeyX')
  h = await hover(cx, cy)
  if (h.plane !== 'X' || h.normal !== '1.00,0.00,0.00') fail('C: X → плоскость YZ (нормаль +X): ' + JSON.stringify(h))
  if (!near(h.pos[0], 10)) fail('C: цилиндр должен стоять на YZ (X = 10): ' + h.pos)
  await shot('pnp-c-yz.png')
  before = await ids()
  await page.mouse.click(cx, cy)
  const cyl = await created(before)
  const yf = await fieldsOf(cyl)
  if (!near(yf[0], 10) || !near(yf[4], 90) || !near(yf[3], 0) || !near(yf[5], 0)) fail('C: цилиндр не лёжа на YZ: ' + yf)
  if ((await rows.count()) !== 3) fail('C: «X» в режиме размещения выполнил что-то ещё (объектов ' + (await rows.count()) + ')')
  console.log(`✅ C. X / Y / Z → YZ / XZ / XY (нормаль — к камере), та же клавиша — снять; клик → цилиндр на YZ: X = ${yf[0]}, поворот (${yf.slice(3)})`)

  // ── D. Esc, правый клик — отмена; Enter над сценой — в превью ──
  stage = 'D. отмена и Enter'
  const n0 = await rows.count()
  await page.getByText('Конус', { exact: true }).first().click()
  await mode.waitFor({ timeout: 5000 })
  await hover(gx - 60, gy)
  await page.keyboard.press('Escape')
  await mode.waitFor({ state: 'detached', timeout: 5000 })
  await page.getByText('Тор', { exact: true }).first().click()
  await mode.waitFor({ timeout: 5000 })
  await hover(gx - 60, gy)
  await page.mouse.click(gx - 60, gy, { button: 'right' })
  await mode.waitFor({ state: 'detached', timeout: 5000 })
  await page.waitForTimeout(600)
  if ((await rows.count()) !== n0) fail('D: отмена создала фигуру')
  await page.getByText('Призма', { exact: true }).first().click()
  await mode.waitFor({ timeout: 5000 })
  const e = await hover(gx - 80, gy + 20)
  if (e.plane !== 'grid') fail('D: превью призмы не на сетке: ' + JSON.stringify(e))
  before = await ids()
  await page.keyboard.press('Enter')
  const prism = await created(before)
  const pf = await fieldsOf(prism)
  if (!near(pf[0], e.pos[0]) || !near(pf[1], e.pos[1]) || !near(pf[2], e.pos[2])) fail(`D: Enter поставил не в превью: ${pf} vs ${e.pos}`)
  console.log('✅ D. Esc и правый клик — отмена (фигур нет); Enter над сценой — фигура в превью')

  if (await toasts()) fail('уведомления: ' + (await toasts()))
  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  await shot('pnp-d-scene.png')
  console.log('PLUG-AND-PLAY e2e: OK')
} catch (err) {
  console.error(`PLUG-AND-PLAY e2e FAIL [${stage}]:`, err.message)
  if (errors.length) console.error(errors.join('\n'))
  await page.screenshot({ path: path.join(os.tmpdir(), 'plug-and-play-fail.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
