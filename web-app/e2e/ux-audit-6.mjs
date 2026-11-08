// e2e/ux-audit-6.mjs — UX-прогон 6: H–N, O–T, U–Y повторно (`pnpm e2e:ux-audit-2…5` и остальные) +
// явная проверка фиксов fix-all-5 (часть 4) + новые баги.
//  32-followup. Призма → верх куба: X/Y 40, 0, сдвиг только по Z; «Множественное» — три призмы, каждая
//     на своём X/Y.
//  37. Плоскость Y: грань под 5° к встречной — доворот, Y 10, rotZ 0; 85° / 90° — в ту же сторону
//     (Y −10), 95° — встречно (Y 10).
//  36. Текст «Дом» (ru) в en — «Text: Дом»; «Hi» (en) в ru — «Текст: Hi»; переименованный — своё имя.
//  38/40. Поворот полем → ✎: «Шаг 2: Повернуть», «Исходно» — поворот (0, 0, 30)°; правка на 45° —
//     «Правка шага 2: поворот (0, 0, 30)° → (0, 0, 45)°»; масштаб → «Масштаб».
//  39. «Вписать в экран» на 768×1024 (перспектива и ортография) и 1400 — у краёв вьюпорта объектов нет.
//  Баги прогона 6 (логика — __tests__/ux-audit-6.test.tsx):
//     ✅ UX-AUDIT-41 (fix-all-6) CSG при выравнивании с поворотом поворачивается вокруг центра рамки —
//     центр тела по экспорту STL на месте (было: вокруг опорной точки — операнда A, уходила вбок);
//     🐞 UX-AUDIT-42 (`knownBug`) шаг выравнивания через ±180° — «поворот (0, 0, −330)°» вместо 30°.
// Ошибок консоли нет (все сценарии).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-audit-6` в другом.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, toolbarButton, findAlignFace, spaceShapeClick } from './helpers.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-6-'))
const ok = []
const known = []
const fail = (msg) => { throw new Error(msg) }
/** Известный баг (UX-AUDIT-41…): `expectation` бросает — баг на месте; выполнилась — перенести в ✅. */
async function knownBug(id, title, expectation) {
  let reproduced = false
  try { await expectation() } catch (e) { reproduced = true; known.push(`${id} ${title} — ${e.message}`) }
  if (!reproduced) fail(`${id} (${title}): ожидание выполнилось — баг исправлен? Перенести проверку в ✅ и обновить DEVELOPMENT_PLAN`)
}

/** Сессия браузера с общими хелперами (как в ux-audit-5). */
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
    await spaceShapeClick(page, label)
    await page.getByText(label, { exact: true }).first().click()
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

/** Рамка вершин бинарного STL (`filter` — какие вершины учитывать): центр по осям. */
function stlCenter(file, filter) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(80)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) {
    const p = [0, 1, 2].map((k) => b.readFloatLE(84 + t * 50 + 12 + v * 12 + k * 4))
    if (!filter(p)) continue
    p.forEach((x, k) => { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x) })
  }
  return lo.map((x, k) => +((x + hi[k]) / 2).toFixed(2))
}
const exportCenter = async (page, filter) => {
  const dl = page.waitForEvent('download'); await toolbarButton(page, 'Экспорт').click()
  const f = path.join(tmp, `e${Date.now()}.stl`); await (await dl).saveAs(f)
  return stlCenter(f, filter)
}
/** Единичный вектор в плоскости XY под углом `deg`. */
const dirXY = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0]
const close = (n, v, eps = 0.02) => Math.hypot(n[0] - v[0], n[1] - v[1], n[2] - v[2]) < eps

