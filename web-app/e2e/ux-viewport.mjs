// e2e/ux-viewport.mjs — UX-VIEWPORT: навигация, адаптивная сетка, рамка выделения.
//  A. VIEWPORT-NAV: протяжка ЛКМ по пустому месту вид не вращает (кадр тот же); ПКМ-протяжка —
//     вращает; СКМ-протяжка — сдвигает (центр сетки сместился); колесо — масштаб. Отдалились →
//     F — вписать; отдалились → двойной клик СКМ — вписать (шаг и радиус сетки вернулись).
//     Одиночный клик ЛКМ по кубу — по-прежнему выбор.
//  B. GRID-ADAPTIVE: от приближения до отдаления шаг проходит 1 → 5 → 10 → 50 → 100, жирная сетка —
//     всегда ×10; сетка не обрывается: на максимальном отдалении и после сдвига вида далеко линии
//     сетки есть у левого и правого краёв нижней части кадра.
//  C. SELECTION-RECT: слева направо — рамка синяя сплошная (окно), выбран только куб целиком внутри;
//     справа налево — зелёная пунктирная (секущая), выбраны оба; Shift — добавить; рамка исчезает.
// Уведомлений и ошибок консоли нет. Логика — __tests__/ux-viewport.test.tsx.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-viewport` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/ux-viewport.mjs /tmp/shots`.
import os from 'node:os'
import path from 'node:path'
import { openApp, placeShape } from './helpers.mjs'

