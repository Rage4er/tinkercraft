// e2e/import-mesh-csg.mjs — IMPORT-MESH-CSG: CSG для импортированного STL — по замкнутости,
// а не по типу.
//  1) замкнутый STL (e2e/fixtures/closed-cube.stl) ∪ куб → кнопки CSG активны, CSG-результат,
//     в дереве — импорт (🔒 baked) и куб (правится), уведомлений нет;
//  2) незамкнутый STL (e2e/fixtures/open-triangle.stl) ∪ куб → уведомление «меш не замкнут»
//     (ru, затем en после переключения языка), объектов не меньше — CSG не случилась.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:import-mesh-csg` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/import-mesh-csg.mjs /tmp/stl.png`.
import { fileURLToPath } from 'node:url'
import { openApp, toolbarButton, panelButton } from './helpers.mjs'

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const RU = 'Меш не замкнут (non-manifold), CSG невозможен. Проверьте STL.'
const EN = 'Mesh is not closed (non-manifold), CSG is not possible. Check the STL.'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const rowCount = (n) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: 15000 })
const toasts = () => page.locator('.toast-msg').allTextContents()
const union = () => panelButton(page, /^(Объединение|Union)$/) // ru/en: шаг 2 переключает язык
const pos = (axis) => right.locator(`#num-input-${axis}`).first() // первое X/Y/Z — позиция

/** Импорт STL через кнопку тулбара «Импорт» (по aria-label) → выбор файла. Возвращает id. */
async function importStl(name) {
  const before = new Set(await ids())
  const chooser = page.waitForEvent('filechooser')
  await toolbarButton(page, 'Импорт').click()
  const fc = await chooser
  if ((await fc.element().getAttribute('accept')) !== '.stl') fail('кнопка «Импорт» тулбара — не импорт STL')
  await fc.setFiles(fixture(name))
  await page.waitForFunction((n) => document.querySelectorAll('.ct-item[data-object-id]').length === n, before.size + 1, { timeout: 15000 })
  return (await ids()).find((id) => !before.has(id))
}

/** Куб-примитив (20³ по умолчанию), поставленный рядом с объектом `nextTo` (+12 по X — STL 10³ выступает из куба). */
async function cubeNextTo(nextTo) {
  const before = new Set(await ids())
  await page.getByText('Куб', { exact: true }).first().click()
  await page.waitForFunction((n) => document.querySelectorAll('.ct-item[data-object-id]').length === n, before.size + 1, { timeout: 15000 })
  const cube = (await ids()).find((id) => !before.has(id))
  await row(nextTo).click()
  const at = { X: Number(await pos('X').inputValue()) + 12, Y: Number(await pos('Y').inputValue()), Z: Number(await pos('Z').inputValue()) }
  await row(cube).click()
  for (const axis of ['X', 'Y', 'Z']) {
    if (Number(await pos(axis).inputValue()) === at[axis]) continue
    const n = await page.locator('.tl-item').count()
    await pos(axis).fill(String(at[axis])); await pos(axis).press('Enter')
    await page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k, n + 1, { timeout: 10000 })
  }
  return cube
}

async function select2(a, b) {
  await row(a).click()
  await row(b).click({ modifiers: ['Shift'] })
}

/** Ждать уведомление «меш не замкнут»; нет — понятная причина (а не таймаут локатора). */
async function expectNonManifoldToast(text, count) {
  try {
    await page.locator('.toast-msg', { hasText: text }).waitFor({ timeout: 15000 })
  } catch {
    const now = (await ids()).length
    fail(now < count
      ? 'незамкнутый STL ∪ куб: CSG прошла молча (меш STL подменён?), уведомления нет'
      : `незамкнутый STL ∪ куб: нет уведомления «${text}» (есть: ${(await toasts()).join(' | ') || '—'})`)
  }
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── 1. Замкнутый STL ∪ куб → работает ──
  const stl = await importStl('closed-cube.stl')
  const cube = await cubeNextTo(stl)
  await select2(stl, cube)
  if (await union().isDisabled()) fail('кнопка «Объединение» неактивна для импорта (блокировка по типу)')
  await union().click()
  await rowCount(1)
  const [root] = await ids()
  if (root === stl || root === cube) fail('CSG-результат не создан')
  const tris = Number((await row(root).locator('.ct-tri').textContent())?.replace(/\D/g, ''))
  if (!(tris > 12)) fail(`у результата ${tris} треугольников — похоже на заглушку, а не объединение`)
  const t1 = await toasts()
  if (t1.some((m) => /замкн|manifold|не удалось|failed/i.test(m))) fail('уведомление при замкнутом STL: ' + t1.join(' | '))
  await row(root).locator('.ct-chevron').click()
  const kids = page.locator('.ct-child')
  if ((await kids.count()) !== 2) fail('у результата должно быть 2 ребёнка: ' + (await kids.allInnerTexts()).join(' | '))
  const importKid = page.locator(`.ct-child[data-node-id="${stl}"]`)
  if ((await importKid.locator('[data-testid=ct-lock]').getAttribute('data-reason')) !== 'baked') fail('импорт в дереве должен быть 🔒 baked')
  if ((await page.locator(`.ct-child[data-node-id="${cube}"] [data-testid=ct-lock]`).count()) !== 0) fail('куб рядом с импортом должен правиться')
  if (shot) await page.screenshot({ path: shot })

  // ── 2. Незамкнутый STL ∪ куб → уведомление (ru, затем en) ──
  const open = await importStl('open-triangle.stl')
  const cube2 = await cubeNextTo(open)
  const count = (await ids()).length
  await select2(open, cube2)
  await union().click()
  await expectNonManifoldToast(RU, count)
  if ((await ids()).length !== count) fail('после отказа число объектов изменилось')

  await page.locator('.lang-switcher').click() // RU → EN
  await select2(open, cube2)
  await union().click()
  await expectNonManifoldToast(EN, count)
  if ((await ids()).length !== count) fail('после отказа (en) число объектов изменилось')
  await page.locator('.lang-switcher').click() // вернуть RU

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log(`e2e import-mesh-csg OK (замкнутый STL ∪ куб: ${tris} треугольников; незамкнутый — уведомление ru/en)`)
} finally {
  await browser.close()
}
