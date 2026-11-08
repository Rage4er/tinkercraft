// e2e/align-plane-resolve.mjs — ALIGN-PLANE-RESOLVE: режим «Выровнять» пишет шаг align (не move), правка
// прошлого шага пересчитывает выравнивание — объект остаётся выровненным, уведомлений нет.
//  1. Куб A, куб B (Z 30): верх A → верх B — верх B заподлицо с A (Z 0); в истории «Выровнять по
//     грани», ✎ у шага нет.
//  2. ✎ у «Переместить» куба A (до выравнивания): ΔZ 7 — верх B снова заподлицо с A (Z 7); undo / redo
//     — 0 ↔ 7; `.3dtc` сохранить → открыть — то же.
//  3. С поворотом: призма боковой гранью к верху куба; ✎ куба ΔZ 5 — грань призмы снова в плоскости
//     (Z −0,4 → 4,6), поворот прежний.
//  4. Плоскость по оси (Y): куб Y 40 → на плоскость XZ (Y 10, «Выровнять по плоскости XZ»); ✎ его
//     «Переместить» ΔY 70, ΔX 15 — снова Y 10, X 15.
// Ошибок консоли нет. Логика — __tests__/align-plane-resolve.test.ts.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:align-plane-resolve` в другом.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, toolbarButton, findAlignFace, spaceShapeClick } from './helpers.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'align-plane-resolve-'))
const ok = []
const fail = (msg) => { throw new Error(msg) }

/** Сессия браузера с общими хелперами (как в ux-audit-7). */
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
/** ✎ у шага `label` (first / last) → поле `group` (step-delta / step-rotDelta) №`k` = `v`; Enter, «Назад». */
async function editStep(s, label, which, group, k, v) {
  const { page } = s
  await page.locator('.tl-item', { hasText: label })[which]().locator('.tl-edit').click()
  const sp = page.locator('[data-testid=step-panel]'); await sp.waitFor({ timeout: 5000 })
  let n = await s.steps()
  for (const [kk, vv] of Array.isArray(k) ? k : [[k, v]]) {
    const f = sp.locator(`[data-testid=${group}] input.props-input`).nth(kk)
    await f.fill(String(vv)); await f.press('Enter'); await s.waitSteps(++n)       // каждая правка — свой шаг
  }
  const edit = (await s.labels()).at(-1)
  await sp.getByRole('button', { name: /Назад/ }).click()
  return edit
}
const lastRow = async (page) => {
  const row = page.locator('.tl-item').last()
  return { label: ((await row.locator('.tl-label').textContent()) ?? '').trim(), edits: await row.locator('.tl-edit').count() }
}

