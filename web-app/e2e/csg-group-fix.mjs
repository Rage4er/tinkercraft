// e2e/csg-group-fix.mjs — CSG-GROUP-FIX в браузере: кнопок «Группа A/B» нет, вычитание и
// пересечение — режим A → B → Enter, объединение — сразу.
//  A. 2 выбранных → в панели только «Объединение» / «Вычитание» / «Пересечение» (ни кнопок групп,
//     ни счётчиков, ни «×»).
//  B. 5 кубов (A) + 5 сфер в их центрах (B): выделить A → «Вычитание» (тулбар) → режим: в статус-баре
//     «Вычитание: выберите вторую группу (A: 5, B: 0)», «ОК» недоступна, выделение снято, у A метки «A»,
//     «Вычитание» нажата, «Объединение» недоступно → Esc → режима нет, 10 объектов, история та же,
//     выделение снова A.
//  C. A → X → B → Enter → ОДИН объект: «Группа A» (5) и «Группа B» (5) в дереве, шаг «Вычитание»,
//     уведомлений нет.
//  D. undo → A → «Пересечение» → B → «ОК» → ОДИН объект с группами A и B.
//  E. undo → A → «Вычитание» → B → «Вычитание» ещё раз (= «ОК») → ОДИН объект.
//  F. undo → все 10 → «Объединение» → ОДИН объект сразу (режима не было), 10 детей без заголовков.
// Ошибок консоли нет. Логика — __tests__/csg-group-fix.test.tsx (WASM).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:csg-group-fix` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/csg-group-fix.mjs /tmp/shots`.
import os from 'node:os'
import path from 'node:path'
import { openApp, panelButton, toolbarButton, spaceShapeClick, csgModeStart, csgModeConfirm } from './helpers.mjs'

const shotDir = process.argv[2]
const { browser, page, errors } = await openApp()
let stage = 'старт'
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const selected = () => page.locator('.ct-item.ct-selected').evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const steps = () => page.locator('.tl-item').count()
const waitSteps = (n) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: 15000 })
const waitRows = (n, timeout = 30000) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout })
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const blur = () => page.evaluate(() => document.activeElement?.blur())
const modeBar = page.locator('[data-testid=csg-mode]')
const hint = () => page.locator('[data-testid=csg-mode-hint]').textContent()
const badges = () => page.locator('[data-testid=ct-csg-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')).sort().join(''))
const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }

