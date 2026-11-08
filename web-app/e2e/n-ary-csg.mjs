// e2e/n-ary-csg.mjs — N-ARY-CSG в браузере: union N, subtract/intersect группа A против группы B.
//  A. 10 кубов → выделить все → «Объединение» → ОДИН объект, в дереве 10 детей плоским списком
//     (без вложенных CSG, без заголовков групп, без замков), уведомлений нет; правка ширины
//     5-го ребёнка (9.2/9.3) → W30 в дереве, шаг истории; undo/redo (правка, CSG).
//  B. 5 кубов (A) + 5 сфер в их центрах (B) → «Группа A» (5) → «Группа B» (5) → «Вычитание» →
//     ОДИН объект; в дереве «Группа A» (5 детей), «Группа B» (5 детей); уведомлений нет;
//     undo → группы заново → «Пересечение» → ОДИН объект с теми же группами.
//  C. 31 куб → Ctrl+A → U → предупреждение «много объектов» (мягкий лимит 30), CSG создан: 31 ребёнок.
// Ошибок консоли нет. Логика тех же сценариев в сторе — __tests__/n-ary-csg.test.ts (WASM).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:n-ary-csg` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/n-ary-csg.mjs /tmp/n-ary.png`.
import { openApp, panelButton, toolbarButton, spaceShapeClick } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
let stage = 'старт'
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const steps = () => page.locator('.tl-item').count()
const waitSteps = (n) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: 15000 })
const waitRows = (n, timeout = 30000) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout })
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const children = () => page.locator('.ct-child').evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id')))
const blur = () => page.evaluate(() => document.activeElement?.blur())