try {
  // ── 1–2: верх B заподлицо с верхом A; правка шага якоря — снова заподлицо; undo / redo; .3dtc ──
  {
    const s = await session()
    const { page } = s
    const a = await s.add('Куб'); await s.setF(a, 'num-input-pos-X', -10)
    const b = await s.add('Куб'); await s.setF(b, 'num-input-pos-X', 40); await s.setF(b, 'num-input-pos-Z', 30)
    await s.startAlign(); await s.clickA(a, (n) => n[2] > 0.99); await s.clickB(b, (n) => n[2] > 0.99)
    const t1 = await s.tr(b)
    const row = await lastRow(page)
    if (!near(t1[2], 0) || row.label !== 'Выровнять по грани' || row.edits !== 0) fail(`1: B ${t1.join(', ')}, шаг «${row.label}», ✎ ${row.edits}`)
    ok.push(`1: верх A → верх B — заподлицо (B Z ${t1[2]}); шаг «${row.label}» (align), ✎ нет`)
    const edit = await editStep(s, 'Переместить', 'first', 'step-delta', 2, 7)
    const t2 = await s.tr(b)
    if (!near(t2[2], 7) || !near(t2[0], 40) || !near(t2[1], 0) || await s.toasts()) fail(`2: после «${edit}» B ${t2.join(', ')}; ${await s.toasts()}`)
    await s.blur(); await page.keyboard.press('Control+z'); await page.waitForTimeout(600); const tu = await s.tr(b)
    await s.blur(); await page.keyboard.press('Control+y'); await page.waitForTimeout(600); const tr = await s.tr(b)
    if (!near(tu[2], 0) || !near(tr[2], 7)) fail(`2: undo ${tu[2]}, redo ${tr[2]}`)
    await s.saveReopen(); const to = await s.tr(b)
    if (to.join() !== tr.join() || await locks(page)) fail(`2: .3dtc ${to.join(', ')}`)
    ok.push(`2: «${edit}» (A выше на 7) — выравнивание пересчитано: B Z ${t2[2]} (снова заподлицо), X/Y прежние; уведомлений нет; undo / redo — ${tu[2]} ↔ ${tr[2]}; .3dtc — то же`)
    if (s.errors.length) fail('1–2: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── 3: с поворотом — призма боковой гранью к верху куба; правка куба ──
  {
    const s = await session()
    const { page } = s
    const c = await s.add('Куб'); await s.setF(c, 'num-input-pos-X', -10)
    const p = await s.add('Призма'); await s.setF(p, 'num-input-pos-X', 40)
    await s.startAlign(); await s.clickA(c, (n) => n[2] > 0.99); await s.clickB(p, (n) => Math.abs(n[2]) < 0.05)
    const t1 = await s.tr(p)
    if (!near(t1[2], -0.4, 0.11) || Math.max(Math.abs(t1[3]), Math.abs(t1[4])) < 89.9) fail('3: призма ' + t1.join(', '))
    const edit = await editStep(s, 'Переместить', 'first', 'step-delta', 2, 5)
    const t2 = await s.tr(p)
    if (!near(t2[2], 4.6, 0.11) || t2.slice(3).join() !== t1.slice(3).join() || !near(t2[0], t1[0]) || !near(t2[1], t1[1]) || await s.toasts()) fail(`3: после «${edit}» призма ${t2.join(', ')} (была ${t1.join(', ')})`)
    ok.push(`3: призма боковой гранью к верху куба — повёрнута (${t1.slice(3).join(', ')})°, Z ${t1[2]}; «${edit}» — Z ${t2[2]}, поворот и X/Y прежние`)
    void page
    if (s.errors.length) fail('3: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  // ── 4: плоскость по оси Y; правка шага цели ──
  {
    const s = await session()
    const { page } = s
    const k = await s.add('Куб'); await s.setF(k, 'num-input-pos-Y', 40)
    await s.startAlign(); await page.locator('[data-testid=align-axis-Y]').click(); await s.clickB(k, (n) => n[1] < -0.99)
    const t1 = await s.tr(k), row = await lastRow(page)
    if (!near(t1[1], 10) || row.label !== 'Выровнять по плоскости XZ' || row.edits !== 0) fail(`4: куб ${t1.join(', ')}, «${row.label}», ✎ ${row.edits}`)
    const edit = await editStep(s, 'Переместить', 'first', 'step-delta', [[1, 70], [0, 15]])
    const t2 = await s.tr(k)
    if (!near(t2[1], 10) || !near(t2[0], 15) || await s.toasts()) fail(`4: после «${edit}» куб ${t2.join(', ')}`)
    ok.push(`4: плоскость по оси Y — куб Y ${t1[1]}, «${row.label}»; «${edit}» — снова Y ${t2[1]}, X ${t2[0]}`)
    if (s.errors.length) fail('4: ошибки консоли ' + s.errors.join(' | '))
    await s.browser.close()
  }

  console.log('e2e align-plane-resolve OK')
  for (const x of ok) console.log('  ✅ ' + x)
} catch (e) {
  console.error('e2e align-plane-resolve FAIL —', e.message)
  for (const x of ok) console.error('  ✅ ' + x)
  process.exitCode = 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit()
}