async function add(label) {
  const before = new Set(await ids())
  await spaceShapeClick(page, label)                       // UX-AUDIT-9: подряд та же фигура — не «двойной клик»
  await page.getByText(label, { exact: true }).first().click()
  await waitRows(before.size + 1)
  await page.waitForTimeout(250)                           // окно «двойного клика» — от обработки клика (CI)
  return (await ids()).find((id) => !before.has(id))
}
async function pick(id) {
  await row(id).click()
  await page.waitForFunction((k) => {
    const sel = document.querySelectorAll('.ct-item.ct-selected')
    return sel.length === 1 && sel[0].getAttribute('data-object-id') === k
  }, id, { timeout: 5000 })
  await page.waitForTimeout(100)
}
/** Выделить объекты (клик по первому, Shift+клик по остальным). */
async function select(list) {
  await pick(list[0])
  for (const id of list.slice(1)) await row(id).click({ modifiers: ['Shift'] })
  await page.waitForFunction((n) => document.querySelectorAll('.ct-item.ct-selected').length === n, list.length, { timeout: 5000 })
}
async function setField(id, fieldId, value) {
  await pick(id)
  const f = right.locator(`#${fieldId}`)
  if ((await f.inputValue()) === Number(value).toFixed(1)) return
  const n = await steps()
  await f.fill(String(value)); await f.press('Enter')
  await waitSteps(n + 1)
}
async function readPos(id) {
  await pick(id)
  const v = async (a) => Number(await right.locator(`#num-input-pos-${a}`).inputValue())
  return { X: await v('X'), Y: await v('Y'), Z: await v('Z') }
}
async function noToasts(where) {
  const t = await toasts()
  if (t) fail(`${where}: неожиданные уведомления: ${t}`)
}
const cls = async (loc) => (await loc.getAttribute('class')) ?? ''

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── сцена: 5 кубов (A) + 5 сфер в их центрах (B) ──
  stage = 'сцена'
  const A = [], B = []
  for (let i = 0; i < 5; i++) A.push(await add('Куб'))
  for (let i = 0; i < 5; i++) B.push(await add('Сфера'))
  for (let i = 0; i < 5; i++) {
    const p = await readPos(A[i])
    await setField(B[i], 'num-input-pos-X', p.X)
    await setField(B[i], 'num-input-pos-Y', p.Y)
    await setField(B[i], 'num-input-pos-Z', p.Z)
  }

  // ── A. кнопок групп нет ──
  stage = 'A. кнопок групп нет'
  await select([A[0], B[0]])
  const csgSection = right.locator('.csg-group', { has: page.locator('.csg-group-title', { hasText: 'CSG операции' }) })
  const names = await csgSection.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  if (JSON.stringify(names) !== JSON.stringify(['Объединение', 'Вычитание', 'Пересечение'])) fail('кнопки секции CSG: ' + names.join(', '))
  if ((await page.locator('[data-testid^=csg-group], [data-testid=csg-groups-clear]').count()) !== 0) fail('кнопки групп в интерфейсе')
  if ((await page.getByRole('button', { name: /Группа/ }).count()) !== 0) fail('кнопка «Группа …» в интерфейсе')
  console.log('✅ A. 2 выбранных → в панели только «Объединение» / «Вычитание» / «Пересечение», кнопок групп нет')

  // ── B. режим: A зафиксирована → Esc — отмена ──
  stage = 'B. режим и Esc'
  const steps0 = await steps()
  await select(A)
  await csgModeStart(page, 'subtract', 'toolbar')
  if ((await hint()) !== 'Вычитание: выберите вторую группу (A: 5, B: 0). Enter — ОК, Esc — отмена') fail('подсказка режима: ' + (await hint()))
  if (!(await page.locator('[data-testid=csg-mode-ok]').isDisabled())) fail('«ОК» доступна без группы B')
  if ((await selected()).length !== 0) fail('выделение не снято при входе в режим: ' + (await selected()).join(','))
  if ((await badges()) !== 'aaaaa') fail('метки группы A: ' + (await badges()))
  if (!(await cls(toolbarButton(page, 'Вычитание'))).includes('active')) fail('«Вычитание» не нажата в режиме')
  if (!(await toolbarButton(page, 'Объединение').isDisabled())) fail('«Объединение» доступно в режиме')
  await shot('csg-mode-a.png')
  await select(B)
  if ((await hint()) !== 'Вычитание: выберите вторую группу (A: 5, B: 5). Enter — ОК, Esc — отмена') fail('подсказка с B: ' + (await hint()))
  if ((await badges()) !== 'aaaaabbbbb') fail('метки A / B: ' + (await badges()))
  await shot('csg-mode-ab.png')
  await blur(); await page.keyboard.press('Escape')
  await modeBar.waitFor({ state: 'detached', timeout: 5000 })
  if ((await objRows.count()) !== 10) fail('Esc: объектов ' + (await objRows.count()))
  if ((await steps()) !== steps0) fail(`Esc: шагов ${await steps()} (было ${steps0})`)
  if (JSON.stringify((await selected()).sort()) !== JSON.stringify([...A].sort())) fail('Esc: выделение не A: ' + (await selected()).join(','))
  if ((await badges()) !== '') fail('Esc: метки групп остались')
  await noToasts('Esc')
  console.log('✅ B. A (5) → «Вычитание» → режим (A: 5, метки «A», выделение снято, «ОК» недоступна) → B → Esc → без изменений, выделение A')

  const checkGroupsTree = async (op) => {
    await waitRows(1)
    if (await modeBar.count()) fail(`${op}: режим не закрылся`)
    const r = (await ids())[0]
    await row(r).locator('.ct-chevron').click()
    await page.waitForFunction(() => document.querySelectorAll('.ct-child').length === 10, null, { timeout: 10000 })
    await page.waitForTimeout(1500)
    if (await page.locator('[data-testid=ct-lock]').count()) fail(`${op}: замки у детей`)
    const order = await page.locator('.ct-group-header, .ct-child').evaluateAll((els) => els.map((e) => e.getAttribute('data-group') ?? e.getAttribute('data-node-id')))
    if (JSON.stringify(order) !== JSON.stringify(['a', ...A, 'b', ...B])) fail(`${op}: порядок в дереве: ${order.join(',')}`)
    await noToasts(op)
  }
  const undoTo10 = async () => {
    await page.locator('.props-header').click(); await blur()
    await page.keyboard.press('Control+z')
    await waitRows(10)
  }

  // ── C. A → X → B → Enter ──
  stage = 'C. вычитание Enter'
  await csgModeStart(page, 'subtract', 'key')          // выделение после Esc — снова A
  await select(B)
  await csgModeConfirm(page, 'enter')
  await checkGroupsTree('вычитание')
  const last = (await page.locator('.tl-item').last().innerText()).replace(/\s+/g, ' ')
  if (!last.includes('Вычитание')) fail('шаг истории: ' + last)
  await shot('csg-mode-result.png')
  console.log('✅ C. A (5) → X → B (5) → Enter → один CSG «A − B»: «Группа A» 5, «Группа B» 5, шаг «Вычитание», без уведомлений')

  // ── D. пересечение — «ОК» ──
  stage = 'D. пересечение ОК'
  await undoTo10()
  await select(A)
  await csgModeStart(page, 'intersect', 'toolbar')
  await select(B)
  await csgModeConfirm(page, 'ok')
  await checkGroupsTree('пересечение')
  console.log('✅ D. undo → A → «Пересечение» → B → «ОК» → один CSG с группами A и B')

  // ── E. та же кнопка ещё раз = «ОК» ──
  stage = 'E. кнопка ещё раз'
  await undoTo10()
  await select(A)
  await csgModeStart(page, 'subtract', 'toolbar')
  await select(B)
  await toolbarButton(page, 'Вычитание').click()
  await checkGroupsTree('вычитание (кнопка ещё раз)')
  console.log('✅ E. A → «Вычитание» → B → «Вычитание» ещё раз → один CSG')

  // ── F. объединение — сразу ──
  stage = 'F. объединение'
  await undoTo10()
  await select([...A, ...B])
  await panelButton(page, 'Объединение').click()
  await waitRows(1)
  if (await modeBar.count()) fail('объединение: появился режим')
  const u = (await ids())[0]
  await row(u).locator('.ct-chevron').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-child').length === 10, null, { timeout: 10000 })
  if (await page.locator('.ct-group-header').count()) fail('объединение: заголовки групп')
  await noToasts('объединение')
  console.log('✅ F. 10 выбранных → «Объединение» → один CSG сразу (без режима), 10 детей')

  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('CSG-GROUP-FIX e2e: OK')
} catch (e) {
  console.error(`CSG-GROUP-FIX e2e FAIL [${stage}]:`, e.message)
  if (errors.length) console.error(errors.join('\n'))
  await page.screenshot({ path: path.join(os.tmpdir(), 'csg-group-fix-fail.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
