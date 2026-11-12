// e2e/ux-audit-7.mjs — UX-прогон 7: H–N, O–T, U–Y повторно (`pnpm e2e:ux-audit-2…6` и остальные) +
// явная проверка фиксов fix-all-6 (часть 4). Новых багов прогон 7 не нашёл — `knownBug` нет.
//  41. CSG (куб X 0 ∪ куб X 60) гранью +X к верху куба: центр тела (экспорт STL) на месте, X в панели
//     0 → 30 (операнд A повернулся с телом); undo / redo, правка ребёнка (ширина 20 → 30 — растёт
//     вверх), правка шага куба плоскости A до выравнивания (ΔZ + 5 — выравнивание пересчитано, тело
//     выше на 5, ALIGN-PLANE-RESOLVE), `.3dtc` — то же; копия, зеркальная копия, вложенный CSG,
//     «Множественное» (две CSG) — центр тела на своих X/Y. Конус, пирамида, текст, импорт (клин) —
//     поворот вокруг опорной точки (центр масс): Y/Z прежние.
//  42. Поле «Поворот Z» 270 — 270, «поворот (0, 0, 270)°»; выравнивание 170 → 200, undo / redo / `.3dtc`
//     — 200; шаг выравнивания — align «Выровнять по грани» / «Align to face», ✎ нет; правка поворота куба
//     до выравнивания (170 → 175) — снова 200; 350 + 30 → 380 (решение 3: угол объекта продолжается).
//     Гизмо: кольцо Z через 180° (175 → больше 180, шаг меньше 180°), кольцо Y через 90° (rotY 80 →
//     (0, > 90, 0), а не (180, …, 180)).
// Ошибок консоли нет (все сценарии).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-audit-7` в другом.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, toolbarButton, findAlignFace, placeShape } from './helpers.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-7-'))
const ok = []
const fail = (msg) => { throw new Error(msg) }

