// e2e/align-obb.mjs — ALIGN-REVIT: выравнивание по реальной геометрии с учётом поворота.
//  1) куб 20³ (якорь) + цилиндр (r 10, h 20), повёрнутый на rotY 45 → выделить цилиндр,
//     Shift — куб (якорь — последний) → кнопка тулбара «X мин» (по aria-label) →
//     X min реальной геометрии цилиндра = X min куба: pivot цилиндра = minX куба + 14.1
//     (r·cos45 + h/2·sin45), а не + 10 (рамка без поворота);
//  2) второй куб, повёрнутый rotX 45 → «Z макс» к якорю → pivot Z = 10 − 14.1 = −4.1
//     (ребро у плоскости), а не 0;
//  3) уведомлений нет; undo (кнопка «Отменить») возвращает цилиндр на место до выравнивания.
// Кнопки — по aria-label (`toolbarButton`), не по индексу.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:align-obb` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/align-obb.mjs /tmp/align.png`.
import { openApp, toolbarButton } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const steps = () => page.locator('.tl-item').count()
const waitSteps = (n) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: 15000 })
/** Поле позиции X/Y/Z панели свойств. */
const pos = (axis) => right.locator(`#num-input-pos-${axis}`)
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
/** Поле панели свойств (позиция «X»/«Y»/«Z», поворот «rotX»…) → значение, коммит по Enter → новый шаг. */
const fieldId = (label) => (label.startsWith('rot') ? `num-input-rot-${label.slice(3)}` : `num-input-pos-${label}`)
async function setField(id, label, value) {
  await pick(id)
  const f = right.locator(`#${fieldId(label)}`)
  const n = await steps()
  await f.fill(String(value)); await f.press('Enter')
  await waitSteps(n + 1)
}
/** Выделить цель, затем якорь (Shift) → кнопка тулбара по aria-label → один новый шаг. */
async function align(target, anchor, button) {
  await pick(target)
  await row(anchor).click({ modifiers: ['Shift'] })
  const btn = toolbarButton(page, button)
  if ((await btn.count()) !== 1) fail(`кнопка тулбара «${button}» не найдена по aria-label`)
  if (await btn.isDisabled()) fail(`кнопка «${button}» неактивна при двух выделенных`)
  const n = await steps()
  await btn.click()
  await waitSteps(n + 1)
  if (!(await page.locator('.tl-item').last().textContent())?.includes('Выровнять')) fail('последний шаг — не «Выровнять»')
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  const cube = await add('Куб')
  await pick(cube)
  const cube0 = { x: await num('X'), z: await num('Z') }

  // 1) повёрнутый цилиндр → X мин
  const cyl = await add('Цилиндр')
  await setField(cyl, 'rotY', 45)
  await setField(cyl, 'Y', 40)                                           // не пересекаться с кубом
  await pick(cyl)
  const cylX0 = await num('X')
  await align(cyl, cube, 'X мин')
  await pick(cyl)
  const cylX = await num('X')
  const expectX = cube0.x - 10 + (10 * Math.SQRT1_2 + 10 * Math.SQRT1_2)  // minX куба + r·cos45 + h/2·sin45
  if (!near(cylX, expectX)) fail(`цилиндр X после «X мин»: ${cylX}, ожидалось ≈ ${expectX.toFixed(1)} (без поворота было бы ${cube0.x})`)
  await pick(cube)
  if ((await num('X')) !== cube0.x) fail(`якорь сдвинулся: ${await num('X')} (было ${cube0.x}); цилиндр ${cylX0} → ${cylX}`)

  // 2) повёрнутый куб → Z макс
  const k2 = await add('Куб')
  await setField(k2, 'rotX', 45)
  await setField(k2, 'Y', -40)
  await align(k2, cube, 'Z макс')
  await pick(k2)
  const kz = await num('Z')
  const expectZ = cube0.z + 10 - 10 * Math.SQRT2                         // maxZ куба − половина диагонали грани
  if (!near(kz, expectZ)) fail(`куб Z после «Z макс»: ${kz}, ожидалось ≈ ${expectZ.toFixed(1)} (без поворота было бы ${cube0.z})`)

  // 3) уведомлений нет; undo (Ctrl+Z) ×2 → цилиндр на прежнем X
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.length) fail('уведомления в простом сценарии: ' + toasts.join(' | '))
  // после выравнивания цилиндра — 4 шага (куб, rotX, Y, align) → 5 отмен = до выравнивания
  for (let i = 0; i < 5; i++) { await toolbarButton(page, 'Отменить').click(); await page.waitForTimeout(400) }
  await page.waitForFunction((n) => document.querySelectorAll('.ct-item[data-object-id]').length === n, 2, { timeout: 10000 })
  await pick(cyl)
  if (!near(await num('X'), cylX0, 0.001)) fail(`undo: цилиндр X ${await num('X')}, ожидалось ${cylX0}`)

  if (shot) await page.screenshot({ path: shot })
  const real = errors.filter((e) => !/favicon|DevTools/.test(e))
  if (real.length) fail('ошибки страницы: ' + real.join(' | '))
  console.log(`E2E ALIGN-OBB: OK — цилиндр rotY45 → X мин: X ${cylX} (≈ ${expectX.toFixed(2)}); куб rotX45 → Z макс: Z ${kz} (≈ ${expectZ.toFixed(2)}); кнопки по aria-label; undo ✓`)
} catch (e) {
  console.error('E2E ALIGN-OBB: FAIL —', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
