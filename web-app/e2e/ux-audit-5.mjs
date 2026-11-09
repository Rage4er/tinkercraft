// e2e/ux-audit-5.mjs — UX-прогон 5: H–N, O–T, U–Y повторно (`pnpm e2e:ux-audit-2`, `e2e:ux-audit-3`,
// `e2e:ux-audit-4`) + новые сценарии по фиксам 32–35 + UX-AUDIT-32-followup.
//  K. «Выровнять» с поворотом: A — бок повёрнутого куба (наклонная плоскость), B — верх CSG → поворот
//     по трём осям, шаг «Выровнять по грани»; правка ребёнка — на месте; правка поворота куба A до
//     выравнивания — CSG доворачивается к новой плоскости (ALIGN-PLANE-RESOLVE); копия, .3dtc — без замков.
//     «Множественное» — две призмы, обе повёрнуты. B на объекте A — уведомление, шага нет (R).
//  O/U. Текст: зеркало зеркала, вставка зеркального текста, вложенный CSG и его зеркальная копия,
//     .3dtc — везде «Текст» / «Текст: Дом».
//  M/Y. Панель выравнивания на 768 и 1024 — в панели, без прокрутки; «Вписать в экран» — сцена целиком.
//  Баги прогона 5 (были `knownBug`), исправлены в fix-all-5 — обычные проверки:
//     UX-AUDIT-32-followup «Множественное» — призмы повёрнуты на месте, X/Y прежние;
//     UX-AUDIT-36 английский интерфейс — строка текста «Text: Дом»;
//     UX-AUDIT-37 грань под 5° к встречной — доворот встречно, куб на плоскости (Y 10);
//     UX-AUDIT-38 панель «Шаг N» шага поворота — «Повернуть», в «Исходно» — углы (шаг выравнивания —
//     align, ✎ нет — ALIGN-PLANE-RESOLVE);
//     UX-AUDIT-39 «Вписать в экран» на 768 — сцена целиком;
//     UX-AUDIT-40 правка поворота шага — «Правка шага 2: поворот (0, 0, 30)° → (0, 0, 45)°».
//  `knownBug` сейчас нет. Логика — __tests__/ux-audit-5.test.tsx.
// Ошибок консоли нет (все сценарии).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-audit-5` в другом.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, toolbarButton, findAlignFace, placeShape } from './helpers.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-5-'))
const ok = []
const known = []
const fail = (msg) => { throw new Error(msg) }
/** Известный баг (UX-AUDIT-32-followup, 36…): `expectation` бросает — баг на месте; выполнилась — перенести в ✅. */
async function knownBug(id, title, expectation) {
  let reproduced = false
  try { await expectation() } catch (e) { reproduced = true; known.push(`${id} ${title} — ${e.message}`) }
  if (!reproduced) fail(`${id} (${title}): ожидание выполнилось — баг исправлен? Перенести проверку в ✅ и обновить DEVELOPMENT_PLAN`)
}

/** Сессия браузера с общими хелперами (как в ux-audit-4). */
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

