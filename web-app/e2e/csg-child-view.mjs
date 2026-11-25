// e2e/csg-child-view.mjs — CSG-CHILD-VIEW: окно выбранного ребёнка CSG.
//
//  A. Куб ∪ цилиндр → CSG; выбор цилиндра в дереве открывает маленькое окно:
//     меш только ребёнка + каркас всего CSG.
//  B. Правка параметра цилиндра в панели свойств → CSG и ребёнок пересобраны.
//  C. × закрывает окно; повторный выбор ребёнка снова открывает.
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:csg-child-view`.

import { openApp, panelButton, placeShape } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const view = page.locator('[data-testid=child-view]')
const scene = page.locator('[data-testid=child-view-scene]')

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. CSG и выбор ребёнка ──
  stage = 'A. открытие'
  await placeShape(page, 'Куб')
  await page.waitForTimeout(600)
  await placeShape(page, 'Цилиндр')
  await page.waitForTimeout(600)
  const rows = page.locator('.ct-item[data-object-id]')
  if ((await rows.count()) !== 2) fail(`объектов ${await rows.count()}, ждали 2`)
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 20000 })
  await page.locator('.ct-item[data-object-id] .ct-chevron').click()
  const cyl = page.locator('.ct-child', { hasText: 'Цилиндр' })
  if ((await cyl.count()) !== 1) fail('цилиндр не найден в дереве CSG: ' + (await page.locator('.ct-child').allInnerTexts()).join(' | '))
  await cyl.click()
  await view.waitFor({ timeout: 10000 })
  await scene.waitFor({ timeout: 30000 })
  await page.waitForFunction(() => Number(document.querySelector('[data-testid=child-view-scene]')?.getAttribute('data-child-tris')) > 0, null, { timeout: 30000 })
  if ((await scene.getAttribute('data-root-wireframe')) !== '1') fail('каркас остального CSG не построен')
  if (!(await view.innerText()).includes('Цилиндр')) fail('в заголовке окна нет типа ребёнка')
  ok.push('A: выбор цилиндра в дереве → окно ребёнка (меш ребёнка + каркас CSG)')

  // ── B. Правка ребёнка ──
  stage = 'B. правка'
  const panel = page.locator('[data-testid=child-props]')
  await panel.waitFor({ timeout: 5000 })
  const inputs = panel.locator('input.props-input')
  const fields = await inputs.count()
  if (fields < 2) fail(`у цилиндра ${fields} полей, ждали радиус и высоту`)
  const histBefore = await page.locator('.tl-item').count()
  await inputs.nth(0).fill('16')
  await inputs.nth(0).blur()
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.ct-child')).some((e) => /R16/.test(e.textContent ?? '')),
    null, { timeout: 20000 },
  )
  const histAfter = await page.locator('.tl-item').count()
  if (histAfter <= histBefore) fail('правка не добавила шаг истории')
  await view.waitFor({ timeout: 5000 })
  await page.waitForFunction(() => Number(document.querySelector('[data-testid=child-view-scene]')?.getAttribute('data-child-tris')) > 0, null, { timeout: 20000 })
  ok.push(`B: правка радиуса 10 → 16 — CSG пересобран, окно ребёнка обновлено (${histBefore} → ${histAfter} шагов)`)

  // ── C. Закрыть и открыть снова ──
  stage = 'C. закрыть'
  await page.locator('[data-testid=child-view-close]').click()
  await view.waitFor({ state: 'detached', timeout: 5000 })
  if (await view.count()) fail('окно не закрылось по ×')
  await cyl.click()
  await view.waitFor({ timeout: 5000 })
  ok.push('C: × закрывает окно; повторный выбор ребёнка открывает снова')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e csg-child-view OK (окно ребёнка CSG, правка, закрытие)')
} catch (e) {
  console.error(`e2e csg-child-view FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
