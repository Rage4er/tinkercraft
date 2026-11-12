// e2e/ortho-raycast.mjs — ORTHO-RAYCAST: в ортографии луч из курсора попадает в точку под курсором.
//
//  A. Линейка у краёв вида: две точки сетки у левого и правого края → расстояние линейки = расстоянию
//     между точками сетки под курсором (их даёт режим размещения — `data-placement-pos`, он всегда
//     брал активную камеру). Было: линейка брала перспективную камеру — промах растёт к краю.
//  B. Наведение линейки на куб у края вида: точка привязки — на этом кубе, под курсором (а не мимо).
//  C. Гизмо в ортографии: стрелка X ловится под курсором, при перетаскивании куб (и стрелка) идут
//     за мышью. Было: гизмо считал лучи от перспективной камеры — «улетал» или не ловился.
//  D. Перспектива — как раньше (A для перспективы).
// Привязка к сетке — «Откл» (точки не округляются). Ошибок консоли нет.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ortho-raycast` в другом.
import fs from 'node:fs'
import path from 'node:path'
import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const shotDir = process.env.E2E_SHOTS ?? null
if (shotDir) fs.mkdirSync(shotDir, { recursive: true })
const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vpLoc = page.locator('.viewport-canvas')
const shot = async (n) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, n) }) }
const rows = page.locator('.ct-item[data-object-id]')
const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const placementPos = () => vpLoc.evaluate((e) => ({ plane: e.dataset.placementPlane ?? null, face: e.dataset.placementFace ?? null, normal: e.dataset.placementNormal ?? null, pos: e.dataset.placementPos ? e.dataset.placementPos.split(',').map(Number) : null }))
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const rulerValue = async () => {
  const t = await page.locator('.ruler-display').innerText()
  return Number(t.replace(/\s/g, '').match(/([\d.]+)мм|([\d.]+)mm/).slice(1).find(Boolean))
}
const blur = () => page.evaluate(() => document.activeElement?.blur())
const setCamera = async (mode) => {
  const want = mode === 'ortho'
  const is = async () => (await vpLoc.getAttribute('data-camera')) === 'orthographic'
  if ((await is()) !== want) await toolbarButton(page, 'Перспектива ↔ Ортография').click()
  await page.waitForFunction((w) => (document.querySelector('.viewport-canvas')?.getAttribute('data-camera') === 'orthographic') === w, want, { timeout: 5000 })
  await page.waitForTimeout(300)
}
/** Точки сетки под курсором (режим размещения сферы): экран → мир. */
async function gridPoints(pts) {
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.locator('[data-testid=placement-mode]').waitFor({ timeout: 5000 }).catch(async () => {
    await shot('placement-missing.png')
    fail(`${stage}: режим размещения не включился (линейка: ${await page.locator('.ruler-display').count()}, статус: ${(await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ').slice(0, 160)})`)
  })
  const out = []
  for (const p of pts) {
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(150)
    const h = await placementPos()
    if (h.plane !== 'grid' || !h.pos) fail(`${stage}: под курсором (${p.x | 0}, ${p.y | 0}) не сетка: ${JSON.stringify(h)}`)
    out.push(h.pos)
  }
  await page.keyboard.press('Escape')
  await page.locator('[data-testid=placement-mode]').waitFor({ state: 'detached', timeout: 5000 })
    .catch(() => fail(`${stage}: Esc не вышел из режима размещения`))
  return out
}
/** Линейка: клик в P1, клик в P2 → число. */
async function ruler(p1, p2) {
  await blur(); await page.keyboard.press('KeyL'); await page.waitForTimeout(200)
  await page.mouse.move(p1.x, p1.y); await page.waitForTimeout(100); await page.mouse.click(p1.x, p1.y)
  await page.mouse.move(p2.x, p2.y); await page.waitForTimeout(100); await page.mouse.click(p2.x, p2.y)
  await page.locator('.ruler-display').waitFor({ timeout: 5000 })
    .catch(() => fail(`${stage}: линейка не измерила (${p1.x | 0},${p1.y | 0}) → (${p2.x | 0},${p2.y | 0})`))
  const v = await rulerValue()
  await blur(); await page.keyboard.press('KeyL'); await page.waitForTimeout(200)
  return v
}
/** Красные пиксели стрелки X гизмо (вне куба вида), центр и число. */
async function redArrow() {
  const vp = await vpLoc.boundingBox()
  const png = await page.screenshot({ clip: vp })
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const cube = document.querySelector('.viewcube-container')?.getBoundingClientRect()
    const vpr = document.querySelector('.viewport-canvas').getBoundingClientRect()
    const red = [], green = []
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4
      const X = vpr.left + x, Y = vpr.top + y
      if (cube && X >= cube.left && X <= cube.right && Y >= cube.top && Y <= cube.bottom) continue
      if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] < 70) red.push([X, Y])
      else if (d[i + 1] > 200 && d[i] < 80 && d[i + 2] < 80) green.push([X, Y])
    }
    if (!red.length || !green.length) return { n: red.length }
    // кончик стрелки X — красный пиксель дальше всех от зелёной стрелки Y (у центра гизмо — плоские
    // ручки, их цвет тоже красный / зелёный — за них не берёмся); точка — чуть ближе к центру
    const gc = green.reduce((a, p) => [a[0] + p[0] / green.length, a[1] + p[1] / green.length], [0, 0])
    let tip = red[0], best = -1
    for (const p of red) { const dd = Math.hypot(p[0] - gc[0], p[1] - gc[1]); if (dd > best) { best = dd; tip = p } }
    const k = 6 / Math.max(1, Math.hypot(tip[0] - gc[0], tip[1] - gc[1]))
    const r = red.reduce((a, p) => [a[0] + p[0] / red.length, a[1] + p[1] / red.length], [0, 0])
    // основание стрелки — красный пиксель дальше всех от кончика: направление стрелки на экране
    let base = tip, far = -1
    for (const p of red) { const dd = Math.hypot(p[0] - tip[0], p[1] - tip[1]); if (dd > far) { far = dd; base = p } }
    const len = Math.max(1, Math.hypot(tip[0] - base[0], tip[1] - base[1]))
    return { n: red.length, x: tip[0] + (gc[0] - tip[0]) * k, y: tip[1] + (gc[1] - tip[1]) * k, tip, dir: [(tip[0] - base[0]) / len, (tip[1] - base[1]) / len], cx: r[0] }
  }, png.toString('base64'))
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  await page.locator('.snap-btn', { hasText: 'Откл' }).click()
  const vp = await vpLoc.boundingBox()
  // точки у краёв вида — на холсте сцены (не на кубе вида, «Привязке» и подсказке внизу)
  const P = (fx, fy) => ({ x: vp.x + vp.width * fx, y: vp.y + vp.height * fy })
  const L = P(0.05, 0.62), R = P(0.95, 0.62)
  const T = P(0.06, 0.18), B = P(0.5, 0.9)
  for (const [n, p] of Object.entries({ L, R, T, B })) {
    const onScene = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.viewport-canvas') !== null && !document.elementFromPoint(x, y)?.closest('.viewcube-container, .snap-selector, .viewport-hint'), p)
    if (!onScene) fail(`точка ${n} (${p.x | 0}, ${p.y | 0}) — не на холсте сцены`)
  }

  // ── D (сначала): перспектива — линейка = сетке под курсором (как было) ──
  stage = 'D. перспектива'
  {
    const [a, b] = await gridPoints([L, R])
    const r = await ruler(L, R)
    if (Math.abs(r - dist2(a, b)) > 0.5) fail(`D: линейка ${r} ≠ ${dist2(a, b).toFixed(2)} (перспектива)`)
    ok.push(`D: перспектива — линейка ${r} мм = расстоянию между точками сетки под курсором`)
  }

  // ── A: ортография — линейка у краёв вида = сетке под курсором ──
  stage = 'A. орто, линейка у краёв'
  await setCamera('ortho')
  {
    const [a, b, t, bb] = await gridPoints([L, R, T, B])
    const r1 = await ruler(L, R)
    const r2 = await ruler(T, B)
    await shot('ortho-a-ruler.png')
    if (Math.abs(r1 - dist2(a, b)) > 0.5) fail(`A: линейка (лево ↔ право) ${r1} ≠ ${dist2(a, b).toFixed(2)} мм — луч не из курсора`)
    if (Math.abs(r2 - dist2(t, bb)) > 0.5) fail(`A: линейка (угол ↔ угол) ${r2} ≠ ${dist2(t, bb).toFixed(2)} мм — луч не из курсора`)
    ok.push(`A: орто — линейка у краёв вида = сетке под курсором (${r1} и ${r2} мм)`)
  }

  // ── B: орто — наведение линейки на куб у края: привязка — на кубе под курсором ──
  stage = 'B. орто, куб у края'
  await setCamera('perspective')
  await placeShape(page, 'Куб')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1)
  const [cube] = await ids()
  const xField = page.locator('.panel-right #num-input-pos-X')
  await rows.first().click(); await xField.fill('-60'); await xField.press('Enter'); await page.waitForTimeout(400)
  await blur(); await page.keyboard.press('Escape')
  await setCamera('ortho')
  {
    // точка на кубе — через режим размещения (грань под курсором, активная камера)
    await page.getByText('Сфера', { exact: true }).first().click()
    await page.locator('[data-testid=placement-mode]').waitFor({ timeout: 5000 })
    let hit = null
    for (let j = 0; j < 30 && !hit; j++) for (let i = 0; i < 40 && !hit; i++) {
      const x = vp.x + vp.width * (0.02 + i * 0.5 / 40), y = vp.y + vp.height * (0.2 + j * 0.6 / 30)
      await page.mouse.move(x, y); await page.waitForTimeout(60)
      const h = await placementPos()
      if (h.plane === 'face' && h.face === cube && h.normal === '0.00,0.00,1.00') hit = { x, y }
    }
    await page.keyboard.press('Escape')
    if (!hit) fail('B: верх куба под курсором не найден (режим размещения)')
    await page.locator('[data-testid=placement-mode]').waitFor({ state: 'detached', timeout: 5000 })
    // размер (D): точка под курсором — на этом кубе (размер берёт активную камеру — контроль)
    await blur(); await page.keyboard.press('KeyD')
    await page.locator('[data-testid=dimension-mode]').waitFor({ timeout: 5000 })
    await page.mouse.move(hit.x, hit.y); await page.waitForTimeout(150)
    const dh = (await vpLoc.getAttribute('data-dimension-hover')) ?? ''
    await page.keyboard.press('Escape')
    if (dh.split('|')[0] !== cube) fail('B: размер — под курсором не куб: ' + dh)
    // линейка: клик по верху куба и по сетке у правого края — длина ≥ расстояния до верха куба
    const [g] = await gridPoints([R])
    const r = await ruler(hit, R)
    const top = dh.split('|')[2].split(',').map(Number)
    const want = Math.hypot(top[0] - g[0], top[1] - g[1], top[2])
    if (Math.abs(r - want) > 3) fail(`B: линейка с верха куба у края ${r} мм, ожидалось ≈ ${want.toFixed(1)} (точка не под курсором)`)
    ok.push(`B: орто — линейка с верха куба у края вида: ${r} мм ≈ ${want.toFixed(1)} (точка под курсором)`)
  }

  // ── C: орто — гизмо: стрелка X ловится, куб идёт за мышью ──
  stage = 'C. орто, гизмо'
  {
    await rows.first().click(); await page.waitForTimeout(400)
    await blur(); await page.keyboard.press('KeyG'); await page.waitForTimeout(300)
    const x0 = Number(await xField.inputValue())
    const yField = page.locator('.panel-right #num-input-pos-Y'), zField = page.locator('.panel-right #num-input-pos-Z')
    const y0 = Number(await yField.inputValue()), z0 = Number(await zField.inputValue())
    const a0 = await redArrow()
    if (a0.n < 30) fail('C: стрелка X гизмо не найдена на экране (' + a0.n + ' px)')
    await shot('ortho-c-before.png')
    const DX = 120
    await page.mouse.move(a0.x, a0.y); await page.waitForTimeout(200)
    await page.mouse.down()
    // мышь — вдоль экранного направления стрелки X на DX px
    for (let k = 1; k <= 12; k++) { await page.mouse.move(a0.x + (a0.dir[0] * DX * k) / 12, a0.y + (a0.dir[1] * DX * k) / 12); await page.waitForTimeout(30) }
    await page.mouse.up(); await page.waitForTimeout(600)
    const x1 = Number(await xField.inputValue())
    const a1 = await redArrow()
    await shot('ortho-c-after.png')
    if (Math.abs(x1 - x0) < 1) fail(`C: гизмо не захватилось — X ${x0} → ${x1}`)
    const y1 = Number(await yField.inputValue()), z1 = Number(await zField.inputValue())
    if (Math.abs(y1 - y0) > 0.05 || Math.abs(z1 - z0) > 0.05) fail(`C: взята не стрелка X — Y ${y0} → ${y1}, Z ${z0} → ${z1}`)
    // стрелка (с кубом) сдвинулась на экране так же, как мышь вдоль стрелки: проекция сдвига мыши
    // на экранное направление оси X
    // кончик стрелки X сдвинулся на экране вдоль стрелки на столько же, на сколько мышь
    const shift = (a1.tip[0] - a0.tip[0]) * a0.dir[0] + (a1.tip[1] - a0.tip[1]) * a0.dir[1]
    if (Math.abs(shift - DX) > 6) fail(`C: куб не за мышью — мышь +${DX} px, стрелка сдвинулась на ${shift.toFixed(1)} px (X ${x0} → ${x1})`)
    ok.push(`C: орто — гизмо: стрелка X под курсором, мышь +${DX} px вдоль стрелки → стрелка +${shift.toFixed(1)} px, X ${x0} → ${x1}, Y и Z — без изменений`)
  }

  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('e2e ortho-raycast OK\n' + ok.map((s) => '  ✅ ' + s).join('\n'))
} catch (e) {
  console.error(`e2e ortho-raycast FAIL [${stage}] — ${e.message.split('\n')[0]}\n` + ok.map((s) => '  ✅ ' + s).join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
