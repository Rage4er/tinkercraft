// e2e/independent-copy.mjs — CSG-INDEPENDENT-COPY: зеркало и вставка CSG дают независимую
// параметрическую копию. Куб ∪ сфера (сфера сдвинута в куб — радиус меняет меш) →
//  1) зеркало YZ → у копии дети без замка; радиус сферы копии +1 → копия пересчитана, оригинал нет;
//  2) правка сферы оригинала → копия не тронута;
//  3) Ctrl+C / Ctrl+V оригинала → правка сферы вставки → вставка пересчитана, оригинал нет;
//  undo/redo правки вставки; уведомлений об отказе и ошибок в консоли нет.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:independent-copy` в другом.
// Необязательный аргумент — путь для скриншота: `node e2e/independent-copy.mjs /tmp/copy.png`.
import { openApp } from './helpers.mjs'

const shot = process.argv[2]
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const objRows = page.locator('.ct-item[data-object-id]')
const row = (id) => page.locator(`.ct-item[data-object-id="${id}"]`)
const child = (nodeId) => page.locator(`.ct-child[data-node-id="${nodeId}"]`)
const tris = async (id) => (await row(id).locator('.ct-tri').textContent())?.replace(/\D/g, '')
const ids = async () => objRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const rowCount = (n) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: 15000 })
const noRejects = async () => {
  const toasts = await page.locator('.toast-msg').allTextContents()
  if (toasts.some((m) => /отклон|не удалось|нельзя|недоступ/i.test(m))) fail('уведомление об отказе: ' + toasts.join(' | '))
}

/** Выбрать ребёнка CSG, убедиться, что он правится, и поставить радиус. */
async function editRadius(nodeId, radius) {
  const r = child(nodeId)
  if ((await r.locator('[data-testid=ct-lock]').count()) !== 0) fail(`у ${nodeId} замок: ` + (await r.locator('[data-testid=ct-lock]').getAttribute('data-reason')))
  await r.click()
  const panel = page.locator('[data-testid=child-props]')
  await panel.waitFor({ timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('[data-testid=child-check]') === null, null, { timeout: 15000 })
  if ((await page.locator('[data-testid=child-unavailable]').count()) !== 0) fail(`${nodeId}: правка недоступна`)
  const input = page.locator('[data-testid=child-form] input.props-input').first()
  await input.fill(String(radius))
  await input.blur()
  await page.waitForFunction(
    ([sel, re]) => new RegExp(re).test(document.querySelector(sel)?.textContent ?? ''),
    [`.ct-child[data-node-id="${nodeId}"]`, `R${radius}(\\D|$)`], { timeout: 15000 },
  )
}

const expand = async (id) => {
  const chevron = row(id).locator('.ct-chevron')
  if ((await chevron.textContent())?.trim() !== '▾') await chevron.click() // ▸ — свёрнут
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // куб + сфера, сфера сдвинута в куб (X = 12) — тогда радиус меняет линию пересечения
  await page.getByText('Куб', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.waitForTimeout(800)
  const [cube, sphere] = await ids()
  await row(sphere).click()
  const posX = right.locator('#num-input-X').first()
  await posX.fill('12'); await posX.press('Enter')
  await page.locator('.tl-item', { hasText: 'Переместить' }).waitFor({ timeout: 10000 })

  // объединение
  await row(cube).click()
  await row(sphere).click({ modifiers: ['Shift'] })
  await right.locator('.csg-group', { hasText: 'CSG операции' }).locator('button').first().click()
  await rowCount(1)
  const [root] = await ids()

  // ── 1. Зеркало YZ → независимая копия ──
  await row(root).click()
  await page.locator('button.btn-compact').nth(17).click() // 17-я кнопка тулбара — зеркало YZ
  await rowCount(2)
  const mirror = (await ids()).find((id) => id !== root)
  await expand(mirror)
  for (const n of [`${mirror}:${cube}`, `${mirror}:${sphere}`]) {
    if ((await child(n).count()) !== 1) fail('у зеркальной копии нет ребёнка ' + n + ': ' + (await page.locator('.ct-child').allInnerTexts()).join(' | '))
  }
  const radius0 = Number((await child(`${mirror}:${sphere}`).textContent())?.match(/R(\d+)/)?.[1])
  if (!radius0) fail('радиус сферы копии не прочитан')
  const rootTris0 = await tris(root), mirrorTris0 = await tris(mirror)

  await editRadius(`${mirror}:${sphere}`, radius0 + 1)
  await noRejects()
  const mirrorTris1 = await tris(mirror)
  if (mirrorTris1 === mirrorTris0) fail(`копия не пересчитана (треугольников ${mirrorTris0})`)
  if ((await tris(root)) !== rootTris0) fail('правка копии изменила оригинал')
  if (shot) await page.screenshot({ path: shot })

  // ── 2. Правка оригинала → копия не тронута ──
  await expand(root)
  await editRadius(sphere, radius0 + 3)
  await noRejects()
  const rootTris1 = await tris(root)
  if (rootTris1 === rootTris0) fail('оригинал не пересчитан')
  if ((await tris(mirror)) !== mirrorTris1) fail('правка оригинала изменила зеркальную копию')
  if (!new RegExp(`R${radius0 + 1}(\\D|$)`).test((await child(`${mirror}:${sphere}`).textContent()) ?? '')) fail('радиус ребёнка копии изменился')

  // ── 3. Ctrl+C / Ctrl+V оригинала → правка вставки ──
  await row(root).locator('.ct-name').click()
  await page.locator('.props-header').click() // фокус не в поле ввода
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await rowCount(3)
  const pasted = (await ids()).find((id) => id !== root && id !== mirror)
  await expand(pasted)
  if (!new RegExp(`R${radius0 + 3}(\\D|$)`).test((await child(`${pasted}:${sphere}`).textContent()) ?? '')) fail('вставка не повторяет оригинал на момент копирования')
  const pastedTris0 = await tris(pasted)
  await editRadius(`${pasted}:${sphere}`, radius0 + 1)
  await noRejects()
  const pastedTris1 = await tris(pasted)
  if (pastedTris1 === pastedTris0) fail('вставка не пересчитана')
  if ((await tris(root)) !== rootTris1) fail('правка вставки изменила оригинал')
  if ((await tris(mirror)) !== mirrorTris1) fail('правка вставки изменила зеркальную копию')

  // undo → вставка как была, redo → правленая
  await page.locator('.props-header').click()
  await page.keyboard.press('Control+z')
  await page.waitForFunction(
    ([sel, re]) => new RegExp(re).test(document.querySelector(sel)?.textContent ?? ''),
    [`.ct-item[data-object-id="${pasted}"] .ct-tri`, `^\\D*${pastedTris0}\\D*$`], { timeout: 15000 },
  )
  await page.keyboard.press('Control+y')
  await page.waitForFunction(
    ([sel, re]) => new RegExp(re).test(document.querySelector(sel)?.textContent ?? ''),
    [`.ct-item[data-object-id="${pasted}"] .ct-tri`, `^\\D*${pastedTris1}\\D*$`], { timeout: 15000 },
  )
  if ((await tris(root)) !== rootTris1) fail('undo/redo вставки изменили оригинал')

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log(`e2e independent-copy OK (треугольников: зеркало ${mirrorTris0} → ${mirrorTris1}, вставка ${pastedTris0} → ${pastedTris1}, оригинал ${rootTris0} → ${rootTris1})`)
} finally {
  await browser.close()
}
