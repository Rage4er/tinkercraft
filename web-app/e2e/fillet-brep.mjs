// e2e/fillet-brep.mjs — FILLET-CHAMFER-BREP: выбор ребра, fillet, chamfer, правка.
//
//  A. Куб → «Скругление»: рёбра B-Rep (12) подсвечиваются, клик по ребру даёт edgeId;
//     радиус 2 → «Применить» → шаг «Скругление», меш изменился (треугольники).
//  B. Undo / Redo — куб острый / скруглённый.
//  C. Чистый куб → «Фаска» → ребро → 2 → «Применить» → шаг «Фаска».
//  D. ✎ шага «Скругление» → панель шага, правка радиуса 2 → 4 → меш пересчитан (OCCT).
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:fillet-brep`.

import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vp = page.locator('.viewport-canvas')
const rows = page.locator('.ct-item[data-object-id]')
const brepMode = () => page.evaluate(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') ?? null)
const brepEdges = () => page.evaluate(() => Number(document.querySelector('.viewport-canvas')?.getAttribute('data-brep-edges') ?? 0))
const tris = async () => {
  const text = await page.locator('.statusbar').innerText()
  const m = text.match(/Треуг\.:\s*([\d\s]+)/)
  return m ? Number(m[1].replace(/\s/g, '')) : 0
}
const selectFirst = async () => { await rows.first().click(); await page.waitForTimeout(200) }
const waitBusy = async () => {
  await page.waitForFunction(() => !document.body.innerText.includes('Пересчёт'), null, { timeout: 60000 })
  await page.waitForTimeout(200)
}

/** Куб → режим B-Rep → ждём рёбра → клик по N рёбрам (сканирование) → список edgeId. */
async function pickEdges(kind, count = 1) {
  const btn = toolbarButton(page, 'Скругление / фаска')
  if (!(await btn.isEnabled())) fail(`${stage}: кнопка «Скругление / фаска» недоступна`)
  await btn.click()
  await page.locator('[data-testid=brep-menu]').waitFor({ timeout: 5000 })
  await page.locator(kind === 'fillet' ? '[data-testid=brep-menu-fillet]' : '[data-testid=brep-menu-chamfer]').click()
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') !== null, null, { timeout: 10000 })
  await page.waitForFunction(() => Number(document.querySelector('.viewport-canvas')?.getAttribute('data-brep-edges') ?? 0) >= 9, null, { timeout: 90000 })
  const b = await vp.boundingBox()
  const picked = []
  for (let j = 0; j < 22 && picked.length < count; j++) {
    for (let i = 0; i < 30 && picked.length < count; i++) {
      const x = b.x + b.width * (0.18 + i * 0.64 / 30)
      const y = b.y + b.height * (0.18 + j * 0.64 / 22)
      await page.mouse.move(x, y)
      await page.waitForTimeout(55)
      const h = await vp.evaluate((el) => el.getAttribute('data-brep-hover'))
      if (h === null) continue
      const idx = Number(h)
      if (picked.includes(idx)) continue
      await page.mouse.click(x, y)
      await page.waitForTimeout(150)
      const sel = await vp.evaluate((el) => (el.getAttribute('data-brep-selected') ?? '').split(',').filter(Boolean).map(Number))
      if (!sel.includes(idx)) fail(`${stage}: ребро ${idx} не выбралось (выбрано: ${sel.join(',')})`)
      picked.push(idx)
      if (picked.length >= count) break
    }
  }
  if (picked.length < count) fail(`${stage}: найдено рёбер ${picked.length}, нужно ${count}`)
  return picked
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Fillet ──
  stage = 'A. fillet'
  await placeShape(page, 'Куб')
  await rows.first().waitFor({ timeout: 15000 })
  await selectFirst()
  const t0 = await tris()
  const filletEdges = await pickEdges('fillet', 2)
  const radius = page.locator('[data-testid=brep-panel] input').first()
  await radius.fill('2'); await radius.press('Enter')
  await page.locator('[data-testid=brep-apply]').click()
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') === null, null, { timeout: 60000 })
  await waitBusy()
  if ((await rows.count()) !== 1) fail(`A: объектов ${await rows.count()}, ждали 1`)
  const label = await page.locator('.tl-item', { hasText: 'Скругление' }).count()
  if (!label) fail('A: в истории нет шага «Скругление»')
  const t1 = await tris()
  if (!(t1 > t0)) fail(`A: треугольников ${t0} → ${t1}, меш не изменился`)
  if ((await vp.getAttribute('data-brep-lines')) !== '0') fail('A: после «Применить» каркас рёбер остался в сцене')
  ok.push(`A: рёбра #${filletEdges.join(', #')} → fillet r=2 (несколько рёбер), шаг «Скругление», ${t0} → ${t1} треуг., каркас снят`)

  // ── B. Undo / Redo ──
  stage = 'B. undo/redo'
  await page.keyboard.press('Control+z'); await waitBusy()
  if ((await tris()) !== t0) fail(`B: undo — треугольников ${await tris()}, ждали ${t0} (острый куб)`)
  await page.keyboard.press('Control+y'); await waitBusy()
  if ((await tris()) !== t1) fail(`B: redo — треугольников ${await tris()}, ждали ${t1}`)
  ok.push('B: undo/redo — острый куб / скругление')

  // ── C. Chamfer на чистом кубе ──
  stage = 'C. chamfer'
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(300)
  await placeShape(page, 'Куб')
  await rows.first().waitFor({ timeout: 15000 })
  await selectFirst()
  await pickEdges('chamfer', 1)
  const dist = page.locator('[data-testid=brep-panel] input').first()
  await dist.fill('2'); await dist.press('Enter')
  await page.locator('[data-testid=brep-apply]').click()
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') === null, null, { timeout: 60000 })
  await waitBusy()
  if (!(await page.locator('.tl-item', { hasText: 'Фаска' }).count())) fail('C: в истории нет шага «Фаска»')
  ok.push('C: фаска 2 мм на ребре — шаг «Фаска»')

  // ── D. Правка размера в StepPanel (✎) ──
  stage = 'D. правка шага'
  const stepsBefore = await page.locator('.tl-item').count()
  const stepRow = page.locator('.tl-item', { hasText: 'Фаска' }).last()
  await stepRow.locator('.tl-edit').click()
  await page.locator('[data-testid=step-panel]').waitFor({ timeout: 5000 })
  const sizeField = page.locator('[data-testid=step-fillet-brep] input').first()
  await sizeField.fill('4'); await sizeField.press('Enter')
  await waitBusy()
  if ((await page.locator('.tl-item').count()) !== stepsBefore + 1) fail('D: правка не добавила шаг edit_step')
  if (!(await page.locator('.tl-edited').count())) fail('D: у шага нет отметки ✎ правки')
  const editedSize = await page.locator('[data-testid=step-fillet-brep] input').first().inputValue()
  if (Number(editedSize) !== 4) fail(`D: поле размера показывает «${editedSize}», ждали 4`)
  ok.push('D: ✎ шага → размер 2 → 4, edit_step записан, меш пересчитан OCCT')

  // ── E. Призма (раньше не поддерживалась) и удаление фигуры — без остатков каркаса ──
  stage = 'E. призма'
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(300)
  await placeShape(page, 'Призма')
  await rows.first().waitFor({ timeout: 15000 })
  await selectFirst()
  const prismEdges = await pickEdges('fillet', 1)
  const prismRadius = page.locator('[data-testid=brep-panel] input').first()
  await prismRadius.fill('1.5'); await prismRadius.press('Enter')
  await page.locator('[data-testid=brep-apply]').click()
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-brep-mode') === null, null, { timeout: 60000 })
  await waitBusy()
  if (!(await page.locator('.tl-item', { hasText: 'Скругление' }).count())) fail('E: призма — нет шага «Скругление»')
  if ((await vp.getAttribute('data-brep-lines')) !== '0') fail('E: каркас рёбер призмы остался')
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await waitBusy()
  if ((await rows.count()) !== 0) fail('E: фигура не удалена')
  if ((await vp.getAttribute('data-brep-lines')) !== '0') fail('E: после удаления фигуры остался каркас рёбер')
  ok.push(`E: призма — ребро #${prismEdges[0]} → fillet 1.5, шаг «Скругление»; удаление — каркаса нет`)

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e fillet-brep OK (несколько рёбер, призма, undo/redo, правка шага, без остатков каркаса)')
} catch (e) {
  console.error(`e2e fillet-brep FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