async function add(label) {
  const before = new Set(await ids())
  await spaceShapeClick(page, label)                       // UX-AUDIT-9: подряд та же фигура — не «двойной клик»
  await page.getByText(label, { exact: true }).first().click()
  await waitRows(before.size + 1)
  // UX-AUDIT-9 считает 200 мс по времени ОБРАБОТКИ клика в странице, а spaceShapeClick — по
  // часам скрипта: на CPU-рендере (CI) обработка запаздывает, и следующий клик той же фигуры
  // попадал в окно «двойного клика» (31 куб подряд, раздел C). Строка появляется после
  // обработки — выдерживаем паузу от неё.
  await page.waitForTimeout(250)
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
/** Раскрыть единственный корень и дождаться проверки согласованности (9.9). */
async function expandRoot(root, nChildren) {
  await row(root).locator('.ct-chevron').click()
  await page.waitForFunction((n) => document.querySelectorAll('.ct-child').length === n, nChildren, { timeout: 10000 })
  await page.waitForTimeout(1500)
  const locks = await page.locator('[data-testid=ct-lock]').count()
  if (locks) fail(`замки у детей N-арного CSG: ${locks}`)
}
async function clearScene() {
  if ((await objRows.count()) === 0 && (await steps()) === 0) return
  await toolbarButton(page, 'Очистить сцену').click()
  await page.locator('[data-testid=confirm-modal]').getByRole('button', { name: 'Очистить', exact: true }).click()
  await waitRows(0)
}
async function noToasts(where) {
  const t = await toasts()
  if (t) fail(`${where}: неожиданные уведомления: ${t}`)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. union 10 ──
  stage = 'A. union 10'
  const cubes = []
  for (let i = 0; i < 10; i++) cubes.push(await add('Куб'))
  await select(cubes)
  await panelButton(page, 'Объединение').click()
  await waitRows(1)
  const u = (await ids())[0]
  if (!(await row(u).innerText()).includes('CSG')) fail('объединение 10: не CSG: ' + (await row(u).innerText()))
  await expandRoot(u, 10)
  if (JSON.stringify(await children()) !== JSON.stringify(cubes)) fail('объединение 10: дети не по порядку выделения: ' + (await children()).join(','))
  if ((await page.locator('.ct-child .ct-chevron').count()) !== 0) fail('объединение 10: вложенный CSG в дереве (ожидался плоский список)')
  if ((await page.locator('.ct-group-header').count()) !== 0) fail('объединение 10: заголовки групп у union')
  if ((await page.locator('.tl-item', { hasText: 'Объединение' }).count()) !== 1) fail('объединение 10: ожидался ОДИН шаг «Объединение»')
  await noToasts('объединение 10')
  console.log('✅ A. 10 кубов → «Объединение» → один CSG, 10 детей плоским списком, без замков и уведомлений')

  // правка 5-го ребёнка (9.2/9.3) — ребёнок из плоского списка
  stage = 'A. правка ребёнка'
  const fifth = page.locator('.ct-child').nth(4)
  await fifth.click()
  const form = page.locator('[data-testid=child-form]')
  await form.waitFor({ timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
  const inputs = form.locator('input.props-input')
  if ((await inputs.nth(0).inputValue()) !== '20.0') fail('ширина 5-го куба: ' + (await inputs.nth(0).inputValue()))
  const before = await steps()
  await inputs.nth(0).fill('30')
  await inputs.nth(0).blur()
  await page.waitForFunction(() => /W30/.test(document.querySelectorAll('.ct-child')[4]?.textContent ?? ''), null, { timeout: 15000 })
  await waitSteps(before + 1)
  if ((await page.locator('.ct-child', { hasText: 'W30' }).count()) !== 1) fail('правка задела не одного ребёнка')
  await noToasts('правка ребёнка')
  if (shot) await page.screenshot({ path: shot })
  console.log('✅ A. правка ширины 5-го ребёнка 20 → 30: новый шаг, W30 только у него, без уведомлений')

  // undo/redo: правка → CSG → обратно
  stage = 'A. undo/redo'
  await page.locator('.props-header').click(); await blur()
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => !/W30/.test(document.body.innerText), null, { timeout: 15000 })
  await page.keyboard.press('Control+z')
  await waitRows(10)
  await page.keyboard.press('Control+Shift+z')
  await waitRows(1)
  await page.keyboard.press('Control+Shift+z')
  await page.waitForFunction(() => /W30/.test(document.body.innerText), null, { timeout: 15000 })
  await noToasts('undo/redo')
  console.log('✅ A. undo → 10 объектов, redo → один CSG с правкой W30')

  // ── B. subtract / intersect: группа A (5 кубов) против группы B (5 сфер) ──
  stage = 'B. вычитание 5 vs 5'
  await clearScene()
  const A = [], B = []
  for (let i = 0; i < 5; i++) A.push(await add('Куб'))
  for (let i = 0; i < 5; i++) B.push(await add('Сфера'))
  for (let i = 0; i < 5; i++) {
    const p = await readPos(A[i])
    await setField(B[i], 'num-input-pos-X', p.X)
    await setField(B[i], 'num-input-pos-Y', p.Y)
    await setField(B[i], 'num-input-pos-Z', p.Z)
  }
  const assignGroups = async () => {
    await select(A)
    await page.locator('[data-testid=csg-group-a]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid=csg-group-a]')?.textContent === 'Группа A · 5', null, { timeout: 5000 })
    await select(B)
    await page.locator('[data-testid=csg-group-b]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid=csg-group-b]')?.textContent === 'Группа B · 5', null, { timeout: 5000 })
    const badges = await page.locator('[data-testid=ct-csg-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')).sort().join(''))
    if (badges !== 'aaaaabbbbb') fail('метки групп в списке: ' + badges)
  }
  const checkGroupsTree = async (op) => {
    await waitRows(1)
    const r = (await ids())[0]
    await expandRoot(r, 10)
    const headers = await page.locator('.ct-group-header').allTextContents()
    if (JSON.stringify(headers) !== JSON.stringify(['Группа A', 'Группа B'])) fail(`${op}: заголовки групп: ${headers.join(',')}`)
    const order = await page.locator('.ct-group-header, .ct-child').evaluateAll((els) => els.map((e) => e.getAttribute('data-group') ?? e.getAttribute('data-node-id')))
    if (JSON.stringify(order) !== JSON.stringify(['a', ...A, 'b', ...B])) fail(`${op}: порядок в дереве: ${order.join(',')}`)
    if ((await page.locator('[data-testid=ct-csg-group]').count()) !== 0) fail(`${op}: метки групп остались после CSG`)
    await noToasts(op)
  }
  await assignGroups()
  await panelButton(page, 'Вычитание').click()
  await checkGroupsTree('вычитание 5 vs 5')
  console.log('✅ B. «Группа A» (5) → «Группа B» (5) → «Вычитание» → один CSG: «Группа A» 5 детей, «Группа B» 5 детей, без уведомлений')

  await page.locator('.props-header').click(); await blur()
  await page.keyboard.press('Control+z')
  await waitRows(10)
  stage = 'B. пересечение 5 vs 5'
  await assignGroups()
  await panelButton(page, 'Пересечение').click()
  await checkGroupsTree('пересечение 5 vs 5')
  console.log('✅ B. undo → группы заново → «Пересечение» → один CSG с группами A и B')

  // ── C. мягкий лимит 30 ──
  stage = 'C. лимит 30'
  await clearScene()
  for (let i = 0; i < 31; i++) await add('Куб')
  await page.locator('.props-header').click(); await blur()
  await page.keyboard.press('Control+a')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item.ct-selected').length === 31, null, { timeout: 5000 })
  await page.keyboard.press('KeyU')
  await waitRows(1, 60000)
  await page.locator('.toast-msg', { hasText: 'Много объектов' }).waitFor({ timeout: 5000 })
  const t = await toasts()
  if (!/31, больше 30/.test(t)) fail('лимит 30: текст предупреждения: ' + t)
  if (/Ошибка/.test(t)) fail('лимит 30: ошибка вместо предупреждения: ' + t)
  await expandRoot((await ids())[0], 31)
  console.log('✅ C. 31 куб → U → предупреждение «много объектов (31, больше 30)», CSG создан: 31 ребёнок')

  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('N-ARY-CSG e2e: OK')
} catch (e) {
  console.error(`N-ARY-CSG e2e FAIL [${stage}]:`, e.message)
  if (errors.length) console.error(errors.join('\n'))
  await page.screenshot({ path: '/tmp/n-ary-csg-fail.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
