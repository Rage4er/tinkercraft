// e2e/ux-audit-3.mjs — UX-прогон 3: H–N повторно (после fix-all-2) + O–T (новые сценарии).
//
//  H–N повторно — `pnpm e2e:ux-audit-2` (те же сценарии, фиксы 11–20 — обычные проверки) и
//  здесь то, чего там нет: J — объединение двух импортов → экспорт STL = сцене → .3dtc
//  сохранить/открыть; K — повёрнутый CSG и куб, режим «Выровнять» + «Множественное»
//  (грань CSG, затем грань куба); M/Q — 1366×768 (тулбар в одну строку, как раньше);
//  N — предупреждение (тост) в обеих темах читается; L — 52 фигуры, 104 шага: undo всё / redo
//  всё, быстрое переключение вкладок / темы / гизмо, FPS.
//  O. Текст: «Привет», «Дом», «Федя», «Hello» — буквы, без предупреждений; куб − «ДдФ» → CSG;
//     «漢字» и emoji — предупреждение называет символы.
//  P. Сфера ∪ / − / ∩ куб — CSG без ошибок (гладкость нормалей — __tests__/ux-audit-3.test.tsx).
//  R. Тост: над модалкой, исчезает через ~5 с, не поверх правой панели и тулбара.
//  S. Поле: «−1234.5» целиком на 1366, ↑ с клавиатуры меняет значение, Enter — шаг истории.
//  T. История: объединение / вычитание / пересечение — свои подписи и иконки; вставка — «Вставить
//     куб / CSG / импорт»; фильтр «CSG» прячет операции CSG.
//  Баги прогона 3 в браузере (были `knownBug`), исправлены в fix-all-3 — обычные проверки:
//     UX-AUDIT-21 (долгие задачи при импорте 100k), UX-AUDIT-23 (стрелки поля при наведении и
//     в фокусе), UX-AUDIT-24 (плашка линейки — во вьюпорте, не на тулбаре и «Привязке»),
//     UX-AUDIT-30 (на 768 тост — под «Привязкой» и плашкой линейки). `knownBug` сейчас нет.
// Ошибок консоли нет (все сценарии). Логика — __tests__/ux-audit-3.test.tsx (`it.fails`).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-audit-3` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/ux-audit-3.mjs /tmp/ux3`.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, panelButton, toolbarButton, findAlignFace, spaceShapeClick } from './helpers.mjs'

const shotDir = process.argv[2]
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-3-'))
const FIXTURE_CUBE = new URL('./fixtures/closed-cube.stl', import.meta.url).pathname
const ok = []
const known = []
const fail = (msg) => { throw new Error(msg) }
/** Известный баг (UX-AUDIT-21…31): `expectation` бросает — баг на месте; выполнилась — перенести в ✅. */
async function knownBug(id, title, expectation) {
  let reproduced = false
  try { await expectation() } catch (e) { reproduced = true; known.push(`${id} ${title} — ${e.message}`) }
  if (!reproduced) fail(`${id} (${title}): ожидание выполнилось — баг исправлен? Перенести проверку в ✅ и обновить DEVELOPMENT_PLAN`)
}
/** Пересекаются ли прямоугольники (DOMRect-подобные). */
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
/** Относительная яркость и контраст (WCAG) для rgb(a)-строк. */
const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number)
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

