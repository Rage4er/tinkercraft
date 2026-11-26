// e2e/child-view-copy.mjs — CHILD-VIEW-COPY: копия основного вида.
//
//  A. Куб вне CSG + конус ∪ труба; выбор конуса открывает окно-копию:
//     ребёнок — реалистичный, остальной CSG — каркас, другие объекты — каркас.
//  B. Камера окна = снимок основной камеры (та же позиция/цель), без центровки.
//  C. Корень — в своих координатах (data-root-transform), объекты не смещены.
//  D. OrbitControls вращает камеру окна (как основной вид).
// Ошибок консоли нет. Запуск: `pnpm dev`, затем `pnpm e2e:child-view-copy`.

import { openApp, panelButton, placeShape } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const rows = page.locator('.ct-item[data-object-id]')
const scene = page.locator('[data-testid=child-view-scene]')
const view = page.locator('[data-testid=child-view]')

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Сцена: куб вне CSG + конус ∪ труба ──
  stage = 'A. открытие'
  await placeShape(page, 'Куб'); await page.waitForTimeout(500)
  await placeShape(page, 'Конус'); await page.waitForTimeout(500)
  await placeShape(page, 'Труба'); await page.waitForTimeout(500)
  // CSG — конус + труба (куб остаётся отдельным объектом)
  await rows.nth(1).click()
  await rows.nth(2).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2, null, { timeout: 20000 })
  // корень сдвинут после объединения: ребёнок должен ехать вместе с ним (не в локальной системе)
  const posX = page.locator('.panel-right #num-input-pos-X')
  await posX.fill('60'); await posX.press('Enter')
  await page.waitForTimeout(700)
  const csgRow = page.locator('.ct-item[data-object-id]', { hasText: 'CSG' })
  await csgRow.click()
  await csgRow.locator('.ct-chevron').click()
  await page.locator('.ct-child', { hasText: 'Конус' }).click()
  await view.waitFor({ timeout: 10000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-view-scene]')?.getAttribute('data-child-realistic') === '1', null, { timeout: 30000 })
  const others = Number(await scene.getAttribute('data-others-wireframe') ?? '0')
  if (!(others >= 1)) fail('A: другие объекты не попали в каркас окна')
  if (!(await view.innerText()).includes('Конус')) fail('A: окно показывает не конус')
  ok.push('A: ребёнок (конус) — реалистичный, остальной CSG и куб — каркасом')

  // ── B. Вписать всю сцену (как F в основном виде) ──
  stage = 'B. fitView'
  const fit = await scene.getAttribute('data-fit')
  const center = await scene.getAttribute('data-scene-center')
  if (!fit) fail('B: окно не вписало сцену')
  if (!center) fail('B: центр сцены не задан')
  const mainCam = await scene.getAttribute('data-main-camera')
  if (!mainCam) fail('B: камера основной не передана (ориентация вида)')
  ok.push(`B: сцена вписана (fit ${fit}, центр ${center}), ориентация от основной (${mainCam})`)

  // ── C. Координаты ──
  stage = 'C. координаты'
  const rootT = await scene.getAttribute('data-root-transform')
  if (!rootT) fail('C: система координат корня не применена')
  await page.waitForTimeout(300)
  if ((await scene.getAttribute('data-root-transform')) !== rootT) fail('C: координаты корня изменились без правки')
  const childCenter = (await scene.getAttribute('data-child-center') ?? '').split(',').map(Number)
  const rootPos = rootT.split(',').map(Number)
  if (childCenter.length !== 3 || childCenter.some((v) => !Number.isFinite(v))) fail(`C: центр ребёнка не задан (${childCenter})`)
  // ребёнок (конус = операнд A) стоит там же, где корень CSG, а не в локальном origin
  if (childCenter.some((v, i) => Math.abs(v - rootPos[i]) > 6)) {
    fail(`C: ребёнок не в мировых координатах (${childCenter} vs корень ${rootPos})`)
  }
  ok.push(`C: корень в реальных координатах (${rootT}), ребёнок на месте (${childCenter})`)

  // ── D. OrbitControls ──
  stage = 'D. навигация'
  const canvas = page.locator('[data-testid=child-view-scene]')
  const cb = await canvas.boundingBox()
  const before = await scene.getAttribute('data-child-camera')
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  await page.mouse.move(cb.x + cb.width / 2 + 60, cb.y + cb.height / 2 + 25, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const after = await scene.getAttribute('data-child-camera')
  if (!before || !after || before === after) fail(`D: камера не вращается (${before} → ${after})`)
  ok.push('D: OrbitControls вращает камеру окна')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e child-view-copy OK (копия основного вида, ребёнок реалистичный, каркас, навигация)')
} catch (e) {
  console.error(`e2e child-view-copy FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