/** Сессия браузера с общими хелперами (как в ux-audit-6). */
async function session(size) {
  const s = await openApp(size)
  const { page } = s
  const rows = page.locator('.ct-item[data-object-id]')
  const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
  const waitRows = (n, t = 20000) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: t })
  const steps = () => page.locator('.tl-item').count()
  const waitSteps = (n, t = 20000) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: t })
  const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
  const blur = () => page.evaluate(() => document.activeElement?.blur())
  const labels = async () => (await page.locator('.tl-label').allInnerTexts()).map((x) => x.trim())
  const add = async (label) => {
    const b = new Set(await ids())
    await placeShape(page, label)
    await waitRows(b.size + 1)
    return (await ids()).find((i) => !b.has(i))
  }
  const pick = async (id) => {
    await page.locator(`.ct-item[data-object-id="${id}"]`).click()
    await page.waitForFunction((k) => { const sel = document.querySelectorAll('.ct-item.ct-selected'); return sel.length === 1 && sel[0].getAttribute('data-object-id') === k }, id, { timeout: 5000 })
    await page.waitForTimeout(150)
  }
  const setF = async (id, f, v) => {
    await pick(id)
    const n = await steps(); const el = page.locator(`.panel-right #${f}`)
    if (Number(await el.inputValue()) === v) return
    await el.fill(String(v)); await el.press('Enter')
    await waitSteps(n + 1)
  }
  /** Трансформ объекта из полей свойств: [x, y, z, rotX, rotY, rotZ]. */
  const tr = async (id) => {
    await pick(id)
    const v = async (f) => Number(await page.locator(`.panel-right #num-input-${f}`).inputValue())
    return [await v('pos-X'), await v('pos-Y'), await v('pos-Z'), await v('rot-X'), await v('rot-Y'), await v('rot-Z')]
  }
  const csg = async (a, b, key) => {
    const be = new Set(await ids())
    await pick(a); await page.locator(`.ct-item[data-object-id="${b}"]`).click({ modifiers: ['Shift'] }); await blur()
    await page.keyboard.press(key)
    await waitRows(be.size - 1)
    return (await ids()).find((i) => !be.has(i))
  }
  const copyPaste = async (id) => {
    const b = new Set(await ids())
    await pick(id); await blur()
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v')
    await waitRows(b.size + 1)
    return (await ids()).find((i) => !b.has(i))
  }
  const mirror = async (id, plane) => {
    const b = new Set(await ids()); await pick(id); await blur()
    await toolbarButton(page, `Зеркало ${plane}`).click(); await waitRows(b.size + 1)
    return (await ids()).find((i) => !b.has(i))
  }
  const confirmClear = async () => {
    if ((await rows.count()) === 0 && (await steps()) === 0) return
    await toolbarButton(page, 'Очистить сцену').click()
    await page.locator('[data-testid=confirm-modal]').getByRole('button', { name: 'Очистить', exact: true }).click()
    await waitRows(0)
  }
  const addText = async (text) => {
    const b = new Set(await ids())
    await page.getByText('Текст', { exact: true }).first().click()
    const modal = page.locator('.text-modal-backdrop'); await modal.waitFor({ timeout: 5000 })
    await modal.locator('input.text-modal-input').fill(text)
    await modal.locator('input.text-modal-num').first().fill('10')
    await modal.locator('button.btn.primary').click()
    await waitRows(b.size + 1)
    await modal.waitFor({ state: 'detached', timeout: 5000 })
    return (await ids()).find((i) => !b.has(i))
  }
  const saveReopen = async () => {
    const dl = page.waitForEvent('download'); await toolbarButton(page, 'Сохранить').click()
    const proj = path.join(tmp, `p${Date.now()}.3dtc`); await (await dl).saveAs(proj)
    const n = await rows.count(); await confirmClear()
    const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Открыть').click(); (await fc).setFiles(proj)
    await waitRows(n); await page.waitForTimeout(400)
  }
  /** Раскрыть все узлы дерева. */
  const expandAll = async () => {
    for (let k = 0; k < 8; k++) {
      const closed = page.locator('.ct-chevron', { hasText: '▸' })
      if (!(await closed.count())) break
      await closed.first().click(); await page.waitForTimeout(100)
    }
  }
  /** Подписи узлов дерева под корнем (корень — первый). */
  const treeNames = (id) => page.evaluate((r) => [...(document.querySelector(`.ct-item[data-object-id="${r}"]`)?.parentElement?.querySelectorAll('.ct-name') ?? [])].map((e) => e.textContent.trim()), id)
  const panel = page.locator('[data-testid=align-panel]')
  const startAlign = async ({ multiple = false } = {}) => {
    await blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyF'); await page.waitForTimeout(800)
    await toolbarButton(page, 'Выровнять').click(); await panel.waitFor({ timeout: 5000 })
    if (multiple) await page.locator('[data-testid=align-multiple]').check()
  }
  const clickA = async (id, accept) => {
    const f = await findAlignFace(page, id, accept); await page.mouse.click(f.x, f.y)
    await page.waitForFunction(() => document.querySelector('[data-testid=align-plane]')?.textContent?.includes('грань'), null, { timeout: 5000 })
  }
  const clickB = async (id, accept) => {
    const f = await findAlignFace(page, id, accept); const n = await steps()
    await page.mouse.click(f.x, f.y); await waitSteps(n + 1); await page.waitForTimeout(300)
  }
  const exitAlign = async () => { if (await panel.count()) await page.locator('[data-testid=align-done]').click(); await page.waitForTimeout(150) }
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  return { ...s, rows, ids, waitRows, steps, waitSteps, toasts, blur, labels, add, pick, setF, tr, csg, copyPaste, mirror, confirmClear, addText, saveReopen, expandAll, treeNames, panel, startAlign, clickA, clickB, exitAlign }
}
const near = (a, b, eps = 0.051) => Math.abs(a - b) <= eps
const locks = (page) => page.locator('[data-testid=ct-lock]').count()


