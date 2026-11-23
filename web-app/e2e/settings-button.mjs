// e2e/settings-button.mjs — UI-SETTINGS-BUTTON: «Настройки» в тулбаре, язык, тема.
//
//  A. Тулбар: кнопка «Тема» убрана, «Настройки» (шестерёнка) открывает окно.
//  B. Язык: список с флагом и текстом (🇷🇺 Русский / 🇬🇧 English); EN — интерфейс и
//     aria-label кнопок на английском, сохраняется после перезагрузки; RU — обратно.
//  C. Тема: 3 варианта в настройках; светлая → data-theme-id=light, тёмная → dark.
// Ошибок консоли нет. Запуск: `pnpm dev` в одном терминале, `pnpm e2e:settings-button` в другом.
import { openApp, toolbarButton } from './helpers.mjs'

const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const modal = page.locator('[data-testid=settings-modal]')
const lang = page.locator('[data-testid=settings-language]')
const theme = page.locator('[data-testid=settings-theme]')
const htmlTheme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme-id'))
const openSettings = async (name = 'Настройки') => {
  await toolbarButton(page, name).click()
  await modal.waitFor({ timeout: 5000 })
}
const closeSettings = async () => {
  await page.locator('[data-testid=settings-close]').click()
  await modal.waitFor({ state: 'detached', timeout: 5000 })
}

try {
  // ── A. Тулбар ──
  stage = 'A. тулбар'
  if (await toolbarButton(page, 'Сменить тему').count()) fail('A: кнопка «Сменить тему» всё ещё в тулбаре')
  if (!(await toolbarButton(page, 'Настройки').count())) fail('A: нет кнопки «Настройки» в тулбаре')
  await openSettings()
  if ((await page.locator('#settings-title').textContent()) !== 'Настройки') fail('A: окно настроек не открылось')
  ok.push('A: «Сменить тему» убрана, «Настройки» открывает окно')

  // ── B. Язык ──
  stage = 'B. язык'
  const labels = await lang.locator('option').allTextContents()
  if (!labels.some((s) => s.includes('🇷🇺') && s.includes('Русский'))) fail('B: нет «🇷🇺 Русский» в списке языка')
  if (!labels.some((s) => s.includes('🇬🇧') && s.includes('English'))) fail('B: нет «🇬🇧 English» в списке языка')
  await lang.selectOption('en')
  await page.waitForFunction(() => document.querySelector('#settings-title')?.textContent === 'Settings')
  if (!(await page.locator('.statusbar').innerText()).includes('Objects')) fail('B: статус-бар не на английском')
  await closeSettings()
  if (!(await toolbarButton(page, 'Settings').count())) fail('B: aria-label «Настройки» не стал «Settings»')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Loading CSG'), null, { timeout: 30000 })
  if (!(await page.locator('.statusbar').innerText()).includes('Objects')) fail('B: язык EN не сохранился после перезагрузки')
  await openSettings('Settings')
  if ((await lang.inputValue()) !== 'en') fail('B: в окне после перезагрузки выбран не EN')
  await lang.selectOption('ru')
  await page.waitForFunction(() => document.querySelector('#settings-title')?.textContent === 'Настройки')
  if (!(await toolbarButton(page, 'Настройки').count())) fail('B: обратно на RU — нет «Настройки»')
  ok.push('B: язык с флагами, EN сохраняется после перезагрузки, RU — обратно')

  // ── C. Тема ──
  stage = 'C. тема'
  const themeCount = await theme.locator('option').count()
  if (themeCount !== 3) fail(`C: тем в списке ${themeCount}, ждали 3`)
  await theme.selectOption('light')
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme-id') === 'light', null, { timeout: 5000 })
  if ((await htmlTheme()) !== 'light') fail('C: светлая тема не применилась')
  await theme.selectOption('dark')
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme-id') === 'dark', null, { timeout: 5000 })
  await closeSettings()
  ok.push('C: в настройках 3 темы; светлая / тёмная применяются')

  if (errors.length) fail('ошибки консоли:\n' + errors.join('\n'))
  for (const line of ok) console.log('  ✓ ' + line)
  console.log('e2e settings-button OK (тулбар «Настройки», язык RU/EN с флагами + сохранение, 3 темы)')
} catch (e) {
  console.error(`e2e settings-button FAIL [${stage}]: ${e.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
