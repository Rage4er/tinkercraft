// e2e/ux-audit-2.mjs — UX-прогон 2 (fix-all, H–N): браузерная часть, сценарии оправдались.
//  H/I. CSG 3 уровней со сдвигами/поворотами между уровнями → дерево без замков → правка сферы
//       на 3-м уровне; копия копии (Ctrl+C/V ×2) → без замков → правка сферы в копии копии;
//  J.   STL 100k треугольников − куб (клавиша X) → экспорт STL = сцене;
//  L.   стресс: 35 фигур, ~65 шагов, undo всё / redo всё, быстрое переключение, FPS;
//  M.   1024×768 и 768×1024: страница без горизонтальной прокрутки, палитра 320 px / 3 столбца,
//       CSG-кнопки панели видны, все кнопки тулбара в окне, «Привязка» и подсказка не обрезаны,
//       статус-бар в одну строку (UX-AUDIT-12);
//  N.   светлая и тёмная темы: модалки (подтверждение, текст, проекты), тост, панели — фон
//       меняется с темой, текст читается (контраст ≥ 3).
// Ошибок консоли нет (все сценарии). Логика тех же сценариев в сторе — __tests__/ux-audit-2.test.ts.
// Пороги производительности (J — время вычитания 100k, L — FPS) — `assertPerf`: локально строго, в CI (`E2E_SOFT_PERF=1`) —
// предупреждение `[SOFT PERF]`, проверки дальше выполняются (helpers.mjs).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-audit-2` в другом.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, panelButton, toolbarButton, spaceShapeClick, assertPerf, waitToastsSettled } from './helpers.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-2-'))
const ok = []
const known = []
const fail = (msg) => { throw new Error(msg) }
/** Известный баг (UX-AUDIT-11…20): `expectation` бросает — баг на месте; выполнилась — перенести в ✅. */
async function knownBug(id, title, expectation) {
  let reproduced = false
  try { await expectation() } catch (e) { reproduced = true; known.push(`${id} ${title} — ${e.message}`) }
  if (!reproduced) fail(`${id} (${title}): ожидание выполнилось — баг исправлен? Перенести проверку в ✅ и обновить DEVELOPMENT_PLAN`)
}
/** Пересекаются ли прямоугольники (DOMRect-подобные). */
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Сессия браузера с общими хелперами. */
async function session(size) {
  const s = await openApp(size)
  const { page } = s
  const rows = page.locator('.ct-item[data-object-id]')
  const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
  const waitRows = (n, t = 20000) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: t })
  const steps = () => page.locator('.tl-item').count()
  const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
  const status = async () => (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ')
  const add = async (label) => {
    const b = new Set(await ids())
    await spaceShapeClick(page, label)
    await page.getByText(label, { exact: true }).first().click()
    await waitRows(b.size + 1)
    return (await ids()).find((i) => !b.has(i))
  }
  const pick = async (id) => { await page.locator(`.ct-item[data-object-id="${id}"]`).click(); await page.waitForTimeout(150) }
  const setF = async (id, f, v) => {
    await pick(id)
    const n = await steps(); const el = page.locator(`.panel-right #${f}`)
    await el.fill(String(v)); await el.press('Enter')
    await page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k + 1, n, { timeout: 10000 })
  }
  const union = async (a, b) => {
    const be = new Set(await ids())
    await pick(a); await page.locator(`.ct-item[data-object-id="${b}"]`).click({ modifiers: ['Shift'] })
    await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('KeyU')
    await waitRows(be.size - 1)
    return (await ids()).find((i) => !be.has(i))
  }
  const confirmClear = async () => {
    if ((await rows.count()) === 0 && (await steps()) === 0) return
    await toolbarButton(page, 'Очистить сцену').click()
    await page.locator('[data-testid=confirm-modal]').getByRole('button', { name: 'Очистить', exact: true }).click()
    await waitRows(0)
  }
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  return { ...s, rows, ids, waitRows, steps, toasts, status, add, pick, setF, union, confirmClear }
}