/** Рамка вершин бинарного STL (`filter` — какие вершины учитывать): min / max / центр по осям. */
function stlBox(file, filter = () => true) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(80)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) {
    const p = [0, 1, 2].map((k) => b.readFloatLE(84 + t * 50 + 12 + v * 12 + k * 4))
    if (!filter(p)) continue
    p.forEach((x, k) => { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x) })
  }
  const r = (x) => +x.toFixed(2)
  return { lo: lo.map(r), hi: hi.map(r), c: lo.map((x, k) => r((x + hi[k]) / 2)) }
}
async function exportBox(page, filter) {
  const dl = page.waitForEvent('download'); await toolbarButton(page, 'Экспорт').click(); await page.locator('[data-testid=export-menu-stl]').click()
  const f = path.join(tmp, `e${Date.now()}.stl`); await (await dl).saveAs(f)
  return stlBox(f, filter)
}
const dirXY = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0]
const close = (n, v, eps = 0.02) => Math.hypot(n[0] - v[0], n[1] - v[1], n[2] - v[2]) < eps
const same2 = (a, b, eps = 0.11) => near(a[0], b[0], eps) && near(a[1], b[1], eps)

/** Панель шага по ✎ у последнего шага `label`: «Исходно» и поля поворота. */
async function stepPanel(page, label, which = 'last') {
  await page.locator('.tl-item', { hasText: label })[which]().locator('.tl-edit').click()
  const sp = page.locator('[data-testid=step-panel]'); await sp.waitFor({ timeout: 5000 })
  const original = ((await sp.locator('[data-testid=step-original]').textContent()) ?? '').trim()
  const rot = await sp.locator('[data-testid=step-rotDelta] input.props-input').evaluateAll((els) => els.map((e) => Number(e.value))).catch(() => [])
  return { sp, original, rot }
}
const back = (sp) => sp.getByRole('button', { name: /Назад|Back/ }).click()

/**
 * Гизмо поворота: кольцо оси `axis` ('Z' — синее, 'Y' — зелёное) находится по цвету пикселей на снимке
 * вьюпорта; протяжка от правой точки кольца по горизонтали (`dir` — знак). Возвращает число шагов истории.
 */
async function gizmoDrag(s, axis, dir) {
  const { page } = s
  const vp = page.locator('.viewport-canvas'); const bb = await vp.boundingBox()
  const png = await page.screenshot({ clip: bb })
  const px = await page.evaluate(async ([b64, ax]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data
    const out = []
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2]
      if (ax === 'Z' ? b > 180 && r < 70 && gg < 70 : gg > 180 && r < 70 && b < 70) out.push([x, y])
    }
    return out
  }, [png.toString('base64'), axis])
  if (!px.length) fail(`гизмо: кольцо ${axis} не найдено`)
  const cy = px.reduce((a, p) => a + p[1], 0) / px.length
  const [x0, y0] = px.filter((p) => Math.abs(p[1] - cy) < 6).sort((a, b) => b[0] - a[0])[0] ?? px[0]
  const sx = bb.x + x0, sy = bb.y + y0, n = await s.steps()
  await page.mouse.move(sx, sy); await page.waitForTimeout(200); await page.mouse.down()
  for (let i = 1; i <= 12; i++) { await page.mouse.move(sx + dir * i * 3, sy + i); await page.waitForTimeout(30) }
  await page.mouse.up(); await s.waitSteps(n + 1)
}
/** Гизмо-поворот объекта `id` по оси так, чтобы угол вырос (если ушёл вниз — undo и в другую сторону). */
async function gizmoRotateUp(s, id, axis) {
  const { page } = s, k = axis === 'Z' ? 5 : 4
  const before = (await s.tr(id))[k]
  await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyF'); await page.waitForTimeout(600)
  await s.pick(id); await s.blur(); await page.keyboard.press('KeyR'); await page.waitForTimeout(500)
  await gizmoDrag(s, axis, 1)
  if ((await s.tr(id))[k] < before) {
    await s.blur(); await page.keyboard.press('Control+z'); await page.waitForTimeout(500)
    await s.pick(id); await s.blur(); await page.waitForTimeout(300)
    await gizmoDrag(s, axis, -1)
  }
  await page.keyboard.press('KeyG')
  return { before, after: await s.tr(id) }
}

