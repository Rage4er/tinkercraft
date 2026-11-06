// e2e/independent-copy.mjs — CSG-INDEPENDENT-COPY: зеркало и вставка CSG дают независимую
// параметрическую копию. Куб ∪ сфера (сфера сдвинута в куб — радиус меняет меш) →
//  1) зеркало YZ → копия раскрывается, у её детей нет замка; радиус сферы копии +1 →
//     копия пересчитана, оригинал нет;
//  2) правка сферы оригинала → копия не тронута;
//  3) Ctrl+C / Ctrl+V оригинала → правка сферы вставки → вставка пересчитана, оригинал нет;
//  undo/redo правки вставки; уведомлений об отказе и ошибок в консоли нет.
// Дети ищутся по подписи внутри строки объекта (не по id узлов) — тест проверяет то, что
// видит пользователь. Проверено откатом: старый путь зеркала (дети запечены, 🔒 «mirror») и
// старая вставка (запечённый меш, не раскрывается) падают с понятной причиной.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:independent-copy` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/independent-copy.mjs /tmp/copy.png`.
import { openApp, toolbarButton, panelButton } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
/** Строка ребёнка `label` первого уровня под объектом `rootId` (строка объекта и дети — в одной обёртке). */
const childOf = (rootId, label) => row(rootId).locator('xpath=..').locator('.ct-child', { hasText: label })
const tris = async (id) => (await row(id).locator('.ct-tri').textContent())?.replace(/\D/g, '')
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const rowCount = (n) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: 15000 })
const radiusRe = (r) => new RegExp(`R${r}(\\D|$)`)
const noRejects = async () => {
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.some((m) => /отклон|не удалось|нельзя|недоступ/i.test(m))) fail('уведомление об отказе: ' + toasts.join(' | '))
}

/** Раскрыть CSG в дереве; копия без своего дерева (запечённый меш) не раскрывается. */
async function expand(id, what) {
  const chevron = row(id).locator('.ct-chevron')
  if ((await chevron.count()) === 0) fail(`${what} не раскрывается в дереве — запечённый меш, а не своё дерево`)
  if ((await chevron.textContent())?.trim() !== '▾') await chevron.click() // ▸ — свёрнут
}