/** Сессия браузера с общими хелперами (как в ux-audit-2). */
async function session(size) {
  const s = await openApp(size)
  const { page } = s
  const rows = page.locator('.ct-item[data-object-id]')
  const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
  const waitRows = (n, t = 20000) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: t })
  const steps = () => page.locator('.tl-item').count()
  const waitSteps = (n, t = 15000) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: t })
  const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
  const status = async () => (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ')
  const tris = async () => (await status()).match(/Треуг\.: ([\d\s]+)/)[1].replace(/\s/g, '')
  const blur = () => page.evaluate(() => document.activeElement?.blur())
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
    if (Number(await el.inputValue()) === v) return            // значение то же — шага не будет
    await el.fill(String(v)); await el.press('Enter')
    await waitSteps(n + 1)
  }
  const pair = async (a, b) => { await pick(a); await page.locator(`.ct-item[data-object-id="${b}"]`).click({ modifiers: ['Shift'] }); await blur() }
  /** CSG клавишей (U / X / I) → id результата. */
  const csg = async (a, b, key) => {
    const be = new Set(await ids())
    await pair(a, b); await page.keyboard.press(key)
    await waitRows(be.size - 1)
    return (await ids()).find((i) => !be.has(i))
  }
  const importStl = async (file) => {
    const b = new Set(await ids())
    const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Импорт').click(); (await fc).setFiles(file)
    await waitRows(b.size + 1, 30000)
    return (await ids()).find((i) => !b.has(i))
  }
  const copyPaste = async (id) => {
    const b = new Set(await ids())
    await pick(id); await blur()
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v')
    await waitRows(b.size + 1)
    return (await ids()).find((i) => !b.has(i))
  }
  const confirmClear = async () => {
    if ((await rows.count()) === 0 && (await steps()) === 0) return
    await toolbarButton(page, 'Очистить сцену').click()
    await page.locator('[data-testid=confirm-modal]').getByRole('button', { name: 'Очистить', exact: true }).click()
    await waitRows(0)
  }
  /** 3D-текст через модалку → id объекта (модалка закрылась). */
  const addText = async (text) => {
    const b = new Set(await ids())
    await page.getByText('Текст', { exact: true }).first().click()
    const modal = page.locator('.text-modal-backdrop'); await modal.waitFor({ timeout: 5000 })
    await modal.locator('input.text-modal-input').fill(text)
    await modal.locator('input.text-modal-num').first().fill('10')     // размер (R ставит 0 — модалка помнит)
    await modal.locator('button.btn.primary').click()
    await waitRows(b.size + 1)
    await modal.waitFor({ state: 'detached', timeout: 5000 })
    return (await ids()).find((i) => !b.has(i))
  }
  const dismissToasts = async () => { for (const t of await page.locator('.toast').all()) await t.click().catch(() => {}) ; await page.waitForTimeout(100) }
  const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }
  const rect = (q) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } }, q)
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  return { ...s, rows, ids, waitRows, steps, waitSteps, toasts, status, tris, blur, add, pick, setF, pair, csg, importStl, copyPaste, confirmClear, addText, dismissToasts, shot, rect }
}