try {
  // ── ✅ 32-followup: призма → верх куба на месте; «Множественное» — три призмы ──
  // ── ✅ UX-AUDIT-41: CSG поворачивается вокруг центра рамки — тело не уходит вбок (fix-all-6) ──
  {
    const s = await session()
    const { page } = s
    const cube = await s.add('Куб')
    const p1 = await s.add('Призма'); await s.setF(p1, 'num-input-pos-X', 40)
    await s.startAlign(); await s.clickA(cube, (n) => n[2] > 0.99); await s.clickB(p1, (n) => Math.abs(n[2]) < 0.05)
    const t1 = await s.tr(p1)
    if (!near(t1[0], 40) || !near(t1[1], 0) || !near(t1[2], -0.4, 0.11) || Math.max(Math.abs(t1[3]), Math.abs(t1[4])) < 89.9) fail('32-followup: призма ' + t1.join(', '))
    ok.push(`32-followup: призма → верх куба — X/Y ${t1[0]}, ${t1[1]}, Z ${t1[2]}, поворот (${t1.slice(3).join(', ')})°`)
    await s.confirmClear()
    const c2 = await s.add('Куб')
    const ps = []
    for (const x of [40, -40, 80]) { const p = await s.add('Призма'); await s.setF(p, 'num-input-pos-X', x); ps.push([p, x]) }
    await s.startAlign({ multiple: true }); await s.clickA(c2, (n) => n[2] > 0.99)
    for (const [p] of ps) await s.clickB(p, (n) => Math.abs(n[2]) < 0.05)
    await s.exitAlign()
    for (const [p, x] of ps) {
      const tt = await s.tr(p)
      if (!near(tt[0], x) || !near(tt[1], 0) || !near(tt[2], -0.4, 0.11)) fail(`32-followup: «Множественное» — призма X ${x}: ${tt.join(', ')}`)
    }
    if ((await s.labels()).slice(-3).join() !== 'Повернуть,Повернуть,Повернуть') fail('32-followup: шаги ' + (await s.labels()).slice(-3).join(' / '))
    ok.push('32-followup: «Множественное» — три призмы (X 40, −40, 80): каждая на своём X/Y, Z −0,4, три шага «Повернуть»')

    // UX-AUDIT-41: CSG куб X 0 ∪ куб X 60 — опорная точка X 0, центр тела X 30
    await s.confirmClear()
    const c = await s.add('Куб'); await s.setF(c, 'num-input-pos-X', -80)
    const a = await s.add('Куб'); await s.setF(a, 'num-input-pos-X', 0)
    const b = await s.add('Куб'); await s.setF(b, 'num-input-pos-X', 60)
    const g = await s.csg(a, b, 'KeyU')
    const body = (p) => p[0] > -60                                      // вершины CSG (куб C — X −90…−70)
    const before = await exportCenter(page, body)
    const pivot0 = await s.tr(g)
    await s.startAlign(); await s.clickA(c, (n) => n[2] > 0.99); await s.clickB(g, (n) => n[0] > 0.99)
    const after = await exportCenter(page, body)
    const pivot1 = await s.tr(g)
    if (!near(pivot1[4], -90, 0.11)) fail(`UX-AUDIT-41: CSG ${pivot1.join(', ')}`)
    // ✅ UX-AUDIT-41 (fix-all-6): поворот CSG — вокруг центра рамки; опорная точка (операнд A) — вместе с телом
    if (!near(after[0], before[0], 0.11) || !near(after[1], before[1], 0.11)) fail(`UX-AUDIT-41: центр тела (экспорт STL) X/Y ${before[0]}, ${before[1]} → ${after[0]}, ${after[1]}; опорная точка X ${pivot0[0]} → ${pivot1[0]}`)
    ok.push(`UX-AUDIT-41: CSG (куб X 0 ∪ куб X 60) торцом +X к верху куба — повёрнута на месте: центр тела (экспорт STL) X/Y ${before[0]}, ${before[1]} → ${after[0]}, ${after[1]}; опорная точка (операнд A) X ${pivot0[0]} → ${pivot1[0]}, rotY ${pivot1[4]}`)
    if (s.errors.length) fail('32-followup: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ 37: встречно > 90°; 🐞 UX-AUDIT-42: поворот шага через ±180° — −330° ──
  {
    const s = await session()
    const { page } = s
    const res = []
    for (const [theta, accept] of [[5, (n) => n[1] < -0.99], [95, (n) => close(n, dirXY(5))], [90, (n) => close(n, dirXY(0))], [85, (n) => close(n, dirXY(-5))]]) {
      const k = await s.add('Куб'); await s.setF(k, 'num-input-pos-Y', 40); await s.setF(k, 'num-input-rot-Z', theta)
      await s.startAlign(); await page.locator('[data-testid=align-axis-Y]').click()
      await s.clickB(k, accept)
      res.push([theta, ...(await s.tr(k))]); await s.confirmClear()
    }
    // θ 5 — угол 175° (встречно: Y 10, rotZ 0); θ 95 / 90 / 85 — углы 85° / 90° / 95°
    const want = { 5: 10, 95: -10, 90: -10, 85: 10 }
    for (const r of res) if (!near(r[2], want[r[0]]) || !near(r[1], 0)) fail(`37: θ ${r[0]} → X ${r[1]}, Y ${r[2]} (ожидалось Y ${want[r[0]]})`)
    if (!near(res[0][6], 0, 0.11)) fail('37: 5° — rotZ ' + res[0][6])
    ok.push(`37: плоскость Y — грань под 5° к встречной: Y ${res[0][2]}, rotZ ${res[0][6]}; 85° / 90° — в ту же сторону (Y ${res[1][2]}, ${res[2][2]}), 95° — встречно (Y ${res[3][2]}); X — прежний`)

    // UX-AUDIT-42: куб rotZ 170, грань под −10° → бок куба rotZ 20 (20°): поворот +30° через 180°
    const r = await s.add('Куб'); await s.setF(r, 'num-input-rot-Z', 20)
    const k = await s.add('Куб'); await s.setF(k, 'num-input-pos-X', 60); await s.setF(k, 'num-input-rot-Z', 170)
    await s.startAlign(); await s.clickA(r, (n) => close(n, dirXY(20))); await s.clickB(k, (n) => close(n, dirXY(-10)))
    const tk = await s.tr(k)
    if (!near(tk[5], -160, 0.11)) fail('UX-AUDIT-42: rotZ ' + tk[5])
    await page.locator('.tl-item', { hasText: 'Повернуть' }).last().locator('.tl-edit').click()
    const sp = page.locator('[data-testid=step-panel]'); await sp.waitFor({ timeout: 5000 })
    const original = ((await sp.locator('[data-testid=step-original]').textContent()) ?? '').trim()
    await knownBug('UX-AUDIT-42', 'поворот шага выравнивания через ±180° — −330° вместо 30°', async () => {
      if (!original.endsWith('поворот (0, 0, 30)°')) throw new Error(`«Исходно» — «${original}» (куб rotZ 170 → ${tk[5]})`)
    })
    if (s.errors.length) fail('37: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ 38 / 40: панель шага и подпись правки поворота / масштаба ──
  {
    const s = await session()
    const { page } = s
    const c = await s.add('Куб'); await s.setF(c, 'num-input-rot-Z', 30)
    const sp = page.locator('[data-testid=step-panel]')
    await page.locator('.tl-item', { hasText: 'Повернуть' }).last().locator('.tl-edit').click(); await sp.waitFor({ timeout: 5000 })
    const title = ((await sp.locator('.props-section-title').first().textContent()) ?? '').trim()
    const original = ((await sp.locator('[data-testid=step-original]').textContent()) ?? '').trim()
    if (title !== 'Шаг 2: Повернуть' || original !== 'поворот (0, 0, 30)°') fail(`38: «${title}», «${original}»`)
    const rz = sp.locator('[data-testid=step-rotDelta] input.props-input').nth(2)
    let n0 = await s.steps(); await rz.fill('45'); await rz.press('Enter'); await s.waitSteps(n0 + 1)
    const edit = (await s.labels()).at(-1)
    if (edit !== 'Правка шага 2: поворот (0, 0, 30)° → (0, 0, 45)°') fail('40: ' + edit)
    await sp.getByRole('button', { name: /Назад/ }).click()
    await s.setF(c, 'num-input-scale-X', 2)
    await page.locator('.tl-item', { hasText: 'Масштаб' }).last().locator('.tl-edit').click(); await sp.waitFor({ timeout: 5000 })
    const title2 = ((await sp.locator('.props-section-title').first().textContent()) ?? '').trim()
    const orig2 = ((await sp.locator('[data-testid=step-original]').textContent()) ?? '').trim()
    if (!/^Шаг \d+: Масштаб$/.test(title2) || orig2 !== 'масштаб (1, 0, 0)') fail(`38: масштаб — «${title2}», «${orig2}»`)
    ok.push(`38/40: «${title}», «Исходно» — «${original}»; правка — «${edit}»; масштаб — «${title2}», «${orig2}»`)
    if (s.errors.length) fail('38/40: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ 36: имя текста на языке интерфейса ──
  {
    const s = await session()
    const { page } = s
    const name = async (id) => (await page.locator(`.ct-item[data-object-id="${id}"] .ct-name`).innerText()).trim()
    const dom = await s.addText('Дом')
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(300)
    const domEn = await name(dom)
    // текст «Hi» в английском интерфейсе
    const b = new Set(await s.ids())
    await page.getByText('Text', { exact: true }).first().click()
    const modal = page.locator('.text-modal-backdrop'); await modal.waitFor({ timeout: 5000 })
    await modal.locator('input.text-modal-input').fill('Hi'); await modal.locator('input.text-modal-num').first().fill('10')
    await modal.locator('button.btn.primary').click(); await s.waitRows(b.size + 1); await modal.waitFor({ state: 'detached' })
    const hi = (await s.ids()).find((i) => !b.has(i))
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(300)
    const [domRu, hiRu] = [await name(dom), await name(hi)]
    await page.locator(`.ct-item[data-object-id="${hi}"] .ct-name`).dblclick()
    const inp = page.locator('.ct-name-input'); await inp.fill('Логотип'); await inp.press('Enter'); await page.waitForTimeout(200)
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(300)
    const hiRenamedEn = await name(hi)
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(300)
    if (domEn !== 'Text: Дом' || domRu !== 'Текст: Дом' || hiRu !== 'Текст: Hi' || hiRenamedEn !== 'Логотип') fail('36: ' + JSON.stringify({ domEn, domRu, hiRu, hiRenamedEn }))
    ok.push(`36: «Дом» (ru) в en — «${domEn}»; «Hi» (en) в ru — «${hiRu}»; переименованный — «${hiRenamedEn}» в en`)
    if (s.errors.length) fail('36: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ 39: «Вписать в экран» — 1400 и 768×1024 (перспектива, ортография) ──
  {
    const res = []
    for (const [size, ortho] of [[{ width: 1400, height: 850 }, false], [{ width: 768, height: 1024 }, false], [{ width: 768, height: 1024 }, true]]) {
      const s = await session(size)
      const { page } = s
      await s.add('Куб'); const p = await s.add('Призма'); await s.setF(p, 'num-input-pos-X', 40)
      if (ortho) await toolbarButton(page, 'Перспектива ↔ Ортография').click()
      await s.startAlign()                                    // F (вписать) + режим выравнивания (подсветка под курсором)
      const vp = page.locator('.viewport-canvas'); const bb = await vp.boundingBox()
      let edge = 0, mid = 0
      for (const x of [bb.x + 3, bb.x + bb.width - 3]) for (let k = 1; k < 24; k++) {
        await page.mouse.move(x, bb.y + (bb.height * k) / 24); await page.waitForTimeout(60)
        if (await vp.getAttribute('data-align-hover')) edge++
      }
      for (let k = 1; k < 12; k++) { await page.mouse.move(bb.x + (bb.width * k) / 12, bb.y + bb.height / 2); await page.waitForTimeout(60); if (await vp.getAttribute('data-align-hover')) mid++ }
      res.push(`${size.width}${ortho ? ' орто' : ''}: у краёв ${edge}, по середине ${mid}`)
      if (edge || !mid) fail('39: ' + res.at(-1))
      if (s.errors.length) fail('39: ошибки консоли ' + s.errors.join(' | '))
      await s.browser.close()
    }
    ok.push('39: «Вписать в экран» — сцена целиком: ' + res.join('; '))
  }

  console.log('e2e ux-audit-6 OK')
  for (const x of ok) console.log('  ✅ ' + x)
  for (const x of known) console.log('  🐞 known: ' + x)
} catch (e) {
  console.error('e2e ux-audit-6 FAIL —', e.message); if (process.env.DEBUG) console.error(e.stack)
  for (const x of ok) console.error('  ✅ ' + x)
  for (const x of known) console.error('  🐞 known: ' + x)
  process.exitCode = 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit()
}
