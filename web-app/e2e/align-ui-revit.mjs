// e2e/align-ui-revit.mjs — ALIGN-UI-REVIT: режим выравнивания как в Revit.
//  0) в тулбаре одна кнопка «Выровнять», 9 старых (X мин … Z макс) нет;
//  1) «Выровнять» → панель, подсказка «Выберите плоскость…», курсор crosshair;
//     наведение на куб → подсветка грани (data-align-hover);
//     кнопка Z (плоскость XY) → подсказка «Выберите грань B…» → клик по верхней грани
//     куба B (z = 17) → верх B в z = 0 (центр −10), режим закрылся («Множественное» выкл.);
//  2) режим → клик по верхней грани куба A (z = 10) → плоскость A → клик по верху B →
//     центр B = 0;
//  3) «Множественное» + Z → B (центр −10) → режим остаётся, «Выровнено…» → A (центр −10);
//     Esc → выход; 4) правый клик → выход; уведомлений нет, ошибок нет.
// Кнопки — по aria-label. Грани на экране ищутся сканированием вьюпорта по
// data-align-hover / data-align-hover-normal (подсветка под курсором).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:align-ui-revit` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/align-ui-revit.mjs /tmp/align-ui.png`.
import { openApp, toolbarButton, findAlignFace, placeShape } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const vp = page.locator('.viewport-canvas')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const steps = () => page.locator('.tl-item').count()
const waitSteps = (n) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: 15000 })
const pos = (axis) => right.locator(`#num-input-pos-${axis}`)      // поле позиции (UX-NUMINPUT)
const hint = () => page.locator('[data-testid=align-hint]').textContent()
const panel = page.locator('[data-testid=align-panel]')

async function add(label) {
  const before = new Set(await ids())
  await placeShape(page, label)
  await page.waitForFunction((n) => document.querySelectorAll('.ct-item[data-object-id]').length === n, before.size + 1, { timeout: 15000 })
  return (await ids()).find((id) => !before.has(id))
}
async function pick(id) {
  await row(id).click()
  await page.waitForFunction((k) => {
    const sel = document.querySelectorAll('.ct-item.ct-selected')
    return sel.length === 1 && sel[0].getAttribute('data-object-id') === k
  }, id, { timeout: 5000 })
  await page.waitForTimeout(150)
}
async function setField(id, label, value) {
  await pick(id)
  const f = right.locator(`#num-input-pos-${label}`)                   // позиция X/Y/Z
  const n = await steps()
  await f.fill(String(value)); await f.press('Enter')
  await waitSteps(n + 1)
}
const posZ = async (id) => { await pick(id); return Number(await pos('Z').inputValue()) }

