// e2e/nested-moved-edit.mjs — NESTED-MOVED-EDIT: правка ребёнка вложенного CSG,
// сдвинутого и повёрнутого ДО объединения.
//  куб ∪ сфера → G → X = 60, rotZ = 30 (два шага) → G ∪ цилиндр → H →
//  в дереве H: замков нет → раскрыть вложенный G → выбрать сферу → форма (радиус 12) →
//  радиус 16 (blur) → новый шаг «Правка размера ребёнка CSG», сводка R16, уведомлений
//  об отказе нет; undo → R12, redo → R16.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:nested-moved-edit` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/nested-moved-edit.mjs /tmp/nested.png`.
import { openApp, panelButton, toolbarButton, spaceShapeClick } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const steps = () => page.locator('.tl-item').count()
const waitSteps = (n) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: 15000 })
const waitRows = (n) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: 15000 })

async function add(label) {
  const before = new Set(await ids())
  await spaceShapeClick(page, label)                       // UX-AUDIT-9: подряд та же фигура — не «двойной клик»
  await page.getByText(label, { exact: true }).first().click()
  await waitRows(before.size + 1)
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
async function setField(id, fieldId, value) {
  await pick(id)
  const f = right.locator(`#${fieldId}`)
  const n = await steps()
  await f.fill(String(value)); await f.press('Enter')
  await waitSteps(n + 1)
}
async function union(a, b) {
  const before = new Set(await ids())
  await row(a).click()
  await row(b).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await waitRows(before.size - 1)
  return (await ids()).find((id) => !before.has(id))
}
/** Сводка параметров ребёнка-сферы в дереве (R…). */
const sphereText = () => page.locator('.ct-child', { hasText: 'Сфера' }).first().innerText()

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  const cube = await add('Куб')
  const sphere = await add('Сфера')
  await setField(sphere, 'num-input-pos-X', 14)                  // сфера пересекает куб
  const g = await union(cube, sphere)
  // трансформ G ДО объединения: сдвиг и поворот (два шага истории)
  await setField(g, 'num-input-pos-X', 60)
  await setField(g, 'num-input-rot-Z', 30)
  const cyl = await add('Цилиндр')
  const h = await union(g, cyl)

  // дерево H: раскрыть корень и вложенный G; замков нет
  await row(h).locator('.ct-chevron').click()
  await page.locator('.ct-child .ct-chevron').first().click()
  await page.locator('.ct-child', { hasText: 'Сфера' }).waitFor({ timeout: 5000 })
  await page.waitForTimeout(1500)                                 // проверка согласованности корня (9.9)
  if ((await page.locator('[data-testid=ct-lock]').count()) !== 0) {
    const reasons = await page.locator('[data-testid=ct-lock]').evaluateAll((els) => els.map((e) => e.getAttribute('data-reason')))
    fail('замки у детей сдвинутого вложенного CSG: ' + reasons.join(','))
  }
  if (!(await sphereText()).includes('R12')) fail('сводка сферы до правки: ' + (await sphereText()))

  // выбрать сферу → форма → радиус 12 → 16
  await page.locator('.ct-child', { hasText: 'Сфера' }).first().click()
  const form = page.locator('[data-testid=child-form]')
  await form.waitFor({ timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
  if ((await page.locator('[data-testid=child-not-editable], [data-testid=child-unavailable]').count()) !== 0) fail('правка недоступна')
  const radius = form.locator('input.props-input').first()
  if ((await radius.inputValue()) !== '12.0') fail('радиус до правки: ' + (await radius.inputValue()))
  const n = await steps()
  await radius.fill('16')
  await radius.blur()
  await waitSteps(n + 1)
  if (!(await page.locator('.tl-item').last().textContent())?.includes('Правка')) fail('последний шаг — не правка ребёнка')
  await page.waitForFunction(() => /R16/.test([...document.querySelectorAll('.ct-child')].map((e) => e.textContent).join('|')), null, { timeout: 10000 })
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.length) fail('уведомления: ' + toasts.join(' | '))
  if (shot) await page.screenshot({ path: shot })

  // undo → R12, redo → R16
  await toolbarButton(page, 'Отменить').click()
  await page.waitForFunction(() => /R12/.test([...document.querySelectorAll('.ct-child')].map((e) => e.textContent).join('|')), null, { timeout: 10000 })
  await toolbarButton(page, 'Повторить').click()
  await page.waitForFunction(() => /R16/.test([...document.querySelectorAll('.ct-child')].map((e) => e.textContent).join('|')), null, { timeout: 10000 })

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e nested-moved-edit OK (G: X 60, rotZ 30 → ∪ цилиндр; правка сферы R12 → R16 без замка и отказа; undo/redo)')
} catch (e) {
  console.error('e2e nested-moved-edit FAIL —', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
