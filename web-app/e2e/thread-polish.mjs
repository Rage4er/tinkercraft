// THREAD-POLISH: ✎ у шага thread, правка из панели шага, параметрическое зеркало (LH).
import { openApp, toolbarButton } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }

try {
  const objects = () => page.locator('.object-list-item')
  const modal = page.locator('[data-testid=thread-modal]')
  const panel = page.locator('[data-testid=step-panel]')
  const names = async () => (await objects().locator('.object-list-label').allInnerTexts()).join(' | ')
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.viewport-busy'), null, { timeout: 30000 })
  }
  const waitHistory = (n) => page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n, { timeout: 30000 })

  // ── M10, 3 захода ──
  await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
  await modal.waitFor({ timeout: 10000 })
  await page.locator('[data-testid=thread-series]').selectOption('metric')
  await page.locator('[data-testid=thread-nominal]').selectOption('M10')
  await page.locator('[data-testid=thread-size]').selectOption('M10')
  await page.locator('[data-testid=thread-starts]').selectOption('3')
  await page.locator('[data-testid=thread-length]').fill('20')
  await page.locator('[data-testid=thread-create]').click()
  await modal.waitFor({ state: 'detached', timeout: 30000 })
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 1, null, { timeout: 30000 })
  await settle()

  // ── ✎ у шага thread → панель шага ──
  const threadRow = page.locator('.tl-item', { hasText: 'Резьба:' }).first()
  const pencil = threadRow.locator('.tl-edit')
  if ((await pencil.count()) !== 1) fail('у шага thread нет ✎')
  const title = await pencil.getAttribute('title')
  if (!title?.includes('резьбы')) fail('подсказка ✎ шага thread: ' + title)
  await pencil.click()
  await panel.waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=step-thread]').count()) !== 1) fail('в панели шага нет формы резьбы')

  // Правка шага: 3 → 4 захода, длина 20 → 30.
  await page.locator('[data-testid=props-thread-starts]').selectOption('4')
  await waitHistory(2)
  await settle()
  await page.locator('[data-testid=props-thread-length]').fill('30')
  await page.locator('[data-testid=props-thread-length]').press('Enter')
  await waitHistory(3)
  await settle()
  if (!(await names()).includes('Резьба: M10×30')) fail('правка шага не обновила имя: ' + await names())
  await page.locator('[data-testid=step-panel] button', { hasText: 'Назад' }).click()

  // ── Зеркало YZ → параметрическая копия LH ──
  await objects().filter({ hasText: 'Резьба:' }).first().click()
  await toolbarButton(page, 'Зеркало YZ').click()
  await page.waitForFunction(() => document.querySelectorAll('.object-list-item').length === 2, null, { timeout: 30000 })
  await settle()
  if (!(await names()).includes('Резьба: M10 LH×30')) fail('зеркало не дало левую резьбу: ' + await names())

  // ── Правка зеркальной копии ──
  await objects().filter({ hasText: 'LH' }).click()
  await page.locator('[data-testid=props-thread]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '4') fail('у копии не 4 захода')
  await page.locator('[data-testid=props-thread-starts]').selectOption('6')
  await waitHistory(4)
  await settle()
  await objects().filter({ hasText: 'LH' }).click()
  await page.locator('[data-testid=props-thread]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '6') fail('правка копии не применилась')

  // Undo/redo правки копии.
  await toolbarButton(page, 'Отменить').click()
  await settle()
  await objects().filter({ hasText: 'LH' }).click()
  await page.locator('[data-testid=props-thread]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '4') fail('undo не вернул 4 захода копии')
  await toolbarButton(page, 'Повторить').click()
  await settle()
  await objects().filter({ hasText: 'LH' }).click()
  await page.locator('[data-testid=props-thread]').waitFor({ timeout: 10000 })
  if ((await page.locator('[data-testid=props-thread-starts]').inputValue()) !== '6') fail('redo не вернул 6 заходов копии')

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  if (shot) await page.screenshot({ path: shot })
  console.log('e2e thread-polish OK (✎ шага, 3→4 захода, 20→30; зеркало LH; правка копии 4→6; undo/redo)')
} finally {
  await browser.close()
}