const near = (v, n) => Math.abs(v[0] - n[0]) < 0.05 && Math.abs(v[1] - n[1]) < 0.05 && Math.abs(v[2] - n[2]) < 0.05
/** Грань объекта `id` с нормалью ≈ `normal` на экране (режим должен быть активен). */
const findFace = (id, normal) => findAlignFace(page, id, (v) => near(v, normal))
/** Клик по грани в режиме → ждём новый шаг истории. */
async function clickFaceB(p) {
  const n = await steps()
  await page.mouse.click(p.x, p.y)
  await waitSteps(n + 1)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  const a = await add('Куб')                 // x = 0, z = 0 (20³: верх z = 10)
  const b = await add('Куб')                 // x = 25
  await setField(b, 'Z', 17)
  await setField(b, 'X', 30)

  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('KeyF'); await page.waitForTimeout(800)   // вписать в экран — грани крупнее
  // 0) одна кнопка, старых нет
  if ((await toolbarButton(page, 'Выровнять').count()) !== 1) fail('нет кнопки «Выровнять»')
  for (const old of ['X мин', 'X центр', 'Z макс']) {
    if ((await page.getByRole('button', { name: old, exact: true }).count()) !== 0) fail(`старая кнопка «${old}» осталась`)
  }

  // 1) режим → наведение → Z → грань B
  await toolbarButton(page, 'Выровнять').click()
  await panel.waitFor({ timeout: 5000 })
  if (!(await hint())?.startsWith('Выберите плоскость')) fail('подсказка плоскости: ' + (await hint()))
  if ((await vp.evaluate((el) => getComputedStyle(el).cursor)) !== 'crosshair') fail('курсор не crosshair')
  if ((await vp.getAttribute('data-align-mode')) !== 'plane') fail('data-align-mode ≠ plane')
  const topB = await findFace(b, [0, 0, 1])
  await page.mouse.move(topB.x, topB.y); await page.waitForTimeout(120)
  if (!(await vp.getAttribute('data-align-hover'))?.startsWith(b + ':')) fail('нет подсветки грани при наведении')
  await page.getByRole('radio', { name: 'Z (XY)' }).click()
  if (!(await hint())?.startsWith('Выберите грань B')) fail('подсказка грани B: ' + (await hint()))
  await clickFaceB(topB)
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  if ((await posZ(b)) !== -10) fail(`B после плоскости Z: Z = ${await posZ(b)}, ожидалось −10 (верх в z = 0)`)

  // 2) плоскость = грань A (верх, z = 10) → B
  await toolbarButton(page, 'Выровнять').click()
  await panel.waitFor({ timeout: 5000 })
  const topA = await findFace(a, [0, 0, 1])
  await page.mouse.click(topA.x, topA.y)
  await page.waitForFunction(() => document.querySelector('[data-testid=align-plane]')?.textContent?.includes('грань'), null, { timeout: 5000 })
  if (!(await hint())?.startsWith('Выберите грань B')) fail('после грани A: ' + (await hint()))
  await clickFaceB(await findFace(b, [0, 0, 1]))
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  if ((await posZ(b)) !== 0) fail(`B по грани A: Z = ${await posZ(b)}, ожидалось 0 (верх B = верх A = 10)`)

  // 3) «Множественное»: Z → B, затем A в ту же плоскость; Esc
  await toolbarButton(page, 'Выровнять').click()
  await panel.waitFor({ timeout: 5000 })
  await page.locator('[data-testid=align-multiple]').check()
  await page.getByRole('radio', { name: 'Z (XY)' }).click()
  const topB2 = await findFace(b, [0, 0, 1])
  const topA2 = await findFace(a, [0, 0, 1])
  await clickFaceB(topB2)
  if (!(await panel.isVisible())) fail('«Множественное»: режим закрылся после B')
  if (!(await hint())?.startsWith('Выровнено')) fail('подсказка «Выровнено…»: ' + (await hint()))
  await clickFaceB(topA2)
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'detached', timeout: 5000 })
  if ((await vp.getAttribute('data-align-mode')) !== null) fail('Esc: режим не закрыт')
  if ((await posZ(b)) !== -10) fail(`«Множественное» B: Z = ${await posZ(b)}`)
  if ((await posZ(a)) !== -10) fail(`«Множественное» A: Z = ${await posZ(a)}`)
  if ((await page.locator('.ct-item.ct-selected').count()) !== 1) fail('Esc в режиме не должен снимать выделение')

  // 4) правый клик → выход
  await toolbarButton(page, 'Выровнять').click()
  await panel.waitFor({ timeout: 5000 })
  const b0 = await vp.boundingBox()
  await page.mouse.click(b0.x + 30, b0.y + 30, { button: 'right' })
  await panel.waitFor({ state: 'detached', timeout: 5000 })

  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.length) fail('уведомления: ' + toasts.join(' | '))
  if (shot) await page.screenshot({ path: shot })
  if (errors.length) fail('ошибки страницы: ' + errors.join(' | '))
  console.log('e2e align-ui-revit OK (одна кнопка; Z → верх B в 0; грань A → B; множественное B, A; Esc; правый клик)')
} catch (e) {
  console.error('e2e align-ui-revit FAIL —', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
