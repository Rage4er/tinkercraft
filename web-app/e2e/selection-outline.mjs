// e2e/selection-outline.mjs — SELECTION-OUTLINE: кайма выделенных объектов.
//  A. Куб, сфера, цилиндр; ничего не выделено — data-outline-count 0, синих пикселей каймы нет.
//     Клик ЛКМ по кубу во вьюпорте → count 1, синяя кайма вокруг куба (рамка каймы — вокруг точки
//     клика), толщина 2–4 px (непрозрачная середина линии); клик в пусто → 0, каймы нет.
//  B. Множественное: Shift+клик по сфере → 2, кайма у обоих; рамка слева направо по всем → 3, кайма у
//     каждого; Esc → 0.
//  C. Светлая тема — кайма видна (обычное смешивание, не выцветает); орто (Tab) — кайма есть;
//     гизмо (G) — кайма есть, гизмо поверх.
//  D. Производительность: сфера 100k треугольников + 20 фигур, всё выделено (Ctrl+A) — FPS ≥ 55
//     (`assertPerf`: в CI без GPU — предупреждение).
// Ошибок консоли (в т.ч. компиляции шейдеров) нет. Логика —
// src/__tests__/selection-outline.test.tsx.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:selection-outline` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/selection-outline.mjs /tmp/shots`.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, placeShape, toolbarButton, assertPerf } from './helpers.mjs'

const shotDir = process.argv[2]
const { browser, page, errors } = await openApp()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'selection-outline-'))
let stage = 'старт'
const ok = []
const fail = (msg) => { throw new Error(msg) }
const vpLoc = page.locator('.viewport-canvas')
const rows = page.locator('.ct-item[data-object-id]')
const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const waitRows = (n, t = 30000) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: t })
const selected = () => page.locator('.ct-item.ct-selected').evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const status = async () => (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ')
const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }
const blur = () => page.evaluate(() => document.activeElement?.blur())
const outlineCount = () => vpLoc.evaluate((e) => Number(e.dataset.outlineCount))
const waitOutline = (n, what) => page.waitForFunction((k) => Number(document.querySelector('.viewport-canvas')?.dataset.outlineCount) === k, n, { timeout: 10000 })
  .catch(async () => fail(`${what}: data-outline-count ${await outlineCount()}, ожидалось ${n}`))
const pickInTree = async (id) => { await page.locator(`.ct-item[data-object-id="${id}"]`).click(); await page.waitForTimeout(150) }

/**
 * Пиксели каймы на снимке вьюпорта: насыщенный синий (#2f80ff) — непрозрачная середина линии.
 * Палитра объектов пастельная (#89b4fa, #74c7ec — r высокий), поэтому с ней не путается.
 * Возвращает пиксели каймы в координатах страницы + их рамку.
 */
async function outlinePixels() {
  const vp = await vpLoc.boundingBox()
  const png = await page.screenshot({ clip: vp })
  const pts = await page.evaluate(async ({ b64, vx, vy }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, img.width, img.height).data
    // поверх вьюпорта — «Куб вида» (синий), привязка, подсказка: их пиксели не считаем
    const skip = [...document.querySelectorAll('.viewcube-container, .viewport-canvas > :not(canvas)')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && r.width < img.width * 0.9)
    const out = []
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2]
      if (!(b >= 200 && r <= 100 && g >= 85 && g <= 175 && b - r >= 130)) continue
      const px = vx + x, py = vy + y
      if (skip.some((q) => px >= q.left && px <= q.right && py >= q.top && py <= q.bottom)) continue
      out.push(x, y)
    }
    return out
  }, { b64: png.toString('base64'), vx: vp.x, vy: vp.y })
  const list = []
  for (let i = 0; i < pts.length; i += 2) list.push([vp.x + pts[i], vp.y + pts[i + 1]])
  const xs = list.map((p) => p[0]), ys = list.map((p) => p[1])
  const box = list.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null
  return { n: list.length, list, box }
}
const inBox = (list, b, m = 6) => list.filter(([x, y]) => x >= b.x0 - m && x <= b.x1 + m && y >= b.y0 - m && y <= b.y1 + m).length
const center = (b) => ({ x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2) })
/** Толщина каймы: медиана длины ряда пикселей каймы по горизонтали у левого края (середина высоты). */
function leftThickness(list, b) {
  const set = new Set(list.map(([x, y]) => `${x},${y}`))
  const runs = []
  for (let y = Math.round(b.y0 + (b.y1 - b.y0) * 0.35); y <= Math.round(b.y0 + (b.y1 - b.y0) * 0.65); y++) {
    let x = b.x0 - 2
    while (x < b.x0 + 20 && !set.has(`${x},${y}`)) x++
    let run = 0
    while (set.has(`${x + run},${y}`)) run++
    if (run > 0) runs.push(run)
  }
  runs.sort((p, q) => p - q)
  return runs.length ? runs[Math.floor(runs.length / 2)] : 0
}
/** Рамка каймы объекта `id`: выделить его в дереве, снять кайму, снять выделение. */
async function outlineBoxOf(id) {
  await pickInTree(id); await waitOutline(1, 'рамка объекта')
  await page.waitForTimeout(150)
  const o = await outlinePixels()
  if (!o.box || o.n < 100) fail(`кайма объекта ${id}: ${o.n} пикселей`)
  return o.box
}

