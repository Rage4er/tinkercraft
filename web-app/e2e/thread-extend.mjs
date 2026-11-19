// THREAD-EXTEND: полный список, M0.25, NPT, Square и левая мелкая резьба.
import { openApp } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }

try {
  const objects = () => page.locator('.object-list-item')
  const modal = page.locator('[data-testid=thread-modal]')
  const waitObjects = (n) => page.waitForFunction(
    (k) => document.querySelectorAll('.object-list-item').length === k, n, { timeout: 20000 },
  )
  const open = async () => {
    await page.locator('.shape-btn', { hasText: 'Резьба' }).click()
    await modal.waitFor({ timeout: 10000 })
  }
  const create = async (count) => {
    await page.locator('[data-testid=thread-create]').click()
    await modal.waitFor({ state: 'detached', timeout: 20000 })
    await waitObjects(count)
  }
  const names = async () => (await objects().locator('.object-list-label').allInnerTexts()).join(' | ')

  await open()
  const fit = await modal.evaluate((root) => {
    const box = root.getBoundingClientRect()
    const outside = [...root.querySelectorAll('.thread-modal-field, .thread-modal-control, .thread-modal-check, .text-modal-actions button')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.left < box.left - 1 || r.right > box.right + 1 || r.width === 0
      }).map((el) => el.getAttribute('data-testid') || el.className)
    return { overflow: root.scrollWidth > root.clientWidth + 1, outside }
  })
  if (fit.overflow || fit.outside.length) fail('окно резьбы не вмещает элементы: ' + JSON.stringify(fit))

  await page.locator('[data-testid=thread-all-sizes]').check()
  if ((await page.locator('[data-testid=thread-nominal] option').count()) < 100) fail('полный метрический список не открылся')
  await page.locator('[data-testid=thread-nominal]').selectOption('M0.25')
  if ((await page.locator('[data-testid=thread-size]').inputValue()) !== 'M0.25') fail('M0.25 × 0.075 не выбран')
  await page.locator('[data-testid=thread-length]').fill('4')
  await create(1)
  if (!(await names()).includes('Резьба: M0.25×4')) fail('нет M0.25: ' + await names())

  await open()
  await page.locator('[data-testid=thread-series]').selectOption('npt')
  await page.locator('[data-testid=thread-nominal]').selectOption('1/2')
  if ((await page.locator('[data-testid=thread-size]').inputValue()) !== '1/2-14-NPT') fail('NPT 1/2-14 не выбран')
  await page.locator('[data-testid=thread-length]').fill('12')
  await create(2)
  if (!(await names()).includes('Резьба: 1/2-14-NPT×12')) fail('нет NPT: ' + await names())

  await open()
  await page.locator('[data-testid=thread-series]').selectOption('square')
  if ((await page.locator('[data-testid=thread-size]').inputValue()) !== 'SQ10x2') fail('Square SQ10×2 не выбран')
  await page.locator('[data-testid=thread-length]').fill('12')
  await create(3)
  if (!(await names()).includes('Резьба: SQ10x2×12')) fail('нет Square: ' + await names())

  await open()
  await page.locator('[data-testid=thread-series]').selectOption('metric')
  await page.locator('[data-testid=thread-nominal]').selectOption('M10')
  await page.locator('[data-testid=thread-size]').selectOption('M10x1.25')
  await page.locator('[data-testid=thread-hand]').selectOption('left')
  await page.locator('[data-testid=thread-length]').fill('20')
  await create(4)
  if (!(await names()).includes('Резьба: M10x1.25 LH×20')) fail('нет левой M10×1.25: ' + await names())

  if (shot) await page.screenshot({ path: shot })
  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e thread-extend OK (все размеры; M0.25; NPT 1/2; Square SQ10×2; левая M10×1.25)')
} finally {
  await browser.close()
}