/** Ребёнок-сфера объекта `rootId`: выбрать, убедиться, что правится, поставить радиус. */
async function editSphereRadius(rootId, what, radius) {
  const r = childOf(rootId, 'Сфера')
  if ((await r.count()) !== 1) fail(`${what}: нет ребёнка «Сфера» (дети: ${(await row(rootId).locator('xpath=..').locator('.ct-child').allInnerTexts()).join(' | ')})`)
  const lock = r.locator('[data-testid=ct-lock]')
  if ((await lock.count()) !== 0) fail(`${what}: у сферы замок 🔒 «${await lock.getAttribute('data-reason')}» — копию нельзя править`)
  await r.click()
  await page.locator('[data-testid=child-props]').waitFor({ timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
  if ((await page.locator('[data-testid=child-unavailable]').count()) !== 0) fail(`${what}: правка сферы недоступна`)
  const input = page.locator('[data-testid=child-form] input.props-input').first()
  await input.fill(String(radius))
  await input.blur()
  await r.filter({ hasText: radiusRe(radius) }).waitFor({ timeout: 15000 })
}

const sphereRadius = async (rootId) => Number((await childOf(rootId, 'Сфера').textContent())?.match(/R(\d+)/)?.[1])

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // куб + сфера, сфера сдвинута в куб (X = 12) — тогда радиус меняет линию пересечения
  await page.getByText('Куб', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.waitForTimeout(800)
  const [cube, sphere] = await ids()
  await row(sphere).click()
  const posX = right.locator('#num-input-pos-X')
  await posX.fill('12'); await posX.press('Enter')
  await page.locator('.tl-item', { hasText: 'Переместить' }).waitFor({ timeout: 10000 })

  // объединение
  await row(cube).click()
  await row(sphere).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await rowCount(1)
  const [root] = await ids()

  // ── 1. Зеркало YZ → независимая копия ──
  await row(root).click()
  await toolbarButton(page, 'Зеркало YZ').click()
  await rowCount(2)
  const mirror = (await ids()).find((id) => id !== root)
  await expand(mirror, 'Зеркальная копия')
  for (const label of ['Куб', 'Сфера']) {
    const r = childOf(mirror, label)
    if ((await r.count()) !== 1) fail(`у зеркальной копии нет ребёнка «${label}»`)
    const lock = r.locator('[data-testid=ct-lock]')
    if ((await lock.count()) !== 0) fail(`зеркальная копия: у ребёнка «${label}» замок 🔒 «${await lock.getAttribute('data-reason')}» — копию нельзя править`)
  }
  const radius0 = await sphereRadius(mirror)
  if (!radius0) fail('радиус сферы копии не прочитан')
  const rootTris0 = await tris(root), mirrorTris0 = await tris(mirror)

  await editSphereRadius(mirror, 'Зеркальная копия', radius0 + 1)
  await noRejects()
  const mirrorTris1 = await tris(mirror)
  if (mirrorTris1 === mirrorTris0) fail(`копия не пересчитана (треугольников ${mirrorTris0})`)
  if ((await tris(root)) !== rootTris0) fail('правка копии изменила оригинал')
  if (shot) await page.screenshot({ path: shot })

  // ── 2. Правка оригинала → копия не тронута ──
  await expand(root, 'Оригинал')
  await editSphereRadius(root, 'Оригинал', radius0 + 3)
  await noRejects()
  const rootTris1 = await tris(root)
  if (rootTris1 === rootTris0) fail('оригинал не пересчитан')
  if ((await tris(mirror)) !== mirrorTris1) fail('правка оригинала изменила зеркальную копию')
  if ((await sphereRadius(mirror)) !== radius0 + 1) fail('правка оригинала изменила радиус ребёнка копии')

  // ── 3. Ctrl+C / Ctrl+V оригинала → правка вставки ──
  await row(root).locator('.ct-name').click()
  await page.locator('.props-header').click() // фокус не в поле ввода
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await rowCount(3)
  const pasted = (await ids()).find((id) => id !== root && id !== mirror)
  await expand(pasted, 'Вставленная копия')
  if ((await sphereRadius(pasted)) !== radius0 + 3) fail('вставка не повторяет оригинал на момент копирования')
  const pastedTris0 = await tris(pasted)
  await editSphereRadius(pasted, 'Вставленная копия', radius0 + 1)
  await noRejects()
  const pastedTris1 = await tris(pasted)
  if (pastedTris1 === pastedTris0) fail('вставка не пересчитана')
  if ((await tris(root)) !== rootTris1) fail('правка вставки изменила оригинал')
  if ((await tris(mirror)) !== mirrorTris1) fail('правка вставки изменила зеркальную копию')

  // undo → вставка как была, redo → правленая
  const trisIs = (id, n) => page.waitForFunction(
    ([sel, want]) => (document.querySelector(sel)?.textContent ?? '').replace(/\D/g, '') === want,
    [`.ct-item[data-object-id="${id}"] .ct-tri`, n], { timeout: 15000 },
  )
  await page.locator('.props-header').click()
  await page.keyboard.press('Control+z')
  await trisIs(pasted, pastedTris0)
  await page.keyboard.press('Control+y')
  await trisIs(pasted, pastedTris1)
  if ((await tris(root)) !== rootTris1) fail('undo/redo вставки изменили оригинал')

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log(`e2e independent-copy OK (треугольников: зеркало ${mirrorTris0} → ${mirrorTris1}, вставка ${pastedTris0} → ${pastedTris1}, оригинал ${rootTris0} → ${rootTris1})`)
} finally {
  await browser.close()
}
