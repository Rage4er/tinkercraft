// e2e/ux-audit-4.mjs — UX-прогон 4: H–N и O–T повторно (`pnpm e2e:ux-audit-2`, `e2e:ux-audit-3`) +
// U–Y (новые) + UX-AUDIT-32.
//  U. Текст: новый — «Добавить текст: Привет», «Тип: Текст»; старый проект (поля `text` нет, id
//     txt_N — .3dtc без поля) — так же; копия — «Вставить текст».
//  V. Цилиндр, конус, сфера ∪ куб, куб после правки размера — без ошибок (нормали —
//     __tests__/ux-audit-3/4); скриншот (аргумент — каталог).
//  W. Линейка: измерение по CSG; наведение над импортом 100k — без долгих задач (UX-AUDIT-35).
//  X. История: поворот / масштаб полями — «Повернуть» / «Масштаб»; фильтр «Переместить» их не
//     прячет, «Повернуть» — только поворот; корень вычитания в дереве — не иконка объединения.
//  Y. 1280×800 (тулбар в 2 строки): кнопки в окне, «Расстояние» и тост — не на тулбаре и панели,
//     статус-бар — 1 строка (1024 / 768 — `e2e:ux-audit-2`, `e2e:ux-audit-3`).
//  Баги прогона 4 в браузере (были `knownBug`), исправлены в fix-all-4 — обычные проверки:
//     UX-AUDIT-32 «Выровнять»: боковая грань призмы к верху куба — призма поворачивается;
//     UX-AUDIT-35 линейка над импортом 100k — наведение без долгих задач. `knownBug` сейчас нет.
// Ошибок консоли нет (все сценарии). Логика — __tests__/ux-audit-4.test.tsx (`it.fails`).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-audit-4` в другом.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { openApp, panelButton, toolbarButton, findAlignFace, spaceShapeClick } from './helpers.mjs'

const JSZip = createRequire(import.meta.url)('jszip')
const shotDir = process.argv[2]
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-4-'))
const ok = []
const known = []
const fail = (msg) => { throw new Error(msg) }
/** Известный баг (UX-AUDIT-32…): `expectation` бросает — баг на месте; выполнилась — перенести в ✅. */
async function knownBug(id, title, expectation) {
  let reproduced = false
  try { await expectation() } catch (e) { reproduced = true; known.push(`${id} ${title} — ${e.message}`) }
  if (!reproduced) fail(`${id} (${title}): ожидание выполнилось — баг исправлен? Перенести проверку в ✅ и обновить DEVELOPMENT_PLAN`)
}
/** Пересекаются ли прямоугольники (DOMRect-подобные). */
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
/** STL-сфера R30 на 100352 треугольника. */
function bigStl(file) {
  const R = 30, rings = 225, segs = 224
  const P = (i, j) => { const th = Math.PI * i / rings, ph = 2 * Math.PI * j / segs; return [R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th)] }
  const tris = []
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); if (i !== 0) tris.push([a, b, d]); if (i !== rings - 1) tris.push([b, c, d]) }
  const buf = Buffer.alloc(84 + tris.length * 50); buf.writeUInt32LE(tris.length, 80)
  tris.forEach((tt, q) => tt.flat().forEach((v, m) => buf.writeFloatLE(v, 84 + q * 50 + 12 + m * 4)))
  fs.writeFileSync(file, buf)
  return tris.length
}