try {
  // ── K: наклонная плоскость A → верх CSG; правка ребёнка, правка шага, копия, .3dtc ──
  // ── ✅ UX-AUDIT-38/40: панель «Шаг N» шага «Повернуть» и подпись правки поворота ──
  {
    const s = await session()
    const { page } = s
    const r = await s.add('Куб'); await s.setF(r, 'num-input-rot-Z', 30)
    const a = await s.add('Куб'); await s.setF(a, 'num-input-pos-X', 45)
    const b = await s.add('Сфера'); await s.setF(b, 'num-input-pos-X', 55)
    const g = await s.csg(a, b, 'KeyU')
    await s.startAlign()
    await s.clickA(r, (n) => near(n[0], Math.cos(Math.PI / 6), 0.02) && near(n[1], 0.5, 0.02))
    await s.clickB(g, (n) => n[2] > 0.99)
    const t1 = await s.tr(g)
    // поворот по трём осям: верх (+Z) → нормаль A (cos 30°, sin 30°, 0) — (−90, 60, 60)
    if (!near(t1[3], -90, 0.11) || !near(t1[4], 60, 0.11) || !near(t1[5], 60, 0.11)) fail('K: поворот CSG ' + t1.join(', '))
    if ((await s.labels()).at(-1) !== 'Выровнять по грани') fail('K: шаг — ' + (await s.labels()).at(-1))   // ALIGN-PLANE-RESOLVE: шаг align
    // правка ребёнка (сфера R12 → R15) — CSG на месте
    await page.locator(`.ct-item[data-object-id="${g}"] .ct-chevron`).click()
    await page.locator('.ct-child', { hasText: 'Сфера' }).first().click()
    const cp = page.locator('[data-testid=child-props]'); await cp.waitFor({ timeout: 5000 })
    let n0 = await s.steps(); const r15 = cp.locator('input.props-input').first(); await r15.fill('15'); await r15.press('Enter'); await s.waitSteps(n0 + 1)
    if ((await s.tr(g)).join() !== t1.join()) fail('K: правка ребёнка сдвинула CSG ' + (await s.tr(g)).join(', '))
    // ALIGN-PLANE-RESOLVE: правка шага «Повернуть» куба плоскости A (rotZ 30 → 40) — выравнивание
    // пересчитано: верх CSG доворачивается к новой плоскости, нормаль (cos 40°, sin 40°, 0)
    const row = page.locator('.tl-item', { hasText: 'Повернуть' }).first()
    await row.locator('.tl-edit').click()
    const sp = page.locator('[data-testid=step-panel]'); await sp.waitFor({ timeout: 5000 })
    const title = ((await sp.locator('.props-section-title').first().textContent()) ?? '').trim()   // innerText — в верхнем регистре (CSS)
    const original = (await sp.locator('[data-testid=step-original]').innerText()).trim()
    const rz0 = sp.locator('[data-testid=step-rotDelta] input.props-input').nth(2)
    n0 = await s.steps(); await rz0.fill('40'); await rz0.press('Enter'); await s.waitSteps(n0 + 1)
    await sp.getByRole('button', { name: /Назад/ }).click()
    const t2 = await s.tr(g)
    const rad = (d) => d * Math.PI / 180, top = [Math.sin(rad(t2[4])), -Math.sin(rad(t2[3])) * Math.cos(rad(t2[4])), Math.cos(rad(t2[3])) * Math.cos(rad(t2[4]))]
    if (!near(top[0], Math.cos(rad(40)), 0.005) || !near(top[1], Math.sin(rad(40)), 0.005) || !near(top[2], 0, 0.005)) fail('K: правка шага до выравнивания — верх CSG ' + top.map((v) => v.toFixed(3)).join(', ') + ' (CSG ' + t2.join(', ') + ')')
    if (await s.toasts()) fail('K: уведомления после правки шага ' + (await s.toasts()))
    // копия CSG → правка ребёнка копии; оригинал не меняется
    const c2 = await s.copyPaste(g)
    await page.locator(`.ct-item[data-object-id="${c2}"] .ct-chevron`).click()
    await page.locator(`.ct-item[data-object-id="${c2}"]`).locator('xpath=..').locator('.ct-child', { hasText: 'Куб' }).first().click()
    await cp.waitFor({ timeout: 5000 })
    n0 = await s.steps(); const w = cp.locator('input.props-input').first(); await w.fill('26'); await w.press('Enter'); await s.waitSteps(n0 + 1)
    if ((await s.tr(g)).join() !== t2.join()) fail('K: правка копии сдвинула оригинал')
    const before = JSON.stringify([await s.tr(g), await s.tr(c2)])
    await s.saveReopen()
    if (JSON.stringify([await s.tr(g), await s.tr(c2)]) !== before) fail('K: .3dtc — ' + JSON.stringify([await s.tr(g), await s.tr(c2)]) + ' ≠ ' + before)
    if (await locks(page)) fail('K: замки в дереве')
    if (await s.toasts()) fail('K: уведомления ' + (await s.toasts()))
    ok.push(`K: наклонная плоскость A (бок куба rotZ 30) → верх CSG: поворот (${t1.slice(3).join(', ')})°, «Выровнять по грани»; правка ребёнка — на месте; правка поворота куба A до выравнивания (30 → 40°) — CSG довернулась (${t2.slice(3).join(', ')})°; копия, .3dtc — на месте, без замков`)

    // ✅ UX-AUDIT-38: панель шага поворота полем — «Шаг N: Повернуть», «Исходно» — углы (было
    // «Перемещение», только сдвиг). Шаг выравнивания — align (ALIGN-PLANE-RESOLVE), ✎ у него нет
    if (!title.endsWith(': Повернуть') || original !== 'поворот (0, 0, 30)°') fail(`UX-AUDIT-38: заголовок «${title}», исходно «${original}»`)
    ok.push(`UX-AUDIT-38: панель шага поворота — «${title}», исходно «${original}»`)
    // UX-AUDIT-40: правка поворота шага → в истории «сдвиг (…) → (…)» без изменений
    await s.confirmClear()
    const c = await s.add('Куб'); await s.setF(c, 'num-input-rot-Z', 30)
    await page.locator('.tl-item', { hasText: 'Повернуть' }).last().locator('.tl-edit').click()
    await sp.waitFor({ timeout: 5000 })
    const rz = sp.locator('[data-testid=step-rotDelta] input.props-input').nth(2)
    n0 = await s.steps(); await rz.fill('45'); await rz.press('Enter'); await s.waitSteps(n0 + 1)
    const rotNow = (await s.tr(c))[5]
    const editLabel = (await s.labels()).at(-1)
    if (!near(rotNow, 45)) fail('UX-AUDIT-40: правка поворота шага не применилась — rotZ ' + rotNow)
    // ✅ UX-AUDIT-40: правка поворота шага подписана поворотом (было «сдвиг (0, 0, 0) → (0, 0, 0)»)
    if (editLabel !== 'Правка шага 2: поворот (0, 0, 30)° → (0, 0, 45)°') fail(`UX-AUDIT-40: «${editLabel}»`)
    ok.push(`UX-AUDIT-40: правка поворота шага — «${editLabel}»`)
    if (s.errors.length) fail('K: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── K: «Множественное», B на объекте A (R); UX-AUDIT-32-followup; UX-AUDIT-37 ──
  {
    const s = await session()
    const { page } = s
    const cube = await s.add('Куб')
    const p1 = await s.add('Призма'); await s.setF(p1, 'num-input-pos-X', 40)
    const p2 = await s.add('Призма'); await s.setF(p2, 'num-input-pos-X', -40)
    await s.startAlign({ multiple: true })
    await s.clickA(cube, (n) => n[2] > 0.99)
    // B на том же объекте — уведомление, шага нет
    const f = await findAlignFace(page, cube, (n) => n[1] < -0.99); const n0 = await s.steps()
    await page.mouse.click(f.x, f.y); await page.waitForTimeout(500)
    if ((await s.steps()) !== n0 || !(await s.toasts()).includes('Это объект плоскости A')) fail('R: B на объекте A — ' + (await s.toasts()))
    await s.clickB(p1, (n) => Math.abs(n[2]) < 0.05)
    await s.clickB(p2, (n) => Math.abs(n[2]) < 0.05)
    await s.exitAlign()
    const [t1, t2] = [await s.tr(p1), await s.tr(p2)]
    if ((await s.labels()).slice(-2).join() !== 'Выровнять по грани,Выровнять по грани') fail('K: «Множественное» — шаги ' + (await s.labels()).slice(-2).join(' / '))
    for (const tt of [t1, t2]) if (Math.max(Math.abs(tt[3]), Math.abs(tt[4])) < 89.9 || !near(tt[2], -0.4, 0.11)) fail('K: «Множественное» — призма ' + tt.join(', '))
    ok.push('K: «Множественное» — две призмы боковой гранью к верху куба: обе повёрнуты, грань в плоскости (Z −0,4), два шага «Выровнять по грани»; R: B на объекте A — уведомление, шага нет')
    // ✅ UX-AUDIT-32-followup: поворот на месте — X/Y призм прежние (было: вокруг точки клика,
    // Y −11,1 и −5,1 — от того, куда кликнули)
    if (!near(t1[0], 40) || !near(t1[1], 0) || !near(t2[0], -40) || !near(t2[1], 0)) fail(`UX-AUDIT-32-followup: призмы X/Y ${t1[0]}, ${t1[1]} и ${t2[0]}, ${t2[1]} (были 40, 0 и −40, 0)`)
    ok.push('UX-AUDIT-32-followup: «Множественное» — призмы повёрнуты на месте, X/Y прежние (40, 0 и −40, 0), только Z −0,4')
    // UX-AUDIT-37: строго встречная грань — куб встаёт на плоскость; наклонённая на 5° — переворот
    await s.confirmClear()
    const res = []
    for (const tilt of [0, 5]) {
      const c = await s.add('Куб'); await s.setF(c, 'num-input-pos-Y', 40); if (tilt) await s.setF(c, 'num-input-rot-Z', tilt)
      await s.startAlign(); await page.locator('[data-testid=align-axis-Y]').click()
      await s.clickB(c, (n) => n[1] < -0.99)
      res.push(await s.tr(c)); await s.confirmClear()
    }
    if (!near(res[0][1], 10) || res[0].slice(3).some((v) => v !== 0)) fail('K: строго встречная грань — ' + res[0].join(', '))
    ok.push('K: плоскость Y, строго встречная грань куба (Y 40) — куб встаёт на плоскость (Y 10), без поворота')
    // ✅ UX-AUDIT-37: наклон 5° (угол 175° > 90°) — доворот встречно, куб на плоскости, как строго
    // встречная (было: переворот на 175°, Y −10, rotZ 180)
    if (!near(res[1][5], 0, 0.11) || !near(res[1][1], 10) || !near(res[1][0], 0)) fail(`UX-AUDIT-37: наклон 5° → X ${res[1][0]}, Y ${res[1][1]}, rotZ ${res[1][5]} (строго встречная — Y ${res[0][1]}, rotZ 0)`)
    if ((await s.labels()).length) fail('UX-AUDIT-37: история не очищена')
    ok.push(`UX-AUDIT-37: наклон 5° — доворот встречно на 5°, куб на плоскости (Y ${res[1][1]}, rotZ ${res[1][5]}), как строго встречная`)
    if (s.errors.length) fail('K: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── O/U: текст — зеркало зеркала, вставка, вложенный CSG и его зеркальная копия, .3dtc; ──
  // ── UX-AUDIT-36: английский интерфейс ──
  {
    const s = await session()
    const { page } = s
    const typeOf = async (id) => { await s.pick(id); return (await page.locator('.panel-right .props-row').first().innerText()).replace(/\s+/g, ' ') }
    const t1 = await s.addText('Дом')
    const m1 = await s.mirror(t1, 'YZ')
    const m2 = await s.mirror(m1, 'XZ')
    const pm = await s.copyPaste(m2)
    if ((await s.labels()).at(-1) !== 'Вставить текст') fail('O: вставка зеркального текста — ' + (await s.labels()).at(-1))
    for (const id of [t1, m1, m2, pm]) if (!(await typeOf(id)).includes('Текст')) fail(`O: ${id} — ${await typeOf(id)}`)
    const cb = await s.add('Куб'); await s.setF(cb, 'num-input-pos-X', 60); await s.setF(m1, 'num-input-pos-X', 55)
    const g1 = await s.csg(m1, cb, 'KeyU')
    const sp = await s.add('Сфера'); await s.setF(sp, 'num-input-pos-X', 70)
    const g2 = await s.csg(g1, sp, 'KeyU')
    const mg = await s.mirror(g2, 'YZ')
    await s.saveReopen()
    await s.expandAll()
    const [n2, nm] = [await s.treeNames(g2), await s.treeNames(mg)]
    if (!n2.includes('Текст: Дом') || !nm.includes('Текст: Дом (зеркало)')) fail('O: дерево после .3dtc — ' + JSON.stringify([n2, nm]))
    for (const id of [t1, m2, pm]) if (!(await typeOf(id)).includes('Текст')) fail(`O: после .3dtc ${id} — ${await typeOf(id)}`)
    ok.push('O/U: текст → зеркало → зеркало зеркала → вставка — «Текст», «Вставить текст»; во вложенном CSG и его зеркальной копии — «Текст: Дом» / «Текст: Дом (зеркало)»; после .3dtc — так же')
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(400)
    const rowName = (await page.locator(`.ct-item[data-object-id="${t1}"] .ct-name`).first().innerText()).trim()
    const cubeName = (await page.locator(`.ct-item[data-object-id="${g2}"] .ct-name`).first().innerText()).trim()
    const enTree = await s.treeNames(g2)
    if (!cubeName.startsWith('CSG result') || !enTree.includes('Text: Дом')) fail('UX-AUDIT-36: en — ' + JSON.stringify([cubeName, enTree]))
    // ✅ UX-AUDIT-36: имя текста по умолчанию — на языке интерфейса (было «Текст: Дом» в en)
    if (rowName !== 'Text: Дом') fail(`UX-AUDIT-36: строка списка «${rowName}» (CSG — «${cubeName}», ребёнок CSG — «Text: Дом»)`)
    ok.push('UX-AUDIT-36: английский интерфейс — строка текста «Text: Дом», как «CSG result …» и ребёнок CSG «Text: Дом»')
    await page.locator('.lang-switcher').click(); await page.waitForTimeout(300)
    if (await s.toasts()) fail('O: уведомления ' + (await s.toasts()))
    if (s.errors.length) fail('O: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── M/Y: панель выравнивания на 768 / 1024; UX-AUDIT-39: «Вписать в экран» на 768 ──
  {
    const edges = []
    for (const size of [{ width: 1400, height: 850 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
      const s = await session(size)
      const { page } = s
      const c = await s.add('Куб'); const p = await s.add('Призма'); await s.setF(p, 'num-input-pos-X', 40)
      void c; void p
      await s.startAlign()                                    // F (вписать) + режим выравнивания
      const m = await page.evaluate(() => {
        const pr = document.querySelector('.panel-right').getBoundingClientRect()
        const out = [...document.querySelectorAll('[data-testid=align-panel] *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > pr.right + 0.5 || r.left < pr.left - 0.5) }).length
        return { out, docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }
      })
      if (m.out || m.docScroll > 0) fail(`M/Y ${size.width}: панель выравнивания ${JSON.stringify(m)}`)
      // объект под курсором у левого / правого края вьюпорта (подсветка грани режима выравнивания)
      const vp = page.locator('.viewport-canvas'); const b = await vp.boundingBox()
      const hits = []
      for (const x of [b.x + 3, b.x + b.width - 3]) for (let k = 1; k < 24; k++) {
        await page.mouse.move(x, b.y + (b.height * k) / 24); await page.waitForTimeout(60)
        if (await vp.getAttribute('data-align-hover')) hits.push(Math.round(x - b.x))
      }
      edges.push({ w: size.width, vp: Math.round(b.width), hits: hits.length })
      if (s.errors.length) fail(`M/Y ${size.width}: ошибки консоли ` + s.errors.join(' | '))
      await s.browser.close()
    }
    // ✅ UX-AUDIT-39: «Вписать в экран» — сцена целиком и на 768 (вьюпорт 248 px; было: объект у края в 9 точках)
    if (edges.some((e) => e.hits)) fail('UX-AUDIT-39: «Вписать в экран» — объекты у края вьюпорта ' + JSON.stringify(edges))
    ok.push(`M/Y: панель выравнивания на 1400 / 1024 / 768 — в панели, без прокрутки; «Вписать в экран» — сцена целиком на всех трёх (768 — вьюпорт ${edges[2].vp} px, UX-AUDIT-39)`)
  }

  console.log('e2e ux-audit-5 OK')
  for (const x of ok) console.log('  ✅ ' + x)
  for (const x of known) console.log('  🐞 known: ' + x)
} catch (e) {
  console.error('e2e ux-audit-5 FAIL —', e.message); if (process.env.DEBUG) console.error(e.stack)
  for (const x of ok) console.error('  ✅ ' + x)
  for (const x of known) console.error('  🐞 known: ' + x)
  process.exitCode = 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit()
}
