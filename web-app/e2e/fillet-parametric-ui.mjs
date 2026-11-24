// e2e/fillet-parametric-ui.mjs — FILLET-PARAMETRIC-UI: шаги B-Rep в панели свойств.
//
//  A. Куб → цепочка из 2 шагов (fillet 2 + fillet 1.5) → объект с brepChain.
//  B. Панель свойств выбранного объекта показывает «Скругления и фаски (B-Rep)»:
//     два шага с типом, рёбрами и размерами.
//  C. Правка размера первого шага в панели (2 → 3) → edit_step, цепочка пересобрана
//     (число треугольников меняется), отметка ✎ в истории.
//  D. Undo/Redo правки.
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:fillet-parametric-ui`.

import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vp = page.locator('.viewport-canvas')
const rows = page.locator('.ct-item[data-object-id]')
const chainPanel = page.locator('[data-testid=brep-chain-panel]')
const tris = async () => {
  const text = await page.locator('.statusbar').innerText()
  const m = text.match(/Треуг\.:\s*([\d\s]+)/)
  return m ? Number(m[1].replace(/\s/g, '')) : 0
}
const waitBusy = async () => {
  await page.waitForFunction(() => !document.body.innerText.includes('Пересчёт'), null, { timeout: 60000 })
  await page.waitForTimeout(200)
}

async function pickEdge(exclude = []) {
  await toolbarButton(page, 'Скругление / фаска').click()
  await page.locator('[data-testid=brep-menu]').waitFor({ timeout: 5000 })
  await page.locator('[data-testid=brep-menu-fillet]').click()
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') !== null, null, { timeout: 10000 })
  await page.waitForFunction(() => Number(document.querySelector('.viewport-canvas')?.getAttribute('data-brep-edges') ?? 0) >= 9, null, { timeout: 90000 })
  const b = await vp.boundingBox()
  for (let j = 0; j < 22; j++) for (let i = 0; i < 30; i++) {
    const x = b.x + b.width * (0.18 + i * 0.64 / 30)
    const y = b.y + b.height * (0.18 + j * 0.64 / 22)
    await page.mouse.move(x, y)
    await page.waitForTimeout(55)
    const h = await vp.getAttribute('data-brep-hover')
    if (h === null || exclude.includes(Number(h))) continue
    await page.mouse.click(x, y); await page.waitForTimeout(150)
    const sel = (await vp.getAttribute('data-brep-selected')) ?? ''
    if (sel.split(',').filter(Boolean).length) return Number(h)
  }
  fail(`${stage}: ребро не найдено`)
}

async function applyStep(size, timeout = 60000) {
  const input = page.locator('[data-testid=brep-panel] input').first()
  await input.fill(String(size)); await input.press('Enter')
  await page.locator('[data-testid=brep-apply]').click()
try {
    await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') === null, null, { timeout })
  } catch {
    const cancel = page.locator('[data-testid=brep-cancel]')
    if (await cancel.count()) await cancel.click()
    await page.waitForTimeout(300)
    return false
  }
  await waitBusy()
  return true
}

if (!(await toolbarButton(page, 'Скругление / фаска').count())) {
  console.log('e2e fillet-parametric-ui SKIP: OCCT fillet UI скрыт (FILLET-HIDE)')
  await browser.close()
  process.exit(0)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Цепочка из 2 шагов ──
  stage = 'A. цепочка'
  await placeShape(page, 'Куб')
  await rows.first().waitFor({ timeout: 15000 })
  await rows.first().click(); await page.waitForTimeout(200)
  await pickEdge()
  if (!(await applyStep(2))) fail('A: первый fillet не применился')
  const tried = []
  let second = false
  for (let i = 0; i < 4 && !second; i++) {
    const e = await pickEdge(tried); tried.push(e)
    second = await applyStep(1.5, 15000)
    if (!second) { await rows.first().click(); await page.waitForTimeout(200) }
  }
  if (!second) fail('A: второй fillet не применился')
  ok.push('A: цепочка из 2 шагов на кубе')

  // ── B. Панель свойств: два шага ──
  stage = 'B. панель'
  await rows.first().click(); await page.waitForTimeout(300)
  await chainPanel.waitFor({ timeout: 5000 })
  const stepRows = chainPanel.locator('[data-testid^=brep-chain-step-]')
  if ((await stepRows.count()) !== 2) fail(`B: шагов в панели ${await stepRows.count()}, ждали 2`)
  const inputs = chainPanel.locator('input')
  const v0 = Number(await inputs.nth(0).inputValue())
  const v1 = Number(await inputs.nth(1).inputValue())
  if (v0 !== 2 || v1 !== 1.5) fail(`B: размеры в панели ${v0} / ${v1}, ждали 2 / 1.5`)
  const panelText = await chainPanel.innerText()
  if (!panelText.includes('Скругление') || !panelText.includes('Ребро')) fail('B: нет подписей типа/ребра')
  ok.push('B: панель свойств — 2 шага (тип, рёбра, 2 / 1.5)')

  // ── C. Правка размера в панели ──
  stage = 'C. правка'
  const before = await tris()
  await inputs.nth(0).fill('3'); await inputs.nth(0).press('Enter')
  await waitBusy()
  const after = await tris()
  if (after === before) fail(`C: меш не пересобран (${before} → ${after})`)
  if (!(await page.locator('.tl-edited').count())) fail('C: нет отметки ✎ правки в истории')
  if ((await stepRows.count()) !== 2) fail('C: шаги в панели потеряны после правки')
  ok.push(`C: размер шага 1: 2 → 3 в панели, пересборка (${before} → ${after} треуг.)`)

  // ── D. Undo / Redo ──
  stage = 'D. undo/redo'
  await page.keyboard.press('Control+z'); await waitBusy()
  if (await page.locator('.tl-edited').count()) fail('D: undo не убрал правку')
  await page.keyboard.press('Control+y'); await waitBusy()
  if (!(await page.locator('.tl-edited').count())) fail('D: redo не вернул правку')
  ok.push('D: undo/redo правки из панели')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e fillet-parametric-ui OK (шаги B-Rep в панели свойств, правка размера, undo/redo)')
} catch (e) {
  console.error(`e2e fillet-parametric-ui FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