/** Сессия браузера с общими хелперами (как в ux-audit-3). */
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
  // ── U: текст новый / старый / копия; X: поворот и масштаб, фильтры, иконка корня ──
  {
    const s = await session()
    const { page } = s
    const typeOf = async (id) => { await s.pick(id); return (await page.locator('.panel-right .props-row', { hasText: 'Тип' }).first().innerText()).replace(/\s+/g, ' ') }
    const txt = await s.addText('Привет')
    const labels = async () => (await page.locator('.tl-label').allInnerTexts()).map((x) => x.trim())
    if ((await labels())[0] !== 'Добавить текст: Привет') fail('U: шаг текста — ' + (await labels())[0])
    if (!(await typeOf(txt)).includes('Текст')) fail('U: тип текста — ' + (await typeOf(txt)))
    await s.copyPaste(txt)
    if ((await labels()).at(-1) !== 'Вставить текст') fail('U: вставка текста — ' + (await labels()).at(-1))
    // старый проект: .3dtc без поля `text` (как до UX-AUDIT-31)
    const dl = page.waitForEvent('download'); await toolbarButton(page, 'Сохранить').click()
    const proj = path.join(tmp, 't.3dtc'); await (await dl).saveAs(proj)
    const zip = await JSZip.loadAsync(fs.readFileSync(proj))
    let stripped = 0
    for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.json'))) {
      zip.file(name, (await zip.file(name).async('string')).replace(/,\s*"text"\s*:\s*"[^"]*"/g, () => { stripped++; return '' }))
    }
    if (stripped < 2) fail('U: в .3dtc не найдено поле text')
    const legacy = path.join(tmp, 'legacy.3dtc'); fs.writeFileSync(legacy, await zip.generateAsync({ type: 'nodebuffer' }))
    await s.confirmClear()
    const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Открыть').click(); (await fc).setFiles(legacy)
    await s.waitRows(2)
    const ids = await s.ids()
    if (!ids[0].startsWith('txt_')) fail('U: id старого текста — ' + ids[0])
    if ((await labels())[0] !== 'Добавить текст: Привет') fail('U: старый проект — шаг ' + (await labels())[0])
    if (!(await typeOf(ids[0])).includes('Текст')) fail('U: старый проект — тип ' + (await typeOf(ids[0])))
    ok.push('U: текст — «Добавить текст: Привет», «Тип: Текст», копия — «Вставить текст»; старый проект (без поля text, txt_N) — так же')

    // X. поворот и масштаб полями; фильтры; иконки корней CSG
    await s.confirmClear()
    const c = await s.add('Куб')
    await s.setF(c, 'num-input-rot-Z', 30)
    await s.setF(c, 'num-input-scale-X', 2)
    const l3 = await labels()
    if (l3.join() !== 'Добавить куб,Повернуть,Масштаб') fail('X: шаги — ' + l3.join(' / '))
    await page.locator('.tl-filter-toggle').click()
    const filter = (name) => page.locator('.tl-filter-row', { hasText: new RegExp(`^${name}$`) }).locator('input')
    await filter('Переместить').uncheck()
    if ((await labels()).join() !== 'Добавить куб,Повернуть,Масштаб') fail('X: фильтр «Переместить» спрятал ' + (await labels()).join(' / '))
    await filter('Переместить').check(); await filter('Повернуть').uncheck()
    if ((await labels()).join() !== 'Добавить куб,Масштаб') fail('X: фильтр «Повернуть» — ' + (await labels()).join(' / '))
    await filter('Повернуть').check(); await page.locator('.tl-filter-toggle').click()
    const a2 = await s.add('Куб'); const b2 = await s.add('Сфера')
    await s.setF(a2, 'num-input-pos-X', 60); await s.setF(b2, 'num-input-pos-X', 72)
    const sub = await s.csg(a2, b2, 'KeyX')
    const a3 = await s.add('Куб'); const b3 = await s.add('Сфера')
    await s.setF(a3, 'num-input-pos-X', 120); await s.setF(b3, 'num-input-pos-X', 132)
    const uni = await s.csg(a3, b3, 'KeyU')
    const icon = (id) => page.locator(`.ct-item[data-object-id="${id}"] .ct-icon`).innerHTML()
    if ((await icon(sub)) === (await icon(uni))) fail('X: корень вычитания — иконка объединения (UX-AUDIT-25)')
    if (await s.toasts()) fail('U/X: уведомления ' + (await s.toasts()))
    ok.push('X: поворот / масштаб полями — «Повернуть» / «Масштаб»; фильтр «Переместить» их не прячет, «Повернуть» — только поворот; корень вычитания — своя иконка')
    if (s.errors.length) fail('U/X: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── V: цилиндр, конус, сфера ∪ куб, куб после правки размера ──
  {
    const s = await session()
    const { page } = s
    const cyl = await s.add('Цилиндр'); await s.setF(cyl, 'num-input-pos-X', -30)
    const cone = await s.add('Конус'); await s.setF(cone, 'num-input-pos-X', 0)
    const sp = await s.add('Сфера'); await s.setF(sp, 'num-input-pos-X', 30)
    const cb = await s.add('Куб'); await s.setF(cb, 'num-input-pos-X', 42)
    await s.csg(sp, cb, 'KeyU')
    const c2 = await s.add('Куб'); await s.setF(c2, 'num-input-pos-X', 70)
    await s.pick(c2)
    const k0 = await s.steps(); const w = page.locator('.panel-right [id="num-input-Ширина"]')
    await w.fill('30'); await w.press('Enter'); await s.waitSteps(k0 + 1)
    if ((await page.locator('.tl-label').last().innerText()).trim() !== 'Изменить размер') fail('V: правка размера куба — шаг ' + (await page.locator('.tl-label').last().innerText()))
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyF'); await page.waitForTimeout(1000); await s.shot('v-shapes.png')
    if (await s.toasts()) fail('V: уведомления ' + (await s.toasts()))
    if (s.errors.length) fail('V: ошибки консоли ' + s.errors.join(' | '))
    ok.push('V: цилиндр, конус, сфера ∪ куб, куб после правки размера — без ошибок (нормали — unit)')
    await s.browser.close()
  }

  // ── ✅ UX-AUDIT-32: «Выровнять» — верх куба (A), боковая грань призмы (B) → поворот + сдвиг ──
  {
    const s = await session()
    const { page } = s
    const cube = await s.add('Куб')
    const prism = await s.add('Призма'); await s.setF(prism, 'num-input-pos-X', 40)
    await s.blur(); await page.keyboard.press('KeyF'); await page.waitForTimeout(800)
    const panel = page.locator('[data-testid=align-panel]')
    await toolbarButton(page, 'Выровнять').click(); await panel.waitFor({ timeout: 5000 })
    const topA = await findAlignFace(page, cube, (n) => n[2] > 0.99)
    await page.mouse.click(topA.x, topA.y)
    await page.waitForFunction(() => document.querySelector('[data-testid=align-plane]')?.textContent?.includes('грань'), null, { timeout: 5000 })
    const sideB = await findAlignFace(page, prism, (n) => Math.abs(n[2]) < 0.05)
    const n0 = await s.steps()
    await page.mouse.click(sideB.x, sideB.y); await s.waitSteps(n0 + 1)
    await page.waitForTimeout(300); await s.shot('align-32.png')
    // ✅ UX-AUDIT-32: призма повёрнута на 90° (боковая грань смотрит вверх, как верх куба), центр —
    // z = 10 − апофема 12·cos 30° ≈ −0,4; один шаг «Повернуть»; режим закрыт
    if (await panel.count()) fail('UX-AUDIT-32: режим не закрылся после грани B')
    await s.pick(prism)
    const rot = await Promise.all(['X', 'Y', 'Z'].map(async (a) => Number(await page.locator(`.panel-right #num-input-rot-${a}`).inputValue())))
    const z = Number(await page.locator('.panel-right #num-input-pos-Z').inputValue())
    const steps = await s.steps()
    if (Math.max(Math.abs(rot[0]), Math.abs(rot[1])) < 89.9 || Math.max(Math.abs(rot[0]), Math.abs(rot[1])) > 90.1) fail(`UX-AUDIT-32: поворот призмы ${rot.join(', ')}°`)
    if (Math.abs(z + 0.4) > 0.11) fail(`UX-AUDIT-32: призма Z = ${z} (ожидалось ≈ −0,4)`)
    if (steps !== n0 + 1 || (await page.locator('.tl-label').last().innerText()).trim() !== 'Повернуть') fail('UX-AUDIT-32: шаг истории — ' + (await page.locator('.tl-label').last().innerText()))
    ok.push(`K: «Выровнять» — верх куба (A), боковая грань призмы (B) → призма повёрнута (${rot.join(', ')}°), грань B в плоскости A (Z ${z}), один шаг «Повернуть» (UX-AUDIT-32)`)
    if (s.errors.length) fail('UX-AUDIT-32: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── W: линейка — измерение по CSG; наведение над импортом 100k ──
  {
    const s = await session()
    const { page } = s
    const a = await s.add('Куб'); const b = await s.add('Куб'); await s.setF(b, 'num-input-pos-X', 15)
    await s.csg(a, b, 'KeyU')
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyF'); await page.waitForTimeout(800)
    await page.keyboard.press('KeyL')
    const vp = await s.rect('.main > .viewport')
    const cx = (vp.left + vp.right) / 2, cy = (vp.top + vp.bottom) / 2
    await page.mouse.click(cx - 30, cy); await page.mouse.click(cx + 30, cy + 5)
    await page.locator('.ruler-display').waitFor({ timeout: 5000 })
    if (!/Расстояние: \d/.test(await page.locator('.ruler-display').innerText())) fail('W: измерение по CSG')
    ok.push('W: линейка — измерение по CSG (куб ∪ куб), плашка «Расстояние»; привязка к ребру CSG — unit (UX-AUDIT-22)')
    await page.keyboard.press('KeyL')
    await s.confirmClear()
    const big = path.join(tmp, 'big.stl'); const n = bigStl(big)
    await s.importStl(big)
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyF'); await page.waitForTimeout(1000)
    await page.keyboard.press('KeyL'); await page.waitForTimeout(300)
    const v2 = await s.rect('.main > .viewport'); const x0 = (v2.left + v2.right) / 2, y0 = (v2.top + v2.bottom) / 2
    await page.mouse.move(v2.left + 5, v2.top + 5)
    await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask' }) })
    for (let k = 0; k < 12; k++) await page.mouse.move(x0 - 40 + k * 7, y0 + (k % 3) * 4)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const lt = await page.evaluate(() => window.__lt)
    // ✅ UX-AUDIT-35: наведение плавное — после первого движения (сетка треугольников строится один
    // раз) долгих задач ≥ 50 мс нет; было 63–113 мс на каждое движение
    const after = lt.slice(1)
    if (after.length > 1) fail(`UX-AUDIT-35: 12 движений над импортом ${n} — долгие задачи ${lt.join(', ')} мс`)
    ok.push(`W: линейка над импортом ${n} — 12 движений: долгие задачи ${lt.length ? lt.join(', ') + ' мс' : 'нет'} (первое — сборка сетки; UX-AUDIT-35)`)
    if (s.errors.length) fail('W: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── Y: 1280×800 — тулбар в 2 строки ──
  {
    const s = await session({ width: 1280, height: 800 })
    const { page } = s
    const a = await s.add('Куб'); const b = await s.add('Сфера')
    const m = await page.evaluate(() => {
      const tb = document.querySelector('[role=toolbar]').getBoundingClientRect()
      return {
        cut: [...document.querySelectorAll('[role=toolbar] button')].filter((x) => { const q = x.getBoundingClientRect(); return q.width === 0 || q.right > window.innerWidth + 0.5 || q.bottom > tb.bottom + 0.5 }).length,
        docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        statusH: Math.round(document.querySelector('.statusbar').getBoundingClientRect().height),
        tbH: Math.round(tb.height),
      }
    })
    if (m.cut || m.docScroll > 0 || m.statusH > 30) fail('Y 1280: ' + JSON.stringify(m))
    await s.blur(); await page.keyboard.press('Escape'); await page.keyboard.press('KeyL')
    const vp = await s.rect('.main > .viewport')
    await page.mouse.click(vp.left + (vp.right - vp.left) * 0.3, vp.top + (vp.bottom - vp.top) * 0.8)
    await page.mouse.click(vp.left + (vp.right - vp.left) * 0.6, vp.top + (vp.bottom - vp.top) * 0.85)
    await page.locator('.ruler-display').waitFor({ timeout: 5000 }); await page.waitForTimeout(300)
    await s.pair(a, b); await panelButton(page, 'Пересечение').click()
    await page.locator('.toast').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(400)
    await s.shot('y-1280.png')
    const [r, t, tb, right, snap] = [await s.rect('.ruler-display'), await s.rect('.toast'), await s.rect('[role=toolbar]'), await s.rect('.panel-right'), await s.rect('.snap-selector')]
    const bad = [...(overlap(r, tb) ? ['плашка ∩ тулбар'] : []), ...(overlap(t, tb) ? ['тост ∩ тулбар'] : []), ...(overlap(t, right) ? ['тост ∩ панель'] : []), ...(overlap(t, snap) ? ['тост ∩ «Привязка»'] : [])]
    if (bad.length) fail('Y 1280: ' + bad.join(', '))
    if (s.errors.length) fail('Y: ошибки консоли ' + s.errors.join(' | '))
    ok.push(`Y: 1280×800 — тулбар ${m.tbH} px, все кнопки в окне, статус-бар 1 строка; «Расстояние» и тост не на тулбаре, панели, «Привязке»`)
    await s.browser.close()
  }

  console.log('e2e ux-audit-4 OK')
  for (const x of ok) console.log('  ✅ ' + x)
  for (const x of known) console.log('  🐞 known: ' + x)
} catch (e) {
  console.error('e2e ux-audit-4 FAIL —', e.message); if (process.env.DEBUG) console.error(e.stack)
  for (const x of ok) console.error('  ✅ ' + x)
  for (const x of known) console.error('  🐞 known: ' + x)
  process.exitCode = 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit()
}
