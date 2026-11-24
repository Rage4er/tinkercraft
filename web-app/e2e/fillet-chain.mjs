// e2e/fillet-chain.mjs — FILLET-CHAIN-BREP: цепочка скруглений на одном объекте.
//
//  A. Куб → «Скругление / фаска» → ребро 1 → 2 мм → «Применить» (объект import_mesh + B-Rep цепочка).
//  B. Этот же объект снова → меню активно → рёбра уже скруглённого тела → ребро 2 → 1.5 мм → «Применить»:
//     в истории два шага «Скругление», каркас снят.
//  C. ✎ первого шага → радиус 2 → 3 → цепочка пересобирается (оба шага), edit_step записан.
//  D. Undo/Redo правки и цепочки.
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:fillet-chain`.

import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vp = page.locator('.viewport-canvas')
const rows = page.locator('.ct-item[data-object-id]')
const brepMode = () => page.evaluate(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') ?? null)
const tris = async () => {
  const text = await page.locator('.statusbar').innerText()
  const m = text.match(/Треуг\.:\s*([\d\s]+)/)
  return m ? Number(m[1].replace(/\s/g, '')) : 0
}
const waitBusy = async () => {
  await page.waitForFunction(() => !document.body.innerText.includes('Пересчёт'), null, { timeout: 60000 })
  await page.waitForTimeout(200)
}

async function pickEdge(kind = 'fillet', exclude = []) {
  const btn = toolbarButton(page, 'Скругление / фаска')
  if (!(await btn.isEnabled())) fail(`${stage}: меню «Скругление / фаска» недоступно (объект без B-Rep?)`)
  await btn.click()
  await page.locator('[data-testid=brep-menu]').waitFor({ timeout: 5000 })
  await page.locator(kind === 'fillet' ? '[data-testid=brep-menu-fillet]' : '[data-testid=brep-menu-chamfer]').click()
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') !== null, null, { timeout: 10000 })
  await page.waitForFunction(() => Number(document.querySelector('.viewport-canvas')?.getAttribute('data-brep-edges') ?? 0) >= 9, null, { timeout: 90000 })
  const b = await vp.boundingBox()
  for (let j = 0; j < 22; j++) {
    for (let i = 0; i < 30; i++) {
      const x = b.x + b.width * (0.18 + i * 0.64 / 30)
      const y = b.y + b.height * (0.18 + j * 0.64 / 22)
      await page.mouse.move(x, y)
      await page.waitForTimeout(55)
      const h = await vp.evaluate((el) => el.getAttribute('data-brep-hover'))
      if (h === null || exclude.includes(Number(h))) continue
      await page.mouse.click(x, y)
      await page.waitForTimeout(150)
      const sel = (await vp.getAttribute('data-brep-selected')) ?? ''
      if (!sel.split(',').filter(Boolean).length) continue
      return Number(h)
    }
  }
  fail(`${stage}: ребро под курсором не найдено`)
}

async function applyStep(size, timeout = 60000) {
  const input = page.locator('[data-testid=brep-panel] input').first()
  await input.fill(String(size)); await input.press('Enter')
  await page.locator('[data-testid=brep-apply]').click()
try {
    await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') === null, null, { timeout })
  } catch {
    // OCCT отказал (радиус не подходит к соседним граням) — отменяем и пробуем другое ребро
    const cancel = page.locator('[data-testid=brep-cancel]')
    if (await cancel.count()) await cancel.click()
    await page.waitForTimeout(300)
    return false
  }
  await waitBusy()
  return true
}

if (!(await toolbarButton(page, 'Скругление / фаска').count())) {
  console.log('e2e fillet-chain SKIP: OCCT fillet UI скрыт (FILLET-HIDE)')
  await browser.close()
  process.exit(0)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Первый шаг ──
  stage = 'A. первое ребро'
  await placeShape(page, 'Куб')
  await rows.first().waitFor({ timeout: 15000 })
  await rows.first().click(); await page.waitForTimeout(200)
  const e1 = await pickEdge()
  await applyStep(2)
  if ((await page.locator('.tl-item', { hasText: 'Скругление' }).count()) !== 1) fail('A: нет шага «Скругление»')
  if ((await vp.getAttribute('data-brep-lines')) !== '0') fail('A: каркас рёбер остался')
  ok.push(`A: ребро #${e1} → fillet 2, шаг «Скругление»`)

  // ── B. Второй шаг на том же объекте (B-Rep цепочка) ──
  stage = 'B. второе ребро'
  const cls = (await rows.first().getAttribute('class')) ?? ''
  if (!cls.includes('ct-selected')) {
    await rows.first().click(); await page.waitForTimeout(200)
  }
  const tried = []
  let e2 = null
  for (let attempt = 0; attempt < 4 && e2 === null; attempt++) {
    const idx = await pickEdge('fillet', tried)
    tried.push(idx)
    if (await applyStep(1.5, 15000)) e2 = idx
    else if (attempt < 3) {
      // вернуть выделение на объект и открыть режим заново
      await rows.first().click(); await page.waitForTimeout(200)
    }
  }
  if (e2 === null) fail(`B: ни одно ребро не приняло fillet 1.5 (пробовали: ${tried.join(',')})`)
  const steps = await page.locator('.tl-item', { hasText: 'Скругление' }).count()
  if (steps !== 2) fail(`B: шагов «Скругление» ${steps}, ждали 2`)
  if ((await vp.getAttribute('data-brep-lines')) !== '0') fail('B: каркас после второй операции остался')
  ok.push(`B: ребро #${e2} на том же объекте → fillet 1.5, цепочка из 2 шагов`)

  // ── C. ✎ первого шага: радиус 2 → 3 (пересборка всей цепочки) ──
  stage = 'C. правка радиуса'
  const before = await tris()
  const first = page.locator('.tl-item', { hasText: 'Скругление' }).first()
  await first.locator('.tl-edit').click()
  await page.locator('[data-testid=step-panel]').waitFor({ timeout: 5000 })
  const sizeField = page.locator('[data-testid=step-fillet-brep] input').first()
  await sizeField.fill('3'); await sizeField.press('Enter')
  await waitBusy()
  if (!(await page.locator('.tl-edited').count())) fail('C: нет отметки ✎ правки шага')
  const after = await tris()
  if (after === before) fail(`C: цепочка не пересобрана (треугольники ${before} → ${after})`)
  if ((await page.locator('.tl-item', { hasText: 'Скругление' }).count()) !== 2) fail('C: шаги цепочки потеряны при правке')
  ok.push(`C: ✎ шага 1 → радиус 2 → 3, цепочка пересобрана (${before} → ${after} треуг.)`)

  // ── D. Undo / Redo ──
  stage = 'D. undo/redo'
  await page.keyboard.press('Control+z'); await waitBusy()
  if (await page.locator('.tl-edited').count()) fail('D: undo не убрал правку радиуса')
  await page.keyboard.press('Control+y'); await waitBusy()
  if (!(await page.locator('.tl-edited').count())) fail('D: redo не вернул правку радиуса')
  ok.push('D: undo/redo правки радиуса цепочки')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e fillet-chain OK (2 ребра на одном объекте, B-Rep цепочка, правка радиуса, undo/redo)')
} catch (e) {
  console.error(`e2e fillet-chain FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
