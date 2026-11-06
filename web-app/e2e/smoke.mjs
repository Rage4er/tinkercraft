// e2e/smoke.mjs — дымовая проверка: приложение стартует, WebGL и CSG-воркер живы,
// фигуры добавляются. Запуск: `pnpm dev` в одном терминале, `pnpm e2e:smoke` в другом.
import { openApp } from './helpers.mjs'

const { browser, page, errors } = await openApp()
try {
  await page.getByText('Куб', { exact: true }).first().click()
  await page.waitForTimeout(1000)
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.waitForTimeout(1000)
  const objects = await page.evaluate(() => document.body.innerText.match(/ОБЪЕКТЫ\s*\n?\s*(\d+)/)?.[1])
  const fallback = await page.evaluate(() => document.body.innerText.includes('WebGL недоступен'))
  if (objects !== '2') throw new Error(`ожидалось 2 объекта, получено ${objects}`)
  if (fallback) throw new Error('показан WebGL-фолбэк')
  if (errors.length) throw new Error('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e smoke OK')
} finally {
  await browser.close()
}
