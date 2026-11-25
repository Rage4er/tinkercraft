// e2e/fix-curved-wireframe.mjs — FIX-CURVED-WIREFRAME: каркас всех фигур.
//
//  A. Все примитивы (куб, сфера, цилиндр, конус, тор, призма, пирамида,
//     капсула, труба, пружина): wireframe/hidden-line — сетки гладких (7),
//     realistic — без сеток.
//  B. Пружина отдельно — каркас (спираль) есть.
//  C. CSG union (сфера ∪ цилиндр) — каркас результата.
//  D. CSG subtract (сфера − цилиндр) — каркас результата.
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:fix-curved-wireframe`.

import { openApp, csgAB, panelButton, placeShape } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vp = page.locator('.viewport-canvas')
const attr = (name) => vp.getAttribute(name)
const rows = page.locator('.ct-item[data-object-id]')
const chooseViewMode = async (mode) => {
  const menu = page.locator('[data-testid=view-mode-menu]')
  if (!(await menu.count())) await page.locator('[data-testid=view-mode-button]').click()
  await page.locator(`[data-testid=view-mode-${mode}]`).click()
  await page.waitForFunction((m) => document.querySelector('.viewport-canvas')?.getAttribute('data-view-mode') === m, mode, { timeout: 5000 })
  await page.waitForTimeout(400)
}
const clearScene = async () => {
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.waitForTimeout(400)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Все фигуры ──
  stage = 'A. все фигуры'
  const shapes = ['Куб', 'Сфера', 'Цилиндр', 'Конус', 'Тор', 'Призма', 'Пирамида', 'Капсула', 'Труба', 'Пружина']
  for (const s of shapes) {
    await placeShape(page, s)
    await page.waitForTimeout(350)
  }
  await chooseViewMode('wireframe')
  const gridsWire = Number(await attr('data-view-grid'))
  if (gridsWire < 7) fail(`A: сеток гладких ${gridsWire}, ждали ≥7 (сфера/цилиндр/конус/тор/капсула/труба/пружина)`)
  await chooseViewMode('hidden-line')
  if (Number(await attr('data-view-grid')) < 7) fail('A: в скрытых линиях нет сеток гладких')
  await chooseViewMode('realistic')
  if (Number(await attr('data-view-grid')) !== 0) fail('A: сетка гладких осталась в реалистичном')
  ok.push(`A: 10 примитивов — сетки гладких ${gridsWire} в каркасе/скрытых линиях, в реалистичном нет`)

  // ── B. Пружина ──
  stage = 'B. пружина'
  await clearScene()
  await placeShape(page, 'Пружина')
  await page.waitForTimeout(500)
  await chooseViewMode('wireframe')
  if (Number(await attr('data-view-grid')) < 1) fail('B: у пружины нет каркаса')
  ok.push('B: пружина — спиральный каркас')

  // ── C. CSG union ──
  stage = 'C. CSG union'
  await clearScene()
  await placeShape(page, 'Сфера'); await page.waitForTimeout(500)
  await placeShape(page, 'Цилиндр'); await page.waitForTimeout(500)
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 20000 })
  await chooseViewMode('wireframe')
  if (Number(await attr('data-view-grid')) < 1) fail('C: у CSG union нет каркаса')
  ok.push('C: CSG union — каркас результата')

  // ── D. CSG subtract ──
  stage = 'D. CSG subtract'
  await clearScene()
  await placeShape(page, 'Сфера'); await page.waitForTimeout(500)
  await placeShape(page, 'Цилиндр'); await page.waitForTimeout(500)
  await csgAB(page, 'subtract', () => rows.nth(0).click(), () => rows.nth(1).click())
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 20000 })
  await chooseViewMode('wireframe')
  if (Number(await attr('data-view-grid')) < 1) fail('D: у CSG subtract нет каркаса')
  ok.push('D: CSG subtract — каркас результата')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e fix-curved-wireframe OK (все фигуры, пружина, CSG union/subtract)')
} catch (e) {
  console.error(`e2e fix-curved-wireframe FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
