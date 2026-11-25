// e2e/clean-wireframe.mjs — CLEAN-WIREFRAME: чистый каркас всех фигур.
//
//  A. 10 примитивов + резьба M6 — в каркасе сетки (сфера/цилиндр/конус/тор/
//     капсула/труба/пружина/резьба = 8), только линии (сегментов немного).
//  B. Скрытые линии — те же сетки; реалистичный — без сеток.
//  C. Труба — внутренняя стенка (визуально; в unit — min радиус = innerRadius).
//  D. Резьба — упрощённый контур (6 сегментов/виток; сегментов < 500).
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:clean-wireframe`.

import { openApp, placeShape } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vp = page.locator('.viewport-canvas')
const attr = (name) => vp.getAttribute(name)
const chooseViewMode = async (mode) => {
  const menu = page.locator('[data-testid=view-mode-menu]')
  if (!(await menu.count())) await page.locator('[data-testid=view-mode-button]').click()
  await page.locator(`[data-testid=view-mode-${mode}]`).click()
  await page.waitForFunction((m) => document.querySelector('.viewport-canvas')?.getAttribute('data-view-mode') === m, mode, { timeout: 5000 })
  await page.waitForTimeout(500)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Все фигуры + резьба ──
  stage = 'A. все фигуры'
  for (const s of ['Куб', 'Сфера', 'Цилиндр', 'Конус', 'Тор', 'Призма', 'Пирамида', 'Капсула', 'Труба', 'Пружина']) {
    await placeShape(page, s)
    await page.waitForTimeout(300)
  }
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  await page.locator('[data-testid=thread-modal]').waitFor({ timeout: 10000 })
  await page.locator('[data-testid=thread-create]').click()
  await page.locator('[data-testid=thread-modal]').waitFor({ state: 'detached', timeout: 15000 })
  await page.waitForTimeout(600)

  await chooseViewMode('wireframe')
  const grids = Number(await attr('data-view-grid'))
  const segs = Number(await attr('data-view-grid-segments'))
  if (grids < 8) fail(`A: сеток ${grids}, ждали ≥8 (7 гладких + резьба)`)
  if (segs < 1) fail('A: сетки пустые')
  if (segs > 6000) fail(`A: каркас слишком плотный (${segs} сегментов) — похоже на треугольники`)
  ok.push(`A: 10 примитивов + резьба — ${grids} сеток, ${segs} сегментов (только линии)`)

  // ── B. Скрытые линии / реалистичный ──
  stage = 'B. режимы'
  await chooseViewMode('hidden-line')
  if (Number(await attr('data-view-grid')) < 8) fail('B: в скрытых линиях нет сеток')
  await chooseViewMode('realistic')
  if (Number(await attr('data-view-grid')) !== 0) fail('B: сетка осталась в реалистичном')
  ok.push('B: скрытые линии — сетки, реалистичный — без сеток')

  // ── C/D. Труба и резьба отдельно ──
  stage = 'C. труба/резьба'
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(400)
  await placeShape(page, 'Труба')
  await page.waitForTimeout(500)
  await chooseViewMode('wireframe')
  const tubeGrid = Number(await attr('data-view-grid'))
  if (tubeGrid < 1) fail('C: у трубы нет каркаса')
  // сетка трубы: внешний + внутренний цилиндр (unit: min радиус = innerRadius)
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(400)
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  await page.locator('[data-testid=thread-modal]').waitFor({ timeout: 10000 })
  await page.locator('[data-testid=thread-create]').click()
  await page.locator('[data-testid=thread-modal]').waitFor({ state: 'detached', timeout: 15000 })
  await page.waitForTimeout(600)
  await chooseViewMode('wireframe')
  const threadGrids = Number(await attr('data-view-grid'))
  const threadSegs = Number(await attr('data-view-grid-segments'))
  if (threadGrids < 1) fail('D: у резьбы нет каркаса')
  if (threadSegs > 500) fail(`D: резьба не упрощена (${threadSegs} сегментов)`)
  ok.push(`C/D: труба — каркас; резьба — упрощённый контур (${threadSegs} сегментов)`)

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e clean-wireframe OK (чистый каркас всех фигур, труба, упрощённая резьба)')
} catch (e) {
  console.error(`e2e clean-wireframe FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
