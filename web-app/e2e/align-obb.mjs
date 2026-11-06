// e2e/align-obb.mjs — ALIGN-REVIT: выравнивание по реальной геометрии с учётом поворота.
// С ALIGN-UI-REVIT — через режим «Выровнять» (9 кнопок min/center/max убраны):
//  1) куб A 20³ + цилиндр (r 10, h 20), повёрнутый на rotY 45 → режим → плоскость = правая
//     грань A (+X, x = 10) → клик по грани цилиндра, смотрящей в +X → X max реальной
//     геометрии цилиндра = 10: pivot = 10 − 14.1 (r·cos45 + h/2·sin45), а не 10 − 10
//     (рамка без поворота);
//  2) второй куб, повёрнутый rotX 45 → режим → Z (плоскость XY) → клик по грани, смотрящей
//     вверх → верхнее ребро в z = 0: pivot Z = −14.1 (половина диагонали), а не −10;
//  3) уведомлений нет; undo (кнопка «Отменить») возвращает куб на место.
// Кнопки — по aria-label (`toolbarButton`), грани — сканированием подсветки (`findAlignFace`).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:align-obb` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/align-obb.mjs /tmp/align.png`.
import { openApp, toolbarButton, findAlignFace } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const steps = () => page.locator('.tl-item').count()
const waitSteps = (n) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: 15000 })
/** Первое поле X/Y/Z панели — позиция (у масштаба те же id). */
const pos = (axis) => right.locator(`#num-input-${axis}`).first()
const num = async (axis) => Number(await pos(axis).inputValue())
/** Выделить один объект и дождаться, что панель показывает именно его. */
async function pick(id) {
  await row(id).click()
  await page.waitForFunction((k) => {
    const sel = document.querySelectorAll('.ct-item.ct-selected')
    return sel.length === 1 && sel[0].getAttribute('data-object-id') === k
  }, id, { timeout: 5000 })
  await page.waitForTimeout(150)                                           // перерисовка NumInput
}
const near = (a, b, eps = 0.051) => Math.abs(a - b) <= eps

/** Фигура из палитры; возвращает id нового объекта. */
async function add(label) {
  const before = new Set(await ids())
  await page.getByText(label, { exact: true }).first().click()
  await page.waitForFunction((n) => document.querySelectorAll('.ct-item[data-object-id]').length === n, before.size + 1, { timeout: 15000 })
  return (await ids()).find((id) => !before.has(id))
}
/** Поле панели свойств (`#num-input-<label>`, первое) → значение, коммит по Enter → новый шаг. */
async function setField(id, label, value) {
  await pick(id)
  const f = right.locator(`#num-input-${label}`).first()
  const n = await steps()
  await f.fill(String(value)); await f.press('Enter')
  await waitSteps(n + 1)
}
const panel = page.locator('[data-testid=align-panel]')
/** Клик по точке в режиме выравнивания → новый шаг истории. */
async function clickStep(p) {
  const n = await steps()
  await page.mouse.click(p.x, p.y)
  await waitSteps(n + 1)
}
async function startMode() {
  await toolbarButton(page, 'Выровнять').click()
  await panel.waitFor({ timeout: 5000 })
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  const cube = await add('Куб')
  await pick(cube)
  const cube0 = { x: await num('X'), z: await num('Z') }

  // 1) повёрнутый цилиндр → плоскость = правая грань куба (+X, x = 10)
  const cyl = await add('Цилиндр')
  await setField(cyl, 'rotY', 45)
  await setField(cyl, 'Y', 40)                                           // не пересекаться с кубом
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('KeyF'); await page.waitForTimeout(800)
  await startMode()
  const faceA = await findAlignFace(page, cube, (v) => v[0] > 0.95)
  await page.mouse.click(faceA.x, faceA.y)
  await page.waitForFunction(() => document.querySelector('[data-testid=align-plane]')?.textContent?.includes('грань'), null, { timeout: 5000 })
  await clickStep(await findAlignFace(page, cyl, (v) => v[0] > 0.1 && v[0] < 0.95))
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  await pick(cyl)
  const cylX = await num('X')
  const expectX = cube0.x + 10 - (10 * Math.SQRT1_2 + 10 * Math.SQRT1_2)  // maxX куба − (r·cos45 + h/2·sin45)
  if (!near(cylX, expectX)) fail(`цилиндр X: ${cylX}, ожидалось ≈ ${expectX.toFixed(1)} (без поворота было бы ${cube0.x})`)
  await pick(cube)
  if ((await num('X')) !== cube0.x) fail(`куб A сдвинулся: ${await num('X')}`)

  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('KeyF'); await page.waitForTimeout(800)   // вписать в экран — грани крупнее
  // 2) повёрнутый куб → Z (плоскость XY)
  const k2 = await add('Куб')
  await setField(k2, 'rotX', 45)
  await setField(k2, 'Y', -40)
  await pick(k2)
  const k2z0 = await num('Z')
  await startMode()
  await page.getByRole('radio', { name: 'Z (XY)' }).click()
  await clickStep(await findAlignFace(page, k2, (v) => v[2] > 0.1 && v[2] < 0.95))
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  await pick(k2)
  const kz = await num('Z')
  const expectZ = -10 * Math.SQRT2                                        // верхнее ребро в z = 0
  if (!near(kz, expectZ)) fail(`куб Z: ${kz}, ожидалось ≈ ${expectZ.toFixed(1)} (без поворота было бы −10)`)

  // 3) уведомлений нет; undo → куб на месте
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.length) fail('уведомления в простом сценарии: ' + toasts.join(' | '))
  await toolbarButton(page, 'Отменить').click(); await page.waitForTimeout(400)
  await pick(k2)
  if (!near(await num('Z'), k2z0, 0.001)) fail(`undo: куб Z ${await num('Z')}, ожидалось ${k2z0}`)

  if (shot) await page.screenshot({ path: shot })
  const real = errors.filter((e) => !/favicon|DevTools/.test(e))
  if (real.length) fail('ошибки страницы: ' + real.join(' | '))
  console.log(`E2E ALIGN-OBB: OK — цилиндр rotY45 → грань +X куба: X ${cylX} (≈ ${expectX.toFixed(2)}); куб rotX45 → плоскость XY: Z ${kz} (≈ ${expectZ.toFixed(2)}); режим «Выровнять»; undo ✓`)
} catch (e) {
  console.error('E2E ALIGN-OBB: FAIL —', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