try {
  // ── O: текст; P: сфера ∪/−/∩ куб; T: история ──
  {
    const s = await session()
    const { page } = s
    // O. кириллица / латиница — без предупреждений, «Текст: …» в дереве
    for (const text of ['Привет', 'Дом', 'Федя', 'Hello']) {
      const id = await s.addText(text)
      const name = await page.locator(`.ct-item[data-object-id="${id}"] .ct-name`).innerText()
      if (name !== `Текст: ${text}`) fail(`O: имя текста «${name}»`)
      if (await s.toasts()) fail(`O: «${text}» — уведомления: ${await s.toasts()}`)
    }
    await s.blur(); await page.keyboard.press('KeyF'); await page.waitForTimeout(600); await s.shot('o-text.png')
    // O. куб − «ДдФ» → CSG без уведомлений
    await s.confirmClear()
    const cube = await s.add('Куб'); await s.setF(cube, 'num-input-pos-X', 0)
    const txt = await s.addText('ДдФ')
    await s.setF(txt, 'num-input-pos-X', -12); await s.setF(txt, 'num-input-pos-Z', 8)
    const g = await s.csg(cube, txt, 'KeyX')
    if ((await s.rows.count()) !== 1 || !g.startsWith('csg')) fail('O: куб − «ДдФ» — нет CSG')
    if (await s.toasts()) fail('O: куб − «ДдФ» — уведомления: ' + (await s.toasts()))
    // O. иероглифы, emoji — предупреждение называет символы
    for (const [text, chars] of [['漢字', '漢字'], ['Hi 😀', '😀']]) {
      await s.dismissToasts()
      await s.addText(text)
      await page.locator('.toast').first().waitFor({ timeout: 5000 })
      const msg = await s.toasts()
      if (!msg.includes('нет символов') || !msg.includes(chars)) fail(`O: «${text}» — предупреждение «${msg}»`)
    }
    ok.push('O: «Привет», «Дом», «Федя», «Hello» — «Текст: …», без предупреждений; куб − «ДдФ» → CSG; «漢字», «😀» — предупреждение с символами')

    // P + T. сфера ∪ / − / ∩ куб → CSG; подписи и иконки истории
    await s.dismissToasts()
    await s.confirmClear()
    const made = []
    for (const [key, x] of [['KeyU', 0], ['KeyX', 40], ['KeyI', 80]]) {
      const sp = await s.add('Сфера'); await s.setF(sp, 'num-input-pos-X', x)
      const cb = await s.add('Куб'); await s.setF(cb, 'num-input-pos-X', x + 12)
      made.push(await s.csg(sp, cb, key))
    }
    if (await s.toasts()) fail('P: уведомления ' + (await s.toasts()))
    const items = page.locator('.tl-item')
    const csgSteps = []
    for (let i = 0; i < (await items.count()); i++) {
      const label = (await items.nth(i).locator('.tl-label').innerText()).trim()
      if (['Объединение', 'Вычитание', 'Пересечение'].includes(label)) csgSteps.push({ label, icon: await items.nth(i).locator('.tl-icon').innerHTML() })
    }
    if (csgSteps.map((x) => x.label).join() !== 'Объединение,Вычитание,Пересечение') fail('T: шаги CSG — ' + csgSteps.map((x) => x.label).join(', '))
    if (new Set(csgSteps.map((x) => x.icon)).size !== 3) fail('T: иконки объединения / вычитания / пересечения совпадают')
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyF'); await page.waitForTimeout(600); await s.shot('p-csg-spheres.png')
    ok.push('P: сфера ∪ / − / ∩ куб → CSG без ошибок; T: в истории «Объединение», «Вычитание», «Пересечение» — три разные иконки')

    // T. вставка: куб, CSG, импорт — «Вставить …»; фильтр «CSG»
    const cubeP = await s.add('Куб')
    await s.copyPaste(cubeP)
    await s.copyPaste(made[0])
    const imp = await s.importStl(FIXTURE_CUBE)
    await s.copyPaste(imp)
    const pasted = (await items.allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')).filter((x) => x.startsWith('Вставить'))
    if (pasted.length !== 3 || !pasted[0].includes('Вставить куб') || !pasted[1].includes('Вставить CSG') || !pasted[2].includes('Вставить импорт')) fail('T: вставка в истории — ' + pasted.join(' / '))
    await page.locator('.tl-filter-toggle').click()
    const csgFilter = page.locator('.tl-filter-row', { hasText: /^CSG$/ }).locator('input')
    await csgFilter.uncheck()
    const shown = (await page.locator('.tl-label').allInnerTexts()).map((x) => x.trim())
    if (shown.some((x) => ['Объединение', 'Вычитание', 'Пересечение'].includes(x))) fail('T: фильтр «CSG» не прячет операции CSG')
    if (!shown.some((x) => x.startsWith('Добавить'))) fail('T: фильтр «CSG» спрятал и «Добавить …»')
    await csgFilter.check(); await page.locator('.tl-filter-toggle').click()
    ok.push('T: вставка — «Вставить куб», «Вставить CSG», «Вставить импорт» (UX-AUDIT-13); фильтр «CSG» прячет объединение/вычитание/пересечение')
    if (s.errors.length) fail('O/P/T: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── J: два импорта ∪ → STL = сцене → .3dtc; K: повёрнутый CSG, «Выровнять» + «Множественное» ──
  {
    const s = await session()
    const { page } = s
    const a = await s.importStl(FIXTURE_CUBE)
    const b = await s.importStl(FIXTURE_CUBE)
    await s.setF(a, 'num-input-pos-X', 0); await s.setF(b, 'num-input-pos-X', 5); await s.setF(b, 'num-input-pos-Z', 3)
    const u = await s.csg(a, b, 'KeyU')
    if (!u?.startsWith('csg') || (await s.toasts())) fail('J: импорт ∪ импорт — ' + ((await s.toasts()) || 'нет CSG'))
    const inScene = await s.tris()
    const dl = page.waitForEvent('download'); await toolbarButton(page, 'Экспорт').click()
    const stl = path.join(tmp, 'u.stl'); await (await dl).saveAs(stl)
    const n = fs.readFileSync(stl).readUInt32LE(80)
    if (String(n) !== inScene) fail(`J: в STL ${n} треугольников, в сцене ${inScene}`)
    const hist = await page.locator('.tl-item').allInnerTexts()
    const dl2 = page.waitForEvent('download'); await toolbarButton(page, 'Сохранить').click()
    const proj = path.join(tmp, 'u.3dtc'); await (await dl2).saveAs(proj)
    await s.confirmClear()
    const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Открыть').click(); (await fc).setFiles(proj)
    await s.waitRows(1)
    if ((await s.tris()) !== inScene) fail(`J: после открытия .3dtc ${await s.tris()} треугольников, было ${inScene}`)
    if (JSON.stringify(await page.locator('.tl-item').allInnerTexts()) !== JSON.stringify(hist)) fail('J: история после открытия .3dtc другая')
    ok.push(`J: импорт ∪ импорт → STL ${n} треугольников = сцене; .3dtc сохранить → очистить → открыть — то же`)

    // K. CSG (куб ∪ сфера) повёрнут rotZ 30 + куб C; «Выровнять» → «Множественное» → Z (XY) →
    //    верх CSG, затем верх C → оба верха в z = 0 (центры −10)
    await s.confirmClear()
    const ca = await s.add('Куб'); await s.setF(ca, 'num-input-pos-X', 0)
    const cs = await s.add('Сфера'); await s.setF(cs, 'num-input-pos-X', 12)
    const G = await s.csg(ca, cs, 'KeyU')
    await s.setF(G, 'num-input-rot-Z', 30); await s.setF(G, 'num-input-pos-Z', 4)
    const C = await s.add('Куб'); await s.setF(C, 'num-input-pos-X', 45); await s.setF(C, 'num-input-pos-Z', 17)
    await s.blur(); await page.keyboard.press('KeyF'); await page.waitForTimeout(800)
    const panel = page.locator('[data-testid=align-panel]')
    await toolbarButton(page, 'Выровнять').click(); await panel.waitFor({ timeout: 5000 })
    await page.locator('[data-testid=align-multiple]').check()
    await page.getByRole('radio', { name: 'Z (XY)' }).click()
    const near = (v, nn) => Math.abs(v[0] - nn[0]) < 0.05 && Math.abs(v[1] - nn[1]) < 0.05 && Math.abs(v[2] - nn[2]) < 0.05
    const topG = await findAlignFace(page, G, (v) => near(v, [0, 0, 1]))
    const topC = await findAlignFace(page, C, (v) => near(v, [0, 0, 1]))
    let k = await s.steps(); await page.mouse.click(topG.x, topG.y); await s.waitSteps(k + 1)
    if (!(await panel.isVisible())) fail('K: «Множественное» — режим закрылся после грани CSG')
    k = await s.steps(); await page.mouse.click(topC.x, topC.y); await s.waitSteps(k + 1)
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached', timeout: 5000 })
    const zOf = async (id) => { await s.pick(id); return Number(await page.locator('.panel-right #num-input-pos-Z').inputValue()) }
    const [zG, zC] = [await zOf(G), await zOf(C)]
    if (Math.abs(zG + 10) > 0.05 || Math.abs(zC + 10) > 0.05) fail(`K: после выравнивания Z: CSG ${zG}, куб ${zC} (ожидалось −10 и −10)`)
    if (await s.toasts()) fail('K: уведомления ' + (await s.toasts()))
    ok.push('K: повёрнутый CSG (rotZ 30) и куб — «Выровнять» + «Множественное», Z (XY): грань CSG, затем грань куба → верхи в z = 0')
    if (s.errors.length) fail('J/K: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ UX-AUDIT-21: импорт 100k в сцене — правка другого объекта без долгих задач ──
  {
    const s = await session()
    const { page } = s
    const R = 30, rings = 225, segs = 224
    const P = (i, j) => { const th = Math.PI * i / rings, ph = 2 * Math.PI * j / segs; return [R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th)] }
    const tris = []
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); if (i !== 0) tris.push([a, b, d]); if (i !== rings - 1) tris.push([b, c, d]) }
    const buf = Buffer.alloc(84 + tris.length * 50); buf.writeUInt32LE(tris.length, 80)
    tris.forEach((tt, q) => tt.flat().forEach((v, m) => buf.writeFloatLE(v, 84 + q * 50 + 12 + m * 4)))
    const big = path.join(tmp, 'big.stl'); fs.writeFileSync(big, buf)
    await s.importStl(big)
    const cube = await s.add('Куб')
    await s.pick(cube); await page.waitForTimeout(800)
    await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask' }) })
    for (let k = 0; k < 4; k++) await s.setF(cube, 'num-input-pos-Y', 40 + k * 5)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const long = await page.evaluate(() => window.__lt.filter((d) => d >= 120))
    // было: каждая правка — долгая задача 155–194 мс (пересборка нормалей и рёбер импорта); GC — допускаем одну
    if (long.length > 1) fail(`UX-AUDIT-21: правки куба при импорте 100k — долгие задачи ${long.join(', ')} мс`)
    if (s.errors.length) fail('UX-AUDIT-21: ошибки консоли ' + s.errors.join(' | '))
    ok.push(`UX-AUDIT-21: импорт ${tris.length} в сцене — 4 правки куба без долгих задач ≥ 120 мс (${long.length ? long.join(', ') + ' мс' : 'нет'})`)
    await s.browser.close()
  }

  // ── L: стресс — 52 фигуры, 104 шага, undo всё / redo всё, переключения; консоль чистая ──
  {
    const s = await session()
    const { page } = s
    const LABELS = ['Куб', 'Сфера', 'Цилиндр', 'Конус', 'Тор', 'Призма', 'Пирамида']
    const t0 = Date.now()
    for (let i = 0; i < 52; i++) {
      await spaceShapeClick(page, LABELS[i % 7])
      await page.getByText(LABELS[i % 7], { exact: true }).first().click(); await s.waitRows(i + 1)
    }
    const all = await s.ids()
    for (let i = 0; i < all.length; i++) {
      await s.pick(all[i])
      const f = page.locator('.panel-right #num-input-pos-Y')
      await f.fill(String(20 + (i % 7) * 30)); await f.press('Enter'); await page.waitForTimeout(30)
    }
    await page.waitForFunction(() => /История: (\d+)\/\1/.test(document.querySelector('.statusbar')?.textContent ?? ''), null, { timeout: 20000 })
    const total = await s.steps()
    if (total < 100 || (await s.rows.count()) < 50) fail(`L: объектов ${await s.rows.count()}, шагов ${total}`)
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyF'); await page.waitForTimeout(1500)
    const fps = Number((await s.status()).match(/FPS: (\d+)/)[1])
    const undo = toolbarButton(page, 'Отменить'), redo = toolbarButton(page, 'Повторить')
    for (let k = 0; k < total; k++) await undo.click({ timeout: 20000 })
    await s.waitRows(0, 30000)
    for (let k = 0; k < total; k++) await redo.click({ timeout: 20000 })
    await page.waitForFunction((k) => new RegExp(`История: ${k}/${k}`).test(document.querySelector('.statusbar')?.textContent ?? ''), total, { timeout: 30000 })
    if ((await s.rows.count()) !== 52) fail('L: после redo объектов ' + (await s.rows.count()))
    for (let i = 0; i < 8; i++) {
      await page.locator('button.tab-btn', { hasText: 'Список' }).click(); await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
      await toolbarButton(page, 'Сменить тему').click(); await s.blur()
      for (const key of ['KeyG', 'KeyR', 'KeyS', 'Escape', 'KeyL', 'KeyL', 'Tab', 'Tab', 'Control+a', 'Escape']) await page.keyboard.press(key)
    }
    await page.waitForTimeout(400)
    if ((await s.rows.count()) !== 52) fail('L: после переключений объектов ' + (await s.rows.count()))
    if (fps < 30) fail('L: FPS ' + fps)
    if (s.errors.length) fail('L: ошибки консоли ' + s.errors.join(' | '))
    ok.push(`L: 52 фигуры, ${total} шагов — ${Math.round((Date.now() - t0) / 1000)} с с undo/redo всего; FPS ${fps}; переключения ×8; консоль чистая`)
    await s.browser.close()
  }

  // ── Q/M: 1366 — как раньше; R: тосты; S: поле; N: предупреждение в обеих темах ──
  {
    const s = await session({ width: 1366, height: 768 })
    const { page } = s
    const a = await s.add('Куб'); const b = await s.add('Сфера')
    const m = await page.evaluate(() => {
      const tb = document.querySelector('[role=toolbar]').getBoundingClientRect()
      return {
        tbH: Math.round(tb.height),
        rows: new Set([...document.querySelectorAll('[role=toolbar] button')].map((x) => Math.round(x.getBoundingClientRect().top))).size,
        cut: [...document.querySelectorAll('[role=toolbar] button')].filter((x) => { const q = x.getBoundingClientRect(); return q.width === 0 || q.right > window.innerWidth + 0.5 }).length,
        docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        statusH: Math.round(document.querySelector('.statusbar').getBoundingClientRect().height),
        cols: getComputedStyle(document.querySelector('.shape-grid')).gridTemplateColumns.split(' ').length,
        logo: getComputedStyle(document.querySelector('.toolbar-logo-text')).display !== 'none',
      }
    })
    if (m.tbH > 52 || m.rows !== 1 || m.cut || m.docScroll > 0 || m.statusH > 30 || m.cols !== 3 || !m.logo) fail('Q 1366: ' + JSON.stringify(m))
    ok.push(`Q: 1366×768 — тулбар в одну строку (${m.tbH} px), с названием, все кнопки в окне, статус-бар 1 строка, палитра 3 столбца`)

    // R. тост: не поверх панели/тулбара; над модалкой; исчезает через ~5 с
    await s.pair(a, b); await panelButton(page, 'Пересечение').click()
    await page.locator('.toast').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(400)
    const [toast, right, tb] = [await s.rect('.toast'), await s.rect('.panel-right'), await s.rect('[role=toolbar]')]
    if (overlap(toast, right) || overlap(toast, tb)) fail('R: тост перекрывает правую панель или тулбар')
    await s.dismissToasts()
    await page.getByText('Текст', { exact: true }).first().click(); await page.locator('.text-modal-box').waitFor()
    await page.locator('.text-modal-num').first().fill('0'); await page.locator('.text-modal-backdrop button.btn.primary').click()
    await page.locator('.toast').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(400)
    const t0 = Date.now() - 400
    const onTop = await page.evaluate(() => { const r = document.querySelector('.toast').getBoundingClientRect(); return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.toast') })
    if (!onTop) fail('R: тост под модалкой')
    await page.locator('.toast').first().waitFor({ state: 'detached', timeout: 8000 })
    const life = Date.now() - t0
    if (life < 4500 || life > 6500) fail(`R: тост живёт ${life} мс (ожидалось ~5 с)`)
    await page.locator('.text-modal-backdrop').getByRole('button', { name: 'Отмена', exact: true }).click()
    ok.push(`R: тост в углу вьюпорта (не поверх панели и тулбара), над модалкой, исчез через ${life} мс`)

    // S. «−1234.5» целиком; ↑ с клавиатуры +1, Enter — шаг истории
    await s.pick(a)
    const f = page.locator('.panel-right #num-input-pos-X')
    await f.fill('-1234.5'); await f.press('Enter')
    await page.waitForFunction(() => document.querySelector('.panel-right #num-input-pos-X')?.value === '-1234.5', null, { timeout: 5000 })
    await s.blur(); await page.mouse.move(5, 400)
    const w = await f.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }))
    if (w.sw > w.cw) fail(`S: «−1234.5» обрезано (${w.sw} > ${w.cw})`)
    const n0 = await s.steps()
    await f.focus(); await page.keyboard.press('ArrowUp')
    if (Number(await f.inputValue()) !== -1233.5) fail('S: ↑ не изменила значение — ' + (await f.inputValue()))
    await page.keyboard.press('Enter'); await s.waitSteps(n0 + 1)
    await s.blur()
    ok.push(`S: «−1234.5» видно целиком (${w.sw} ≤ ${w.cw} px); ↑ с клавиатуры → −1233.5, Enter → шаг истории`)

    // ✅ UX-AUDIT-23: стрелки поля появляются при наведении и в фокусе (в покое — нет: «−1234.5» целиком)
    {
      const box = await f.boundingBox()
      const clip = { x: box.x + box.width - 16, y: box.y + 2, width: 14, height: box.height - 4 }
      await s.blur(); await page.mouse.move(5, 400); await page.waitForTimeout(200)
      const rest = await page.screenshot({ clip })
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(400)
      const hover = await page.screenshot({ clip })
      await page.mouse.move(5, 400); await f.focus(); await page.waitForTimeout(300)
      const focus = await page.screenshot({ clip, path: shotDir ? path.join(shotDir, 'field-focus.png') : undefined })
      await s.blur(); await page.waitForTimeout(200)
      const rest2 = await page.screenshot({ clip })
      if (Buffer.compare(rest, hover) === 0) fail('UX-AUDIT-23: при наведении стрелок нет')
      if (Buffer.compare(rest, focus) === 0) fail('UX-AUDIT-23: в фокусе стрелок нет')
      if (Buffer.compare(rest, rest2) !== 0) fail('UX-AUDIT-23: после ухода фокуса стрелки остались')
      ok.push('S: стрелки поля — при наведении и в фокусе, в покое скрыты (UX-AUDIT-23)')
    }

    // N. предупреждение (тост «нет символов») читается в тёмной и светлой темах
    for (const theme of ['тёмная', 'светлая']) {
      await s.dismissToasts()
      await s.addText('漢')
      await page.locator('.toast').first().waitFor({ timeout: 5000 })
      const c = await page.evaluate(() => { const t = document.querySelector('.toast'), m = document.querySelector('.toast-msg'); return [getComputedStyle(m).color, getComputedStyle(t).backgroundColor] })
      if (contrast(c[0], c[1]) < 3) fail(`N (${theme}): контраст предупреждения ${contrast(c[0], c[1]).toFixed(2)}`)
      if (theme === 'тёмная') { await toolbarButton(page, 'Сменить тему').click(); await page.waitForTimeout(300) }
    }
    ok.push('N: предупреждение (тост) читается в тёмной и светлой темах (контраст ≥ 3)')
    if (s.errors.length) fail('Q/R/S/N: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── ✅ UX-AUDIT-24: плашка «Расстояние» — во вьюпорте, не на тулбаре (1400, 1024) и не на «Привязке» (768) ──
  for (const [width, height] of [[1400, 850], [1024, 768], [768, 1024]]) {
    const s = await session({ width, height })
    const { page } = s
    await s.add('Куб')
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyL')
    const vp = await s.rect('.main > .viewport')
    await page.mouse.click(vp.left + (vp.right - vp.left) * 0.3, vp.top + (vp.bottom - vp.top) * 0.7)
    await page.mouse.click(vp.left + (vp.right - vp.left) * 0.7, vp.top + (vp.bottom - vp.top) * 0.75)
    await page.locator('.ruler-display').waitFor({ timeout: 5000 })
    await s.shot(`ruler-${width}.png`)
    const [r, tb, snap, left] = [await s.rect('.ruler-display'), await s.rect('[role=toolbar]'), await s.rect('.snap-selector'), await s.rect('.panel-left')]
    const bad = [...(overlap(r, tb) ? ['тулбар'] : []), ...(overlap(r, snap) ? ['«Привязку»'] : []), ...(overlap(r, left) ? ['левую панель'] : [])]
    if (bad.length) fail(`UX-AUDIT-24 ${width}: плашка «Расстояние» перекрывает ${bad.join(', ')}`)
    if (r.left < vp.left || r.right > vp.right || r.top < vp.top) fail(`UX-AUDIT-24 ${width}: плашка за пределами вьюпорта`)
    if (!/Расстояние: \d/.test(await page.locator('.ruler-display').innerText())) fail(`UX-AUDIT-24 ${width}: текст плашки`)
    if (s.errors.length) fail('UX-AUDIT-24: ошибки консоли ' + s.errors.join(' | '))
    ok.push(`Q: ${width}×${height} — плашка «Расстояние» во вьюпорте, не на тулбаре${width <= 940 ? ' и не на «Привязке»' : ''} (UX-AUDIT-24)`)
    await s.browser.close()
  }
  // ── ✅ UX-AUDIT-30: на 768 тост не закрывает «Привязку» и плашку линейки; не на панели и тулбаре (19) ──
  {
    const s = await session({ width: 768, height: 1024 })
    const { page } = s
    const a = await s.add('Куб'); const b = await s.add('Сфера')
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyL')
    const vp = await s.rect('.main > .viewport')
    await page.mouse.click(vp.left + (vp.right - vp.left) * 0.3, vp.top + (vp.bottom - vp.top) * 0.8)
    await page.mouse.click(vp.left + (vp.right - vp.left) * 0.7, vp.top + (vp.bottom - vp.top) * 0.85)
    await page.locator('.ruler-display').waitFor({ timeout: 5000 })
    await s.pair(a, b); await panelButton(page, 'Пересечение').click()     // линейка включена — плашка видна
    await page.locator('.toast').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(400)
    await s.shot('toast-768.png')
    const [t, snap, ruler, right, tb] = [await s.rect('.toast'), await s.rect('.snap-selector'), await s.rect('.ruler-display'), await s.rect('.panel-right'), await s.rect('[role=toolbar]')]
    if (!ruler) fail('UX-AUDIT-30 (768): плашки линейки нет')
    const bad = [...(overlap(t, snap) ? ['«Привязку»'] : []), ...(overlap(t, ruler) ? ['плашку линейки'] : []), ...(overlap(t, right) ? ['правую панель'] : []), ...(overlap(t, tb) ? ['тулбар'] : [])]
    if (bad.length) fail('UX-AUDIT-30 (768): тост перекрывает ' + bad.join(', '))
    if (t.left < vp.left || t.right > vp.right) fail('UX-AUDIT-30 (768): тост за пределами вьюпорта')
    // «Привязка» кликабельна, пока виден тост
    await page.locator('.snap-btn', { hasText: /^5$/ }).click({ timeout: 2000 })
    if (!(await page.locator('.snap-btn.active', { hasText: /^5$/ }).count())) fail('UX-AUDIT-30 (768): «Привязка» не переключилась при тосте')
    if (s.errors.length) fail('UX-AUDIT-30: ошибки консоли ' + s.errors.join(' | '))
    ok.push('R: 768 — тост под «Привязкой» и плашкой линейки, не на панели и тулбаре; «Привязка» переключается при тосте (UX-AUDIT-30)')
    await s.browser.close()
  }

  console.log('e2e ux-audit-3 OK')
  for (const x of ok) console.log('  ✅ ' + x)
  for (const x of known) console.log('  🐞 known: ' + x)
} catch (e) {
  console.error('e2e ux-audit-3 FAIL —', e.message); if (process.env.DEBUG) console.error(e.stack)
  for (const x of ok) console.error('  ✅ ' + x)
  for (const x of known) console.error('  🐞 known: ' + x)
  process.exitCode = 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit()
}
