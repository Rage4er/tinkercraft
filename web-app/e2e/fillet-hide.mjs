// e2e/fillet-hide.mjs — FILLET-HIDE: UI OCCT-скругления скрыт (код оставлен).
//
//  A. В тулбаре нет «Скругление / фаска»; режим выбора рёбер не запускается.
//  B. Панель свойств выбранного объекта не показывает секцию B-Rep; обычные
//     свойства (позиция) на месте — объект не ломается.
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:fillet-hide`.

import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const vp = page.locator('.viewport-canvas')
const rows = page.locator('.ct-item[data-object-id]')

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Меню скрыто ──
  stage = 'A. тулбар'
  if (await toolbarButton(page, 'Скругление / фаска').count()) fail('A: меню «Скругление / фаска» всё ещё в тулбаре')
  if (await page.locator('[data-testid=brep-menu]').count()) fail('A: меню B-Rep присутствует в DOM')
  if (await vp.getAttribute('data-brep-mode')) fail('A: режим B-Rep активен')
  await placeShape(page, 'Куб')
  await rows.first().waitFor({ timeout: 15000 })
  await rows.first().click(); await page.waitForTimeout(300)
  if (await vp.getAttribute('data-brep-mode')) fail('A: режим B-Rep запустился при выборе куба')
  ok.push('A: меню «Скругление / фаска» отсутствует, режим не запускается')

  // ── B. Панель свойств без секции B-Rep ──
  stage = 'B. панель'
  if (await page.locator('[data-testid=brep-chain-panel]').count()) fail('B: секция B-Rep всё ещё в панели свойств')
  const panel = page.locator('.panel-right')
  if (!(await panel.innerText()).includes('Куб')) fail('B: панель свойств не показывает куб')
  if (!(await panel.locator('#num-input-pos-X').count())) fail('B: обычные свойства объекта пропали')
  ok.push('B: секции B-Rep нет, обычные свойства объекта на месте')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e fillet-hide OK (UI OCCT-скругления скрыт, код и старые объекты не ломаются)')
} catch (e) {
  console.error(`e2e fillet-hide FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