try {
  // ── ✅ 41: CSG, повёрнутая выравниванием вокруг центра рамки, и дальнейшие действия ──
  {
    const s = await session()
    const { page } = s
    const c = await s.add('Куб'); await s.setF(c, 'num-input-pos-X', -80)
    const a = await s.add('Куб'); await s.setF(a, 'num-input-pos-X', 0)
    const b = await s.add('Куб'); await s.setF(b, 'num-input-pos-X', 60)
    const g = await s.csg(a, b, 'KeyU')
    const body = (p) => p[0] > -60                                        // вершины CSG (куб C — X −90…−70)
    const b0 = await exportBox(page, body)
    await s.startAlign(); await s.clickA(c, (n) => n[2] > 0.99); await s.clickB(g, (n) => n[0] > 0.99); await s.exitAlign()
    const t1 = await s.tr(g), b1 = await exportBox(page, body)
    if (!same2(b1.c, b0.c) || !near(b1.hi[2], 70, 0.11) || !near(t1[0], 30) || !near(t1[4], -90, 0.11)) fail(`41: CSG ${t1.join(', ')}, тело ${JSON.stringify(b0)} → ${JSON.stringify(b1)}`)
    ok.push(`41: CSG (куб X 0 ∪ куб X 60) гранью +X к верху куба — центр тела (STL) X/Y ${b0.c[0]}, ${b0.c[1]} → ${b1.c[0]}, ${b1.c[1]}, тело встало (Z ${b1.lo[2]}…${b1.hi[2]}); X в панели 0 → ${t1[0]}, rotY ${t1[4]}`)
    // undo / redo
    await s.blur(); await page.keyboard.press('Control+z'); await page.waitForTimeout(700)
    const tu = await s.tr(g), bu = await exportBox(page, body)
    await s.blur(); await page.keyboard.press('Control+y'); await page.waitForTimeout(700)
    const tr2 = await s.tr(g), br = await exportBox(page, body)
    if (!near(tu[0], 0) || JSON.stringify(bu) !== JSON.stringify(b0) || tr2.join() !== t1.join() || JSON.stringify(br) !== JSON.stringify(b1)) fail(`41: undo ${tu.join(', ')} / redo ${tr2.join(', ')}`)
    // правка ребёнка: куб B ширина 20 → 30 — растёт вверх (куб B — верхний)
    await s.pick(g)
    await page.locator(`.ct-item[data-object-id="${g}"] .ct-chevron`).click(); await page.waitForTimeout(200)
    await page.locator('.ct-child').nth(1).click()
    const cp = page.locator('[data-testid=child-props]'); await cp.waitFor({ timeout: 5000 })
    await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
    if (await page.locator('[data-testid=child-unavailable]').count() || await locks(page)) fail('41: правка ребёнка недоступна')
    let n = await s.steps(); const w = cp.locator('input.props-input').nth(0)
    await w.fill('30'); await w.blur(); await s.waitSteps(n + 1); await page.waitForTimeout(300)
    const bc = await exportBox(page, body)
    if (!same2(bc.c, b1.c) || !near(bc.lo[2], b1.lo[2], 0.11) || !near(bc.hi[2], 75, 0.11)) fail(`41: правка ребёнка — ${JSON.stringify(bc)}`)
    await page.locator(`.ct-item[data-object-id="${g}"] .ct-name`).click()
    // ALIGN-PLANE-RESOLVE: правка шага «Переместить» куба C (плоскость A) до выравнивания — ΔZ + 5:
    // выравнивание пересчитано — торец CSG снова на верху C, тело на 5 мм выше, X/Y на месте
    const { sp } = await stepPanel(page, 'Переместить', 'first')
    const dz = sp.locator('[data-testid=step-delta] input.props-input').nth(2)
    n = await s.steps(); await dz.fill('5'); await dz.press('Enter'); await s.waitSteps(n + 1); await page.waitForTimeout(300)
    const edit = (await s.labels()).at(-1); await back(sp)
    const bs = await exportBox(page, body)
    if (!near(bs.c[0], bc.c[0], 0.11) || !near(bs.c[1], bc.c[1], 0.11) || !near(bs.c[2], bc.c[2] + 5, 0.11) || await s.toasts()) fail(`41: правка шага C — ${JSON.stringify(bs)} («${edit}», ${await s.toasts()})`)
    await s.saveReopen()
    const bo = await exportBox(page, body)
    if (JSON.stringify(bo) !== JSON.stringify(bs) || await locks(page)) fail(`41: .3dtc — ${JSON.stringify(bo)}`)
    ok.push(`41: после выравнивания — undo / redo (X в панели 0 ↔ 30, тело то же), правка ребёнка (ширина 30: Z ${bc.lo[2]}…${bc.hi[2]}, X/Y на месте), правка шага куба плоскости A до выравнивания («${edit}» — выравнивание пересчитано: тело на 5 мм выше, X/Y на месте), .3dtc — то же, без замков`)
    if (s.errors.length) fail('41: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ 41: копия, зеркальная копия, вложенный CSG, «Множественное» ──
  {
    const s = await session()
    const { page } = s
    const two = async () => {
      const c = await s.add('Куб'); await s.setF(c, 'num-input-pos-X', -80)
      const a = await s.add('Куб'); await s.setF(a, 'num-input-pos-X', 0)
      const b = await s.add('Куб'); await s.setF(b, 'num-input-pos-X', 60)
      return { c, g: await s.csg(a, b, 'KeyU') }
    }
    const res = []
    {
      const { c, g } = await two()
      const k = await s.copyPaste(g); await s.setF(k, 'num-input-pos-X', 0); await s.setF(k, 'num-input-pos-Y', 60); await s.setF(k, 'num-input-pos-Z', 0)
      const f = (p) => p[1] > 30
      const b0 = await exportBox(page, f)
      await s.startAlign(); await s.clickA(c, (n) => n[2] > 0.99); await s.clickB(k, (n) => n[0] > 0.99); await s.exitAlign()
      const b1 = await exportBox(page, f)
      if (!same2(b1.c, b0.c)) fail(`41: копия CSG — ${b0.c} → ${b1.c}`)
      res.push(`копия ${b0.c[0]}, ${b0.c[1]} → ${b1.c[0]}, ${b1.c[1]}`)
      await s.confirmClear()
    }
    {
      const { c, g } = await two()
      await s.setF(c, 'num-input-pos-Y', 90)
      const m = await s.mirror(g, 'YZ'); await s.setF(m, 'num-input-pos-Y', 45)
      const f = (p) => p[1] > 30 && p[1] < 70
      const b0 = await exportBox(page, f)
      await s.startAlign(); await s.clickA(c, (n) => n[2] > 0.99); await s.clickB(m, (n) => n[0] > 0.99); await s.exitAlign()
      const b1 = await exportBox(page, f)
      if (!same2(b1.c, b0.c)) fail(`41: зеркальная копия CSG — ${b0.c} → ${b1.c}`)
      res.push(`зеркальная копия ${b0.c[0]}, ${b0.c[1]} → ${b1.c[0]}, ${b1.c[1]}`)
      await s.confirmClear()
    }
    {
      const { c, g } = await two()
      const sph = await s.add('Сфера'); await s.setF(sph, 'num-input-pos-X', 120)
      const g2 = await s.csg(g, sph, 'KeyU')
      const f = (p) => p[0] > -60
      const b0 = await exportBox(page, f)
      await s.startAlign(); await s.clickA(c, (n) => n[2] > 0.99); await s.clickB(g2, (n) => n[0] > 0.99); await s.exitAlign()
      const b1 = await exportBox(page, f)
      if (!same2(b1.c, b0.c)) fail(`41: вложенный CSG — ${b0.c} → ${b1.c}`)
      res.push(`вложенный (CSG ∪ сфера) ${b0.c[0]}, ${b0.c[1]} → ${b1.c[0]}, ${b1.c[1]}`)
      await s.confirmClear()
    }
    {
      const c = await s.add('Куб'); await s.setF(c, 'num-input-pos-X', -80)
      const a1 = await s.add('Куб'); await s.setF(a1, 'num-input-pos-X', 0); await s.setF(a1, 'num-input-pos-Y', 60)
      const b1 = await s.add('Куб'); await s.setF(b1, 'num-input-pos-X', 60); await s.setF(b1, 'num-input-pos-Y', 60)
      const g1 = await s.csg(a1, b1, 'KeyU')
      const a2 = await s.add('Куб'); await s.setF(a2, 'num-input-pos-X', 0); await s.setF(a2, 'num-input-pos-Y', -60)
      const b2 = await s.add('Куб'); await s.setF(b2, 'num-input-pos-X', 60); await s.setF(b2, 'num-input-pos-Y', -60)
      const g2 = await s.csg(a2, b2, 'KeyU')
      const f1 = (p) => p[1] > 30, f2 = (p) => p[1] < -30
      const c1 = await exportBox(page, f1), c2 = await exportBox(page, f2)
      await s.startAlign({ multiple: true }); await s.clickA(c, (n) => n[2] > 0.99); await s.clickB(g1, (n) => n[0] > 0.99); await s.clickB(g2, (n) => n[0] > 0.99); await s.exitAlign()
      const d1 = await exportBox(page, f1), d2 = await exportBox(page, f2)
      if (!same2(d1.c, c1.c) || !same2(d2.c, c2.c) || (await s.labels()).slice(-2).join() !== 'Выровнять по грани,Выровнять по грани') fail(`41: «Множественное» — ${c1.c} → ${d1.c}; ${c2.c} → ${d2.c}`)
      res.push(`«Множественное» (две CSG) ${c1.c[0]}, ${c1.c[1]} / ${c2.c[0]}, ${c2.c[1]} — на месте`)
    }
    ok.push('41: центр тела (STL) на своих X/Y — ' + res.join('; '))
    if (s.errors.length) fail('41: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ 41: примитивы, текст, импорт — поворот вокруг опорной точки (центр масс) ──
  {
    const s = await session()
    const { page } = s
    const wedge = path.join(tmp, 'wedge.stl')
    {
      // клин 40 × 20 × 30: центр масс треугольника основания — не центр рамки
      const V = [[0, 0, 0], [40, 0, 0], [0, 20, 0], [0, 0, 30], [40, 0, 30], [0, 20, 30]]
      const T = [[0, 2, 1], [3, 4, 5], [0, 1, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 4]]
      const buf = Buffer.alloc(84 + T.length * 50); buf.writeUInt32LE(T.length, 80)
      T.forEach((t, q) => t.forEach((vi, m) => V[vi].forEach((x, k) => buf.writeFloatLE(x, 84 + q * 50 + 12 + m * 12 + k * 4))))
      fs.writeFileSync(wedge, buf)
    }
    const res = []
    for (const [label, make, accept] of [
      ['конус', async () => { const k = await s.add('Конус'); await s.setF(k, 'num-input-rot-X', -90); return k }, (n) => n[1] < -0.99],
      ['пирамида', async () => { const k = await s.add('Пирамида'); for (const a of ['X', 'Y', 'Z']) await s.setF(k, `num-input-scale-${a}`, 2); return k }, (n) => n[1] < -0.5 && n[2] > 0.1],
      ['текст', async () => { const k = await s.addText('Дом'); for (const a of ['X', 'Y', 'Z']) await s.setF(k, `num-input-scale-${a}`, 3); return k }, (n) => n[2] > 0.99],
      ['импорт (клин)', async () => {
        const b = new Set(await s.ids())
        const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Импорт').click(); (await fc).setFiles(wedge)
        await s.waitRows(b.size + 1, 30000)
        return (await s.ids()).find((i) => !b.has(i))
      }, (n) => n[2] > 0.99],
    ]) {
      const c = await s.add('Куб'); await s.setF(c, 'num-input-pos-X', -60)
      const k = await make(); await s.setF(k, 'num-input-pos-Y', 30)
      const t0 = await s.tr(k)
      await s.startAlign(); await s.clickA(c, (n) => n[0] > 0.99); await s.clickB(k, accept); await s.exitAlign()
      const t1 = await s.tr(k)
      if (!near(t1[1], t0[1]) || !near(t1[2], t0[2]) || (await s.labels()).at(-1) !== 'Выровнять по грани') fail(`41: ${label} — ${t0.join(', ')} → ${t1.join(', ')}`)
      res.push(`${label} Y/Z ${t0[1]}, ${t0[2]} → ${t1[1]}, ${t1[2]}`)
      await s.confirmClear()
    }
    ok.push('41: примитивы, текст, импорт — поворот вокруг опорной точки (центр масс), сдвиг только вдоль нормали A: ' + res.join('; '))
    if (s.errors.length) fail('41: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ 42: углы шага и объекта ──
  {
    const s = await session()
    const { page } = s
    // ручной ввод 270 — не нормализуется
    const m = await s.add('Куб'); await s.setF(m, 'num-input-rot-Z', 270)
    const tm = await s.tr(m)
    let p = await stepPanel(page, 'Повернуть'); await back(p.sp)
    if (tm[5] !== 270 || p.original !== 'поворот (0, 0, 270)°' || p.rot[2] !== 270) fail(`42: ручной 270 — ${tm[5]}, «${p.original}», поле ${p.rot[2]}`)
    await s.confirmClear()
    // выравнивание 170 → 200
    const r = await s.add('Куб'); await s.setF(r, 'num-input-rot-Z', 20)
    const k = await s.add('Куб'); await s.setF(k, 'num-input-pos-X', 60); await s.setF(k, 'num-input-rot-Z', 170)
    await s.startAlign(); await s.clickA(r, (n) => close(n, dirXY(20))); await s.clickB(k, (n) => close(n, dirXY(-10))); await s.exitAlign()
    const ta = await s.tr(k)
    await s.blur(); await page.keyboard.press('Control+z'); await page.waitForTimeout(600); const tu = await s.tr(k)
    await s.blur(); await page.keyboard.press('Control+y'); await page.waitForTimeout(600); const tr2 = await s.tr(k)
    await s.saveReopen(); const to = await s.tr(k)
    if (!near(ta[5], 200, 0.11) || !near(tu[5], 170, 0.11) || !near(tr2[5], 200, 0.11) || !near(to[5], 200, 0.11)) fail(`42: 170 → ${ta[5]}, undo ${tu[5]}, redo ${tr2[5]}, .3dtc ${to[5]}`)
    // ALIGN-PLANE-RESOLVE: шаг выравнивания — align «Выровнять по грани» (en «Align to face»), ✎ нет
    const alignRow = page.locator('.tl-item').last()
    const label = ((await alignRow.locator('.tl-label').textContent()) ?? '').trim(), edits = await alignRow.locator('.tl-edit').count()
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(300)
    const en = ((await alignRow.locator('.tl-label').textContent()) ?? '').trim()
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(300)
    if (label !== 'Выровнять по грани' || en !== 'Align to face' || edits !== 0) fail(`42: шаг выравнивания «${label}» / «${en}», ✎ ${edits}`)
    // правка поворота куба до выравнивания (170 → 175) — выравнивание пересчитано: угол снова 200
    p = await stepPanel(page, 'Повернуть')
    const rz = p.sp.locator('[data-testid=step-rotDelta] input.props-input').nth(2)
    let n = await s.steps(); await rz.fill('175'); await rz.press('Enter'); await s.waitSteps(n + 1)
    const edit = (await s.labels()).at(-1); await back(p.sp)
    const te = await s.tr(k)
    if (!near(te[5], 200, 0.11) || !/^Правка шага \d+: поворот \(0, 0, 170\)° → \(0, 0, 175\)°$/.test(edit)) fail(`42: правка поворота до выравнивания — ${te[5]}, «${edit}»`)
    ok.push(`42: поле 270 — 270, «поворот (0, 0, 270)°»; выравнивание 170 → ${ta[5]} (undo ${tu[5]}, redo ${tr2[5]}, .3dtc ${to[5]}): шаг «${label}» / «${en}», ✎ нет; «${edit}» — выравнивание пересчитано, снова ${te[5]}`)
    await s.confirmClear()
    // решение 3: 350 + 30 → 380
    const r2 = await s.add('Куб'); await s.setF(r2, 'num-input-rot-Z', 20)
    const k2 = await s.add('Куб'); await s.setF(k2, 'num-input-pos-X', 60); await s.setF(k2, 'num-input-rot-Z', 350)
    await s.startAlign(); await s.clickA(r2, (n) => close(n, dirXY(20))); await s.clickB(k2, (n) => close(n, dirXY(-10))); await s.exitAlign()
    const t3 = await s.tr(k2)
    const l3 = ((await page.locator('.tl-item').last().locator('.tl-label').textContent()) ?? '').trim()
    if (!near(t3[5], 380, 0.11) || l3 !== 'Выровнять по грани') fail(`42: 350 + 30 — ${t3[5]}, «${l3}»`)
    ok.push(`42: решение 3 — угол объекта продолжается: 350 + 30 → ${t3[5]}, шаг «${l3}»`)
    await s.confirmClear()
    // гизмо: кольцо Z через 180°
    const gz = await s.add('Куб'); await s.setF(gz, 'num-input-rot-Z', 175)
    const z = await gizmoRotateUp(s, gz, 'Z')
    p = await stepPanel(page, 'Повернуть'); await back(p.sp)
    const dz = z.after[5] - z.before
    if (!(z.after[5] > 180) || !(dz > 0 && dz < 180) || !near(p.rot[2], dz, 0.11) || z.after[3] !== 0 || z.after[4] !== 0) fail(`42: гизмо Z — ${z.before} → ${z.after.join(', ')}, «${p.original}», поле ${p.rot[2]}`)
    await s.confirmClear()
    // гизмо: кольцо Y через 90° — равносильная запись (0, > 90, 0), а не (180, …, 180)
    const gy = await s.add('Куб'); await s.setF(gy, 'num-input-rot-Y', 80)
    const y = await gizmoRotateUp(s, gy, 'Y')
    const py = await stepPanel(page, 'Повернуть'); await back(py.sp)
    if (!(y.after[4] > 90) || y.after[3] !== 0 || y.after[5] !== 0 || py.rot[0] !== 0 || py.rot[2] !== 0 || !near(py.rot[1], y.after[4] - 80, 0.11)) fail(`42: гизмо Y — 80 → ${y.after.join(', ')}, «${py.original}»`)
    ok.push(`42: гизмо — кольцо Z через 180°: 175 → ${z.after[5]}, «Исходно» «${p.original}»; кольцо Y через 90°: rotY 80 → (${y.after.slice(3).join(', ')}), «${py.original}»`)
    if (s.errors.length) fail('42: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  console.log('e2e ux-audit-7 OK')
  for (const x of ok) console.log('  ✅ ' + x)
} catch (e) {
  console.error('e2e ux-audit-7 FAIL:', e.message)
  for (const x of ok) console.error('  ✅ ' + x)
  process.exitCode = 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit()
}
