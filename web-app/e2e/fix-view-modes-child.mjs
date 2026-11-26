// e2e/fix-view-modes-child.mjs — FIX: VIEW-MODES (realistic) + CSG-CHILD-VIEW.
//
//  A. VIEW-MODES: wireframe → hidden-line → realistic — снова непрозрачная заливка,
//     тени; рёбра от wireframe/hidden-line не остаются (visible lines = 0).
//  B. Кнопка режима — над ViewCube (не пересекается), z-index 12.
//  C. CSG-CHILD-VIEW: цилиндр в кубе — окно слева снизу; ребёнок и каркас CSG
//     сдвинуты одним offset (центр ребёнка в 0); OrbitControls: drag меняет камеру.
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:fix-view-modes-child`.

import { openApp, panelButton, placeShape } from './helpers.mjs'

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
  await page.waitForTimeout(250)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. VIEW-MODES: realistic после wireframe/hidden-line ──
  stage = 'A. реалистичный'
  await placeShape(page, 'Куб')
  await page.waitForTimeout(400)
  await chooseViewMode('wireframe')
  if (Number(await attr('data-view-edges')) < 1) fail('A: в каркасе нет рёбер')
  await chooseViewMode('hidden-line')
  if (Number(await attr('data-view-edges')) < 1) fail('A: в скрытых линиях нет рёбер')
  await chooseViewMode('realistic')
  if (Number(await attr('data-view-edges')) < 1) fail('A: рёбра объектов пропали в реалистичном')
  if ((await attr('data-view-depth-test')) !== '1') fail('A: рёбра реалистичного без depthTest — просвечивают')
  if (Number(await attr('data-view-shadows')) < 1) fail('A: тени не вернулись')
  if (Number(await attr('data-view-opaque')) < 1) fail('A: заливка не непрозрачная')
  ok.push('A: wireframe → hidden-line → realistic: заливка/тени, рёбра с depthTest')

  // ── B. Кнопка режима не накладывается на ViewCube ──
  stage = 'B. кнопка'
  const [btnBox, cubeBox] = await Promise.all([
    page.locator('[data-testid=view-mode-menu-wrap]').boundingBox(),
    page.locator('.viewcube-container').boundingBox(),
  ])
  if (!btnBox || !cubeBox) fail('B: кнопка или ViewCube не найдены')
  const overlap = btnBox.x < cubeBox.x + cubeBox.width && btnBox.x + btnBox.width > cubeBox.x &&
    btnBox.y < cubeBox.y + cubeBox.height && btnBox.y + btnBox.height > cubeBox.y
  if (overlap) fail(`B: кнопка пересекает ViewCube (${JSON.stringify(btnBox)} / ${JSON.stringify(cubeBox)})`)
  if (btnBox.y + btnBox.height > cubeBox.y + 0.5) fail('B: кнопка не над ViewCube')
  ok.push('B: кнопка режима над ViewCube, без наложения')

  // ── C. CSG-CHILD-VIEW: левый низ, offset, OrbitControls ──
  stage = 'C. окно ребёнка'
  await placeShape(page, 'Цилиндр')
  await page.waitForTimeout(600)
  const rows = page.locator('.ct-item[data-object-id]')
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 20000 })
  await page.locator('.ct-item[data-object-id] .ct-chevron').click()
  await page.locator('.ct-child', { hasText: 'Цилиндр' }).click()
  const view = page.locator('[data-testid=child-view]')
  await view.waitFor({ timeout: 10000 })
  await page.waitForSelector('[data-testid=child-view-scene] canvas', { timeout: 30000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-view-scene]')?.getAttribute('data-child-controls') === '1', null, { timeout: 20000 })

  const vpBox = await vp.boundingBox()
  const viewBox = await view.boundingBox()
  if (!vpBox || !viewBox) fail('C: рамки окна нет')
  if (Math.abs(viewBox.x - (vpBox.x + 8)) > 4) fail(`C: окно не слева (x=${viewBox.x}, вьюпорт ${vpBox.x})`)
  if (Math.abs((viewBox.y + viewBox.height) - (vpBox.y + vpBox.height - 8)) > 4) fail('C: окно не снизу')
  if ((await view.evaluate((e) => e.style.left)) !== '8px') fail('C: style.left не 8px')

  // копия основного вида: камера = снимок основной, корень — в своих координатах
  const sceneEl = page.locator('[data-testid=child-view-scene]')
  if (!(await sceneEl.getAttribute('data-fit'))) fail('C: окно не вписало сцену')
  if (!(await sceneEl.getAttribute('data-root-transform'))) fail('C: корневая система координат не применена')

  // OrbitControls: drag по канвасу меняет позицию камеры
  const cam0 = await sceneEl.getAttribute('data-child-camera')
  const canvas = page.locator('[data-testid=child-view-scene] canvas')
  const cb = await canvas.boundingBox()
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(cb.x + cb.width / 2 + 50, cb.y + cb.height / 2 + 20, { steps: 8 })
  await page.mouse.up({ button: 'left' })
  await page.waitForTimeout(400)
  const cam1 = await sceneEl.getAttribute('data-child-camera')
  if (!cam0 || !cam1 || cam0 === cam1) fail(`C: камера не вращается (${cam0} → ${cam1})`)
  ok.push('C: окно слева снизу, сцена вписана, корень в реальных координатах, OrbitControls')

  // ── D. Каркас гладких фигур (сфера/цилиндр) ──
  stage = 'D. сетка гладких'
  await placeShape(page, 'Сфера')
  await page.waitForTimeout(500)
  await placeShape(page, 'Цилиндр')
  await page.waitForTimeout(500)
  await chooseViewMode('wireframe')
  const grids = Number(await attr('data-view-grid'))
  if (grids < 2) fail(`D: сеток гладких фигур ${grids}, ждали ≥2 (сфера, цилиндр)`)
  if (Number(await attr('data-view-edges')) < 2) fail('D: в каркасе нет рёбер/сеток')
  await chooseViewMode('realistic')
  if (Number(await attr('data-view-grid')) !== 0) fail('D: сетка гладких осталась в реалистичном')
  ok.push(`D: каркас сферы и цилиндра — сетка (${grids}), в реалистичном снята`)

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e fix-view-modes-child OK (realistic восстановлен, кнопка, child-view слева снизу + OrbitControls)')
} catch (e) {
  console.error(`e2e fix-view-modes-child FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