try {
  // ── A: кайма у выделенного, клик в пусто — нет ──
  stage = 'A'
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  for (const label of ['Куб', 'Сфера', 'Цилиндр']) await placeShape(page, label)
  await waitRows(3)
  const [cube, sphere, cyl] = await ids()
  await blur(); await page.keyboard.press('Escape')
  await waitOutline(0, 'A: ничего не выделено')
  await page.waitForTimeout(200)
  const none = await outlinePixels()
  if (none.n > 20) fail(`A: ничего не выделено, а синих пикселей каймы ${none.n}`)
  const boxCube = await outlineBoxOf(cube)
  const boxSphere = await outlineBoxOf(sphere)
  const boxCyl = await outlineBoxOf(cyl)
  await blur(); await page.keyboard.press('Escape'); await waitOutline(0, 'A: Esc')

  const vp = await vpLoc.boundingBox()
  const cc = center(boxCube)
  await page.mouse.click(cc.x, cc.y)
  await waitOutline(1, 'A: клик по кубу')
  if (JSON.stringify(await selected()) !== JSON.stringify([cube])) fail('A: клик по кубу выбрал ' + JSON.stringify(await selected()))
  await page.waitForTimeout(150)
  const one = await outlinePixels()
  await shot('outline-a-one.png')
  if (one.n - none.n < 200) fail(`A: кайма у куба — ${one.n} пикселей (без выделения ${none.n})`)
  if (!(one.box.x0 < cc.x && cc.x < one.box.x1 && one.box.y0 < cc.y && cc.y < one.box.y1)) fail(`A: кайма не вокруг куба: ${JSON.stringify(one.box)}, клик ${JSON.stringify(cc)}`)
  if (inBox(one.list, boxSphere, -4) > 30 && inBox(one.list, boxCube) < one.n * 0.9) fail('A: кайма не только у куба')
  const thick = leftThickness(one.list, one.box)
  if (thick < 2 || thick > 4) fail(`A: толщина каймы ${thick} px (ожидалось 2–4)`)
  ok.push(`A: ничего не выделено — 0 (синих ${none.n}); клик по кубу → кайма ${one.n} px вокруг него, толщина ${thick} px`)

  // клик в пустое место (сетка слева, далеко от фигур) — выделение и кайма сняты
  const empty = { x: Math.round(vp.x + vp.width * 0.12), y: Math.round(vp.y + vp.height * 0.35) }
  await page.mouse.click(empty.x, empty.y)
  await waitOutline(0, 'A: клик в пусто')
  if ((await selected()).length !== 0) fail('A: клик в пусто не снял выделение: ' + JSON.stringify(await selected()))
  await page.waitForTimeout(150)
  const after = await outlinePixels()
  if (after.n > Math.max(20, none.n + 10)) fail(`A: клик в пусто — каймы нет, а синих пикселей ${after.n}`)
  ok.push(`A: клик в пусто → выделение снято, кайма снята (синих ${after.n})`)

  // ── B: множественное ──
  stage = 'B'
  await page.mouse.click(cc.x, cc.y); await waitOutline(1, 'B: куб')
  const sc = center(boxSphere)
  await page.keyboard.down('Shift'); await page.mouse.click(sc.x, sc.y); await page.keyboard.up('Shift')
  await waitOutline(2, 'B: Shift+сфера')
  await page.waitForTimeout(150)
  const two = await outlinePixels()
  await shot('outline-b-two.png')
  const onCube = inBox(two.list, boxCube), onSphere = inBox(two.list, boxSphere)
  if (onCube < 100 || onSphere < 100) fail(`B: кайма у обоих — у куба ${onCube}, у сферы ${onSphere}`)
  // рамка слева направо (окно) вокруг всех трёх → три в кайме
  await blur(); await page.keyboard.press('Escape'); await waitOutline(0, 'B: Esc')
  const all = { x0: Math.min(boxCube.x0, boxSphere.x0, boxCyl.x0) - 25, y0: Math.min(boxCube.y0, boxSphere.y0, boxCyl.y0) - 25, x1: Math.max(boxCube.x1, boxSphere.x1, boxCyl.x1) + 25, y1: Math.max(boxCube.y1, boxSphere.y1, boxCyl.y1) + 90 }   // ниже — часть фигур под сеткой (кайма там приглушённая, в рамку каймы не вошла)
  await page.mouse.move(all.x0, all.y0); await page.mouse.down()
  await page.mouse.move((all.x0 + all.x1) / 2, (all.y0 + all.y1) / 2, { steps: 4 }); await page.mouse.move(all.x1, all.y1, { steps: 4 })
  await page.mouse.up()
  await waitOutline(3, 'B: рамка по всем')
  await page.waitForTimeout(150)
  const three = await outlinePixels()
  await shot('outline-b-three.png')
  const per = [boxCube, boxSphere, boxCyl].map((b) => inBox(three.list, b))
  if (per.some((k) => k < 100)) fail('B: рамка по всем — кайма у каждого: ' + per.join(' / '))
  ok.push(`B: Shift+клик → 2 (у куба ${onCube}, у сферы ${onSphere} px); рамка по всем → 3 (${per.join(' / ')} px)`)

  // ── C: светлая тема, орто, гизмо ──
  stage = 'C'
  await toolbarButton(page, 'Сменить тему').click(); await blur()
  await pickInTree(cube); await waitOutline(1, 'C: светлая тема')
  await page.waitForTimeout(300)
  const light = await outlinePixels()
  await shot('outline-c-light.png')
  if (inBox(light.list, boxCube) < 150) fail(`C: светлая тема — кайма у куба ${inBox(light.list, boxCube)} px`)
  await toolbarButton(page, 'Сменить тему').click(); await blur()
  await page.keyboard.press('Tab'); await page.waitForTimeout(600)            // орто
  const ortho = await outlinePixels()
  await shot('outline-c-ortho.png')
  if (ortho.n < 150) fail(`C: орто — кайма ${ortho.n} px`)
  await page.keyboard.press('Tab'); await page.waitForTimeout(600)
  await page.keyboard.press('KeyG'); await page.waitForTimeout(400)
  await waitOutline(1, 'C: гизмо')
  const gizmo = await outlinePixels()
  await shot('outline-c-gizmo.png')
  if (gizmo.n < 150) fail(`C: с гизмо — кайма ${gizmo.n} px`)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  ok.push(`C: светлая тема — кайма ${inBox(light.list, boxCube)} px; орто — ${ortho.n} px; с гизмо — ${gizmo.n} px`)

  // ── D: производительность — 100k + 20 фигур, всё выделено ──
  stage = 'D'
  const R = 30, rings = 225, segs = 224
  const P = (i, j) => { const th = Math.PI * i / rings, ph = 2 * Math.PI * j / segs; return [R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th)] }
  const tris = []
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); if (i !== 0) tris.push([a, b, d]); if (i !== rings - 1) tris.push([b, c, d]) }
  const buf = Buffer.alloc(84 + tris.length * 50); buf.writeUInt32LE(tris.length, 80)
  tris.forEach((tt, q) => tt.flat().forEach((v, m) => buf.writeFloatLE(v, 84 + q * 50 + 12 + m * 4)))
  const big = path.join(tmp, 'big.stl'); fs.writeFileSync(big, buf)
  const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Импорт').click(); (await fc).setFiles(big)
  await waitRows(4, 30000)
  const LABELS = ['Куб', 'Сфера', 'Цилиндр', 'Конус', 'Тор', 'Призма', 'Пирамида']
  for (let i = 0; i < 20; i++) { await placeShape(page, LABELS[i % 7]); await waitRows(5 + i) }
  await blur(); await page.keyboard.press('KeyF'); await page.waitForTimeout(1500)
  await page.keyboard.press('Escape'); await waitOutline(0, 'D: Esc')
  await page.waitForTimeout(1200)
  const fps0 = Number((await status()).match(/FPS: (\d+)/)[1])
  await page.keyboard.press('Control+a')
  await waitOutline(24, 'D: Ctrl+A')
  await page.waitForTimeout(1500)
  const fps = Number((await status()).match(/FPS: (\d+)/)[1])
  const tri = (await status()).match(/Треуг\.: ([\d\s]+)/)[1].replace(/\s/g, '')
  await shot('outline-d-all.png')
  assertPerf(fps >= 55, `D: FPS с каймой у 24 объектов (${tri} треугольников) — ${fps} (без выделения ${fps0})`)
  ok.push(`D: ${tri} треугольников, 24 объекта выделены — FPS ${fps} (без выделения ${fps0})`)

  stage = 'итог'
  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('SELECTION-OUTLINE ✅\n  ' + ok.join('\n  '))
} catch (e) {
  console.error(`SELECTION-OUTLINE ❌ [${stage}] ${e.message}`)
  if (ok.length) console.error('  пройдено:\n  ' + ok.join('\n  '))
  if (errors.length) console.error('  ошибки консоли: ' + errors.join(' | '))
  await shot('outline-fail.png').catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
  fs.rmSync(tmp, { recursive: true, force: true })
}