const shotDir = process.argv[2]
const { browser, page, errors } = await openApp()
let stage = 'старт'
const fail = (msg) => { throw new Error(msg) }
const vpLoc = page.locator('.viewport-canvas')
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }
const grid = () => vpLoc.evaluate((e) => ({ step: Number(e.dataset.gridStep), major: Number(e.dataset.gridMajor), radius: Number(e.dataset.gridRadius), center: e.dataset.gridCenter }))
const selected = () => page.locator('.ct-item.ct-selected').evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const settle = () => page.waitForTimeout(700)
/** Пиксели вьюпорта (RGBA) — декодирование PNG в самой странице. */
async function viewportPixels() {
  const vp = await vpLoc.boundingBox()
  const png = await page.screenshot({ clip: vp })
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    return { w: img.width, h: img.height, data: Array.from(ctx.getImageData(0, 0, img.width, img.height).data) }
  }, png.toString('base64'))
}
/** Доля пикселей полосы в нижней части кадра (у левого и правого краёв), отличных от фона: линии сетки. */
async function gridAtBottomEdges() {
  const { w, h, data } = await viewportPixels()
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]] }
  const bg = px(Math.round(w / 2), 3)                               // небо над горизонтом — фон
  const strip = (x0, x1) => {
    let lines = 0, all = 0
    for (let y = Math.round(h * 0.5); y < Math.round(h * 0.8); y += 2) for (let x = x0; x < x1; x += 2) {   // выше «Куба вида» и подсказки
      const p = px(x, y); all++
      if (Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) > 6) lines++
    }
    return lines / all
  }
  return { left: strip(4, Math.round(w * 0.2)), right: strip(Math.round(w * 0.8), w - 4) }
}
/** Кадр, который больше не меняется (анимация «вписать», демпфирование камеры закончились). */
async function stableFrame(timeout = 15000) {
  const vp = await vpLoc.boundingBox()
  const t0 = Date.now()
  let prev = await page.screenshot({ clip: vp })
  for (;;) {
    await page.waitForTimeout(250)
    const cur = await page.screenshot({ clip: vp })
    if (Buffer.compare(prev, cur) === 0) return cur
    if (Date.now() - t0 > timeout) fail('вид не успокаивается (анимация камеры)')
    prev = cur
  }
}
async function screenshotsDiffer(fn) {
  const before = await stableFrame()
  await fn()
  const after = await stableFrame()
  return Buffer.compare(before, after) !== 0
}
/** Дождаться, пока сетка (шаг, радиус, центр) не меняется 1 с — камера остановилась. */
async function gridSettled(timeout = 15000) {
  const t0 = Date.now()
  let last = JSON.stringify(await grid()), same = 0
  while (same < 5) {
    await page.waitForTimeout(200)
    const cur = JSON.stringify(await grid())
    same = cur === last ? same + 1 : 0
    last = cur
    if (Date.now() - t0 > timeout) fail('камера не останавливается: ' + cur)
  }
  return JSON.parse(last)
}
/** Дождаться «вписанного» вида: шаг и радиус сетки — как после первого F (анимация на CPU дольше). */
async function waitFitted(fitted, what) {
  await page.waitForFunction((f) => {
    const e = document.querySelector('.viewport-canvas')
    return Number(e?.dataset.gridRadius) === f.radius && Number(e?.dataset.gridStep) === f.step
  }, fitted, { timeout: 15000 }).catch(async () => fail(`${what}: вид не вписан — ${JSON.stringify(await grid())}, ожидалось ${JSON.stringify(fitted)}`))
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  await placeShape(page, 'Куб'); await placeShape(page, 'Куб')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2)
  const [c1, c2] = await page.locator('.ct-item[data-object-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
  await page.keyboard.press('KeyF'); await gridSettled(); await stableFrame()
  const vp = await vpLoc.boundingBox()
  const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2
  const empty = { x: vp.x + 40, y: vp.y + vp.height - 60 }          // угол вьюпорта — пусто
  const wheel = async (dy, n) => { for (let i = 0; i < n; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, dy); await page.waitForTimeout(35) } }
  const fitted = await gridSettled()

  // ── A. навигация ──
  stage = 'A. навигация'
  const g0 = await grid()
  const leftRotated = await screenshotsDiffer(async () => {
    await page.mouse.move(empty.x, empty.y); await page.mouse.down()
    await page.mouse.move(empty.x + 220, empty.y - 120, { steps: 12 }); await page.mouse.up()
  })
  if (leftRotated) fail('A: протяжка ЛКМ по пустому месту изменила вид (вращение)')
  if (!(await page.locator('[data-testid=selection-rect]').isHidden())) fail('A: рамка не исчезла')
  const rightRotated = await screenshotsDiffer(async () => {
    await page.mouse.move(cx - 100, cy); await page.mouse.down({ button: 'right' })
    await page.mouse.move(cx + 60, cy, { steps: 12 }); await page.mouse.up({ button: 'right' })
  })
  if (!rightRotated) fail('A: протяжка ПКМ не вращает вид')
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'middle' })
  await page.mouse.move(cx + 250, cy + 100, { steps: 15 }); await page.mouse.up({ button: 'middle' })
  await settle()
  if ((await grid()).center === g0.center) fail(`A: протяжка СКМ не сдвинула вид (центр ${g0.center})`)
  await wheel(600, 40)
  const far1 = await grid()
  if (!(far1.radius > fitted.radius * 3)) fail(`A: колесо не отдалило (радиус ${fitted.radius} → ${far1.radius})`)
  await page.keyboard.press('KeyF')
  await waitFitted(fitted, 'A: F')
  await wheel(600, 40)
  await page.mouse.click(cx + 120, cy - 80, { button: 'middle' }); await page.waitForTimeout(120)
  await page.mouse.click(cx + 120, cy - 80, { button: 'middle' })
  await waitFitted(fitted, 'A: двойной клик СКМ')
  await stableFrame()
  // одиночный клик ЛКМ — выбор (кубы в центре после «вписать»)
  let picked = false
  for (let i = 0; i < 9 && !picked; i++) {
    await page.mouse.click(cx - 80 + i * 20, cy); await page.waitForTimeout(80)
    picked = (await selected()).length === 1
  }
  if (!picked) fail('A: одиночный клик ЛКМ по кубу не выбрал его')
  console.log(`✅ A. ЛКМ-протяжка вид не вращает, ПКМ — вращает, СКМ — сдвигает, колесо — масштаб; F и двойной клик СКМ — вписать (радиус ${far1.radius} → ${fitted.radius}); клик ЛКМ — выбор`)

  // ── B. адаптивная сетка ──
  stage = 'B. сетка'
  await page.mouse.click(empty.x, empty.y)
  await wheel(-600, 40)                                             // вплотную
  const seen = new Set()
  const check = async () => {
    const g = await grid()
    if (g.major !== g.step * 10) fail(`B: жирная сетка не ×10: ${JSON.stringify(g)}`)
    seen.add(g.step)
  }
  await check()
  for (let i = 0; i < 70 && seen.size < 5; i++) { await wheel(250, 2); await check() }
  const order = [...seen]
  if (JSON.stringify(order) !== JSON.stringify([1, 5, 10, 50, 100])) fail('B: шаги при отдалении: ' + JSON.stringify(order))
  await wheel(600, 30)
  await settle(); await shot('uxv-b-far.png')
  const farEdges = await gridAtBottomEdges()
  // фон однородный: оборванная сетка даёт ровно 0 — порог 0,5 % надёжно отличает
  if (farEdges.left < 0.005 || farEdges.right < 0.005) fail(`B: сетка обрывается на отдалении: ${JSON.stringify(farEdges)}`)
  await page.keyboard.press('KeyF'); await waitFitted(fitted, 'B: F'); await stableFrame()
  await wheel(600, 16)                                              // средний масштаб — сдвиг уводит далеко
  for (let k = 0; k < 3; k++) {                                     // сдвиг вида далеко от начала координат
    await page.mouse.move(cx - 300, cy); await page.mouse.down({ button: 'middle' })
    await page.mouse.move(cx + 300, cy, { steps: 15 }); await page.mouse.up({ button: 'middle' })
  }
  await settle(); await shot('uxv-b-panned.png')
  const panned = await grid()
  const [pcx, pcy] = panned.center.split(',').map(Number)
  const [fcx, fcy] = fitted.center.split(',').map(Number)
  if (Math.hypot(pcx - fcx, pcy - fcy) < 50) fail(`B: сдвиг вида не сдвинул сетку (центр ${fitted.center} → ${panned.center})`)
  const panEdges = await gridAtBottomEdges()
  if (panEdges.left < 0.005 || panEdges.right < 0.005) fail(`B: сетка обрывается после сдвига вида (центр ${panned.center}): ${JSON.stringify(panEdges)}`)
  console.log(`✅ B. шаги ${order.join(' → ')} (жирная ×10), на отдалении и после сдвига к (${panned.center}) сетка у краёв кадра (линий: отдаление ${(farEdges.left * 100).toFixed(1)}% / ${(farEdges.right * 100).toFixed(1)}%, сдвиг ${(panEdges.left * 100).toFixed(1)}% / ${(panEdges.right * 100).toFixed(1)}%)`)

  // ── C. рамка выделения ──
  stage = 'C. рамка'
  await page.keyboard.press('KeyF'); await waitFitted(fitted, 'C: F'); await stableFrame()
  await page.mouse.click(empty.x, empty.y)
  const boxes = {}
  for (let j = 0; j < 14; j++) for (let i = 0; i < 22; i++) {      // экранные рамки кубов — кликами
    const x = vp.x + vp.width * (0.15 + i * 0.7 / 22), y = vp.y + vp.height * (0.15 + j * 0.7 / 14)
    await page.mouse.click(x, y)
    const s = await selected()
    if (s.length === 1) { const b = boxes[s[0]] ??= { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y) }
  }
  const [b1, b2] = [boxes[c1], boxes[c2]]
  if (!b1 || !b2) fail('C: кубы не найдены на экране')
  const [A, B] = b1.x0 < b2.x0 ? [b1, b2] : [b2, b1]                // A — левый
  const [idA, idB] = b1.x0 < b2.x0 ? [c1, c2] : [c2, c1]
  const pad = 70
  const L = A.x0 - pad, R = (B.x0 + B.x1) / 2, T = Math.min(A.y0, B.y0) - pad, Bt = Math.max(A.y1, B.y1) + pad
  if (R <= A.x1 + 30) fail('C: кубы слишком близко на экране для проверки')
  const rect = page.locator('[data-testid=selection-rect]')
  const style = () => rect.evaluate((e) => { const c = getComputedStyle(e); return { mode: e.dataset.mode, color: c.borderTopColor, line: c.borderTopStyle } })
  await page.mouse.click(empty.x, empty.y)
  await page.mouse.move(L, T); await page.mouse.down(); await page.mouse.move(R, Bt, { steps: 10 })
  const sw = await style(); await shot('uxv-c-window.png')
  await page.mouse.up(); await page.waitForTimeout(300)
  const win = await selected()
  if (sw.mode !== 'window' || sw.line !== 'solid' || !/rgb\(76, 141, 255\)/.test(sw.color)) fail('C: рамка слева направо не синяя сплошная: ' + JSON.stringify(sw))
  if (JSON.stringify(win) !== JSON.stringify([idA])) fail(`C: слева направо выбрано ${JSON.stringify(win)}, ожидался только ${idA}`)
  if (!(await rect.isHidden())) fail('C: рамка не исчезла')
  await page.mouse.click(empty.x, empty.y)
  await page.mouse.move(R, Bt); await page.mouse.down(); await page.mouse.move(L, T, { steps: 10 })
  const sc = await style(); await shot('uxv-c-crossing.png')
  await page.mouse.up(); await page.waitForTimeout(300)
  const cross = (await selected()).sort()
  if (sc.mode !== 'crossing' || sc.line !== 'dashed' || !/rgb\(63, 207, 116\)/.test(sc.color)) fail('C: рамка справа налево не зелёная пунктирная: ' + JSON.stringify(sc))
  if (JSON.stringify(cross) !== JSON.stringify([c1, c2].sort())) fail(`C: справа налево выбрано ${JSON.stringify(cross)}, ожидались оба`)
  // Shift — добавить: выбран B, окно вокруг A с Shift → оба
  await page.locator(`.ct-item[data-object-id="${idB}"]`).click()
  await page.keyboard.down('Shift')
  await page.mouse.move(L, T); await page.mouse.down(); await page.mouse.move(A.x1 + pad, Bt, { steps: 10 }); await page.mouse.up()
  await page.keyboard.up('Shift'); await page.waitForTimeout(300)
  if ((await selected()).sort().join() !== [c1, c2].sort().join()) fail('C: Shift + рамка не добавила к выделению: ' + JSON.stringify(await selected()))
  console.log(`✅ C. слева направо — синяя сплошная, выбран только ${idA} (целиком внутри); справа налево — зелёная пунктирная, выбраны оба; Shift — добавляет; рамка исчезает`)

  if (await toasts()) fail('уведомления: ' + (await toasts()))
  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('UX-VIEWPORT e2e: OK')
} catch (err) {
  console.error(`UX-VIEWPORT e2e FAIL [${stage}]:`, err.message)
  if (errors.length) console.error(errors.join('\n'))
  await page.screenshot({ path: path.join(os.tmpdir(), 'ux-viewport-fail.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