/** Раскрыть всё дерево корня; замки (причины) после проверки согласованности. */
async function expandAll(page, root) {
  await page.locator(`.ct-item[data-object-id="${root}"] .ct-chevron`).click()
  for (let i = 0; i < 8; i++) {
    const closed = page.locator('.ct-child .ct-chevron', { hasText: '▸' })
    if (!(await closed.count())) break
    await closed.first().click(); await page.waitForTimeout(150)
  }
  await page.waitForTimeout(1500)
  return page.locator('[data-testid=ct-lock]').evaluateAll((els) => els.map((e) => e.getAttribute('data-reason')))
}
/** Выбрать ребёнка-сферу (последнюю видимую) и поменять радиус → новый шаг, без уведомлений. */
async function editSphere(s, radius, tag) {
  const { page } = s
  await page.locator('.ct-child', { hasText: 'Сфера' }).last().click()
  await page.locator('[data-testid=child-form]').waitFor({ timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
  if (await page.locator('[data-testid=child-not-editable], [data-testid=child-unavailable]').count()) fail(`${tag}: правка сферы недоступна`)
  const n = await s.steps()
  const r = page.locator('[data-testid=child-form] input.props-input').first()
  await r.fill(String(radius)); await r.blur()
  await page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k + 1, n, { timeout: 15000 })
    .catch(() => fail(`${tag}: шаг правки не записан`))
  await page.waitForFunction((rr) => [...document.querySelectorAll('.ct-child')].some((e) => e.textContent.includes(`R${rr}`)), radius, { timeout: 10000 })
  if (await s.toasts()) fail(`${tag}: уведомления ${await s.toasts()}`)
}

/** Относительная яркость и контраст (WCAG) для rgb(a)-строк. */
function rgb(str) { return str.match(/[\d.]+/g).slice(0, 3).map(Number) }
function lum([r, g, b]) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
function contrast(a, b) { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

try {
  // ── H/I: 3 уровня вложенности, копия копии ──
  {
    const s = await session()
    const { page } = s
    const a = await s.add('Куб'); const sp = await s.add('Сфера'); await s.setF(sp, 'num-input-pos-X', 12)
    const added = (await page.locator('.tl-item').allInnerTexts()).slice(0, 2).map((x) => x.replace(/\s+/g, ' '))
    if (!added[0].includes('Добавить куб') || !added[1].includes('Добавить сферу')) fail('UX-AUDIT-17: шаги истории — ' + added.join(' / '))
    const g1 = await s.union(a, sp); await s.setF(g1, 'num-input-pos-X', 5); await s.setF(g1, 'num-input-rot-Z', 20)
    const c = await s.add('Цилиндр'); await s.setF(c, 'num-input-pos-X', -8)
    const g2 = await s.union(g1, c); await s.setF(g2, 'num-input-pos-Y', 7)
    const d = await s.add('Тор'); await s.setF(d, 'num-input-pos-Z', 8)
    const g3 = await s.union(g2, d)
    const locks = await expandAll(page, g3)
    if (locks.length) fail('H: замки в дереве 3 уровней: ' + locks.join(','))
    if ((await page.locator('.ct-child').count()) !== 6) fail('H: детей в дереве ' + (await page.locator('.ct-child').count()))
    const cylRow = (await page.locator('.ct-child', { hasText: 'Цилиндр' }).first().innerText()).replace(/\s+/g, ' ')
    if (!cylRow.includes('R10 H20')) fail('UX-AUDIT-14: строка цилиндра в дереве — ' + cylRow)
    await editSphere(s, 15, 'H')
    ok.push('H: CSG 3 уровней (сдвиги/поворот между уровнями) — без замков, «Добавить сферу» (UX-AUDIT-17), «Цилиндр · R10 H20» (UX-AUDIT-14), правка сферы R12 → R15')
    await s.pick(g3); await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await s.waitRows(2)
    const cp1 = (await s.ids()).find((i) => i !== g3)
    await s.pick(cp1); await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await s.waitRows(3)
    const cp2 = (await s.ids()).find((i) => i !== g3 && i !== cp1)
    const pasteSteps = (await page.locator('.tl-item').allInnerTexts()).slice(-2).map((x) => x.replace(/\s+/g, ' '))
    if (!pasteSteps.every((x) => x.includes('Вставить CSG'))) fail('UX-AUDIT-13: шаги вставки в истории — ' + pasteSteps.join(' / '))
    const locks2 = await expandAll(page, cp2)
    if (locks2.length) fail('I: замки в копии копии: ' + locks2.join(','))
    await editSphere(s, 9, 'I')
    const tri = await s.rows.evaluateAll((els) => els.map((e) => e.querySelector('.ct-tri')?.textContent))
    if (tri[0] !== tri[1] || tri[2] === tri[0]) fail('I: правка копии копии задела оригинал/первую копию или не изменила копию: ' + tri.join(' / '))
    ok.push('I: копия копии (Ctrl+C/V ×2) — в истории «Вставить CSG» (UX-AUDIT-13), без замков, правка сферы → только копия копии')
    if (s.errors.length) fail('H/I: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── J: 100k − куб → экспорт; L: стресс ──
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
    const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Импорт').click(); (await fc).setFiles(big)
    await s.waitRows(1, 30000)
    const sphere = (await s.ids())[0]; const cube = await s.add('Куб')
    await s.pick(sphere); await page.locator(`.ct-item[data-object-id="${cube}"]`).click({ modifiers: ['Shift'] })
    await page.evaluate(() => document.activeElement?.blur())
    let t = Date.now(); await page.keyboard.press('KeyX'); await s.waitRows(1, 30000)
    const tCsg = Date.now() - t
    const lastStep = await page.locator('.tl-item').last().innerText()
    if (!lastStep.includes('Вычитание')) fail('UX-AUDIT-11: шаг вычитания в истории — ' + lastStep.replace(/\s+/g, ' '))
    const inScene = (await s.status()).match(/Треуг\.: ([\d\s]+)/)[1].replace(/\s/g, '')
    const dl = page.waitForEvent('download'); await toolbarButton(page, 'Экспорт').click()
    const stl = path.join(tmp, 'e.stl'); await (await dl).saveAs(stl)
    const n = fs.readFileSync(stl).readUInt32LE(80)
    if (String(n) !== inScene) fail(`J: в STL ${n} треугольников, в сцене ${inScene}`)
    assertPerf(tCsg <= 15000, `J: вычитание 100k ${tCsg} мс`)
    ok.push(`J: STL ${tris.length} − куб (X) за ${tCsg} мс → в истории «Вычитание» (UX-AUDIT-11) → экспорт ${n} треугольников = сцене`)

    await s.confirmClear()
    const LABELS = ['Куб', 'Сфера', 'Цилиндр', 'Конус', 'Тор', 'Призма', 'Пирамида']
    t = Date.now()
    for (let i = 0; i < 35; i++) { await page.getByText(LABELS[i % 7], { exact: true }).first().click(); await s.waitRows(i + 1) }
    const all = await s.ids()
    for (let i = 0; i < all.length; i++) {
      if (i % 7 === 0) continue
      await s.pick(all[i]); const f = page.locator('.panel-right #num-input-pos-Y')
      await f.fill(String((i % 7) * 30)); await f.press('Enter'); await page.waitForTimeout(40)
    }
    await page.waitForFunction(() => /История: (\d+)\/\1/.test(document.querySelector('.statusbar')?.textContent ?? ''), null, { timeout: 15000 })
    const total = await s.steps()
    if (total < 60) fail('L: шагов ' + total)
    await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('KeyF'); await page.waitForTimeout(1500)
    const fps = Number((await s.status()).match(/FPS: (\d+)/)[1])
    const undo = toolbarButton(page, 'Отменить'), redo = toolbarButton(page, 'Повторить')
    for (let k = 0; k < total; k++) await undo.click({ timeout: 20000 })
    await s.waitRows(0, 30000)
    for (let k = 0; k < total; k++) await redo.click({ timeout: 20000 })
    await page.waitForFunction((k) => new RegExp(`История: ${k}/${k}`).test(document.querySelector('.statusbar')?.textContent ?? ''), total, { timeout: 30000 })
    if ((await s.rows.count()) !== 35) fail('L: после redo объектов ' + (await s.rows.count()))
    for (let i = 0; i < 8; i++) {
      await page.locator('button.tab-btn', { hasText: 'Список' }).click(); await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
      await toolbarButton(page, 'Сменить тему').click(); await page.evaluate(() => document.activeElement?.blur())
      for (const key of ['KeyG', 'KeyR', 'KeyS', 'Escape', 'KeyL', 'KeyL', 'Tab', 'Tab', 'Control+a', 'Escape']) await page.keyboard.press(key)
    }
    await page.waitForTimeout(400)
    if ((await s.rows.count()) !== 35) fail('L: после переключений объектов ' + (await s.rows.count()))
    assertPerf(fps >= 30, 'L: FPS ' + fps)
    ok.push(`L: 35 фигур, ${total} шагов — ${Date.now() - t} мс с undo/redo всего; FPS ${fps}; переключения ×8 без ошибок`)
    if (s.errors.length) fail('J/L: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── M: узкие экраны ──
  for (const [width, height] of [[1024, 768], [768, 1024]]) {
    const s = await session({ width, height })
    const { page } = s
    const a = await s.add('Куб'); const b = await s.add('Сфера')
    await s.pick(a); await page.locator(`.ct-item[data-object-id="${b}"]`).click({ modifiers: ['Shift'] }); await page.waitForTimeout(200)
    const m = await page.evaluate(() => ({
      docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      left: Math.round(document.querySelector('.panel-left').getBoundingClientRect().width),
      cols: getComputedStyle(document.querySelector('.shape-grid')).gridTemplateColumns.split(' ').length,
      right: document.querySelector('.panel-right').getBoundingClientRect().right <= window.innerWidth,
    }))
    if (m.docScroll > 0) fail(`M ${width}: горизонтальная прокрутка страницы ${m.docScroll}px`)
    if (m.left !== 320 || m.cols !== 3) fail(`M ${width}: палитра ${m.left}px, ${m.cols} столбца`)
    if (!m.right) fail(`M ${width}: правая панель за краем`)
    for (const name of ['Объединение', 'Вычитание', 'Пересечение']) if (!(await panelButton(page, name).isVisible())) fail(`M ${width}: не видна кнопка панели «${name}»`)
    // ✅ UX-AUDIT-12: все кнопки тулбара — в окне (без прокрутки), «Привязка» и подсказка вьюпорта
    // не обрезаны (подсказка на узком вьюпорте скрыта), статус-бар — одна строка
    {
      const r = await page.evaluate(() => {
        const vp = document.querySelector('.viewport').getBoundingClientRect()
        const tb = document.querySelector('[role=toolbar]').getBoundingClientRect()
        const inside = (e) => { if (!e || getComputedStyle(e).display === 'none') return true; const b = e.getBoundingClientRect(); return b.left >= vp.left - 0.5 && b.right <= vp.right + 0.5 }
        const sb = document.querySelector('.statusbar')
        return {
          cut: [...document.querySelectorAll('[role=toolbar] button')].filter((b) => { const q = b.getBoundingClientRect(); return q.width === 0 || q.left < 0 || q.right > window.innerWidth + 0.5 || q.bottom > tb.bottom + 0.5 }).map((b) => b.getAttribute('aria-label')),
          snap: inside(document.querySelector('.snap-selector')), hint: inside(document.querySelector('.viewport-hint')),
          statusH: Math.round(sb.getBoundingClientRect().height),
        }
      })
      const bad = [...(r.cut.length ? [`за краем: ${r.cut.join(', ')}`] : []), ...(r.snap ? [] : ['«Привязка» обрезана']), ...(r.hint ? [] : ['подсказка обрезана']), ...(r.statusH > 30 ? [`статус-бар ${r.statusH}px`] : [])]
      if (bad.length) fail(`UX-AUDIT-12 ${width}×${height}: ${bad.join('; ')}`)
    }
    // ✅ UX-AUDIT-16: значение поля видно целиком (−1234.5) — в покое (без наведения и фокуса)
    if (width === 1024) {
      await s.pick(a)
      const f = page.locator('.panel-right #num-input-pos-X'); await f.fill('-1234.5'); await f.press('Enter')
      await page.waitForFunction(() => document.querySelector('.panel-right #num-input-pos-X')?.value === '-1234.5', null, { timeout: 5000 })
      await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(0, 300)
      const m = await f.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }))
      if (m.sw > m.cw) fail(`UX-AUDIT-16: «−1234.5» обрезано: scrollWidth ${m.sw} > clientWidth ${m.cw}`)
      ok.push(`M: поле «−1234.5» видно целиком (${m.sw} ≤ ${m.cw} px, UX-AUDIT-16)`)
    }
    if (s.errors.length) fail(`M ${width}: ошибки консоли ` + s.errors.join(' | '))
    ok.push(`M: ${width}×${height} — без горизонтальной прокрутки страницы, палитра 320px/3 столбца, CSG-кнопки панели видны; все кнопки тулбара в окне, «Привязка» не обрезана, статус-бар в 1 строку (UX-AUDIT-12)`)
    await s.browser.close()
  }

  // ── N: темы — модалки, тост, панели ──
  {
    const s = await session()
    const { page } = s
    await s.add('Куб'); await s.add('Сфера')
    let toastChecked = false
    const sample = async () => {
      const read = (sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const cs = getComputedStyle(e); return { bg: cs.backgroundColor, fg: cs.color } }, sel)
      const res = {}
      res.panel = await read('.panel-right')
      res.toolbar = await read('[role=toolbar]')
      // тост: пересечение непересекающихся (UX-AUDIT-4)
      const [p, q] = await s.ids()
      await s.pick(p); await page.locator(`.ct-item[data-object-id="${q}"]`).click({ modifiers: ['Shift'] })
      await panelButton(page, 'Пересечение').click(); await page.locator('.toast').first().waitFor({ timeout: 5000 })
      res.toast = await read('.toast'); res.toastText = await read('.toast-msg')
      // ✅ UX-AUDIT-19: тост не закрывает правую панель и тулбар — в правом верхнем углу вьюпорта
      if (!toastChecked) {
        toastChecked = true
        await page.waitForTimeout(400); await waitToastsSettled(page)   // анимация появления (translateX) закончилась
        const r = await page.evaluate(() => ['.toast', '.panel-right', '[role=toolbar]', '.main > .viewport'].map((q) => { const b = document.querySelector(q).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } }))
        const bad = [...(overlap(r[0], r[1]) ? ['правую панель'] : []), ...(overlap(r[0], r[2]) ? ['тулбар'] : [])]
        if (bad.length) fail('UX-AUDIT-19: тост перекрывает ' + bad.join(' и '))
        if (r[0].left < r[3].left || r[0].right > r[3].right) fail('UX-AUDIT-19: тост выходит за вьюпорт')
      }
      await page.locator('.toast').first().click()
      await toolbarButton(page, 'Очистить сцену').click(); await page.locator('[data-testid=confirm-modal]').waitFor()
      res.confirm = await read('[data-testid=confirm-modal]'); res.confirmText = await read('#confirm-modal-message')
      await page.keyboard.press('Escape')
      await page.getByText('Текст', { exact: true }).first().click(); await page.locator('.text-modal-box').waitFor()
      res.text = await read('.text-modal-box'); res.textTitle = await read('.text-modal-title')
      await page.locator('.text-modal-backdrop').getByRole('button', { name: 'Отмена', exact: true }).click()
      await toolbarButton(page, 'Менеджер проектов').click(); await page.locator('.modal-backdrop').waitFor()
      res.pm = await read('.modal-backdrop > *')
      await page.keyboard.press('Escape')                   // UX-AUDIT-15: Esc закрывает менеджер проектов
      await page.locator('.modal-backdrop').waitFor({ state: 'detached', timeout: 3000 }).catch(() => fail('UX-AUDIT-15: менеджер проектов не закрылся по Esc'))
      return res
    }
    const dark = await sample()
    await toolbarButton(page, 'Сменить тему').click(); await page.waitForTimeout(300)
    const light = await sample()
    for (const key of ['panel', 'toolbar', 'toast', 'confirm', 'text', 'pm']) {
      if (!dark[key] || !light[key]) fail(`N: нет элемента «${key}»`)
      if (dark[key].bg === light[key].bg) fail(`N: фон «${key}» не меняется с темой (${dark[key].bg})`)
    }
    for (const [theme, r] of [['тёмная', dark], ['светлая', light]]) {
      for (const [box, txt] of [['toast', 'toastText'], ['confirm', 'confirmText'], ['text', 'textTitle'], ['panel', 'panel']]) {
        const c = contrast(r[txt].fg, r[box].bg)
        if (c < 3) fail(`N (${theme}): контраст текста «${txt}» на «${box}» ${c.toFixed(2)}`)
      }
    }
    if (s.errors.length) fail('N: ошибки консоли ' + s.errors.join(' | '))
    ok.push('N: тёмная/светлая — панель, тулбар, тост (во вьюпорте, не поверх панели — UX-AUDIT-19), подтверждение, модалка текста, проекты (Esc, UX-AUDIT-15): фон меняется, контраст ≥ 3')
    await s.browser.close()
  }

  console.log('e2e ux-audit-2 OK')
  for (const x of ok) console.log('  ✅ ' + x)
  for (const x of known) console.log('  🐞 known: ' + x)
} catch (e) {
  console.error('e2e ux-audit-2 FAIL —', e.message)
  for (const x of ok) console.error('  ✅ ' + x)
  process.exitCode = 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit()
}
