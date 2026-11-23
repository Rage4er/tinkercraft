// THREAD-IN-CSG: резьба в CSG — параметрический ребёнок дерева, правка из ChildPropertiesPanel и ✎ шага.
import { openApp, panelButton, placeShape, toolbarButton } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }

try {
  const modal = page.locator('[data-testid=thread-modal]')
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.viewport-busy'), null, { timeout: 30000 })
  }
  const history = async () => page.locator('.tl-item').count()

  // ── резьба M8, 2 захода + куб → CSG ──
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  await modal.waitFor({ timeout: 10000 })
  await page.locator('[data-testid=thread-series]').selectOption('metric')
  await page.locator('[data-testid=thread-nominal]').selectOption('M8')
  await page.locator('[data-testid=thread-size]').selectOption('M8')
  await page.locator('[data-testid=thread-starts]').selectOption('2')
  await page.locator('[data-testid=thread-length]').fill('20')
  await page.locator('[data-testid=thread-create]').click()
  await modal.waitFor({ state: 'detached', timeout: 30000 })
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 1, null, { timeout: 30000 })
  await settle()

  await placeShape(page, 'Куб')
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 2, null, { timeout: 30000 })
  await settle()
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  const rows = page.locator('.ct-item[data-object-id]')
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 30000 })
  await settle()
  await page.locator('.ct-item[data-object-id] .ct-chevron').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-child').length === 2, null, { timeout: 15000 })
  await page.waitForTimeout(800)

  // ── thread в дереве — не 🔒, параметрический ──
  const threadChild = page.locator('.ct-child', { hasText: 'Резьба' })
  await threadChild.waitFor({ timeout: 10000 })
  if ((await threadChild.locator('[data-testid=ct-lock]').count()) !== 0) fail('thread в CSG заблокирован')
  if (!(await threadChild.innerText()).includes('M8')) fail('нет сводки параметров thread: ' + await threadChild.innerText())
  await threadChild.click()
  await page.locator('[data-testid=child-thread-form]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=child-form]').count()) !== 0) fail('у thread показана форма примитива')

  // правка ребёнка: 2 → 4 захода
  const beforeChild = await history()
  await page.locator('[data-testid=props-thread-starts]').selectOption('4')
  await page.waitForFunction((n) => document.querySelectorAll('.tl-item').length === n, beforeChild + 1, { timeout: 30000 })
  await settle()
  const editChild = await history()
  if (editChild !== beforeChild + 1) fail('правка ребёнка не записана в историю')

  // ── ✎ шага thread в Timeline → панель шага ──
  const threadStep = page.locator('.tl-item', { hasText: 'Резьба' }).first()
  const pencil = threadStep.locator('.tl-edit')
  if ((await pencil.count()) !== 1) fail('у шага thread нет ✎')
  await pencil.click()
  const panel = page.locator('[data-testid=step-panel]')
  await panel.waitFor({ timeout: 10000 })
  await page.locator('[data-testid=step-thread]').waitFor({ timeout: 10000 })
  const length = page.locator('[data-testid=props-thread-length]')
  if (Number(await length.inputValue()) !== 20) fail('в шаге thread не длина 20: ' + await length.inputValue())

  await length.fill('30')
  await length.press('Enter')
  await page.waitForFunction((n) => document.querySelectorAll('.tl-item').length === n, editChild + 1, { timeout: 30000 })
  await settle()
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid=props-thread-length]')
    return el instanceof HTMLInputElement && Number(el.value) === 30
  }, null, { timeout: 10000 })

  // ── Undo/redo правки шага ──
  await toolbarButton(page, 'Отменить').click()
  await settle()
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid=props-thread-length]')
    return el instanceof HTMLInputElement && Number(el.value) === 20
  }, null, { timeout: 30000 })
  await toolbarButton(page, 'Повторить').click()
  await settle()
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid=props-thread-length]')
    return el instanceof HTMLInputElement && Number(el.value) === 30
  }, null, { timeout: 30000 })

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  if (shot) await page.screenshot({ path: shot })
  console.log('e2e thread-in-csg OK (thread не baked, дерево без 🔒, правка 2→4, ✎ шага 20→30, undo/redo)')
} finally {
  await browser.close()
}
