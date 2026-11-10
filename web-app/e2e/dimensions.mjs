// e2e/dimensions.mjs — DIMENSIONS: размерные линии в браузере.
//  0. кнопка «Размер» → меню из трёх пунктов («Поставить размер» (D), «Настройки размера»,
//     «Показать / скрыть размеры» с галочкой); Esc закрывает; D — режим сразу, без меню; Esc — выход.
//  A. два куба → «Размер» › «Поставить размер» (статус-бар «выберите первую точку») → клик по точке куба 1 (привязка) →
//     «выберите вторую» → превью → клик по точке куба 2 → размер: в списке «Куб 1 — Куб 2 · N мм»,
//     N = |B − A| по точкам привязки; во вьюпорте 1 размер; режим остаётся; Esc — выход.
//  B. клик по размерной линии во вьюпорте — размер выделен (панель «Размер» справа).
//  C. ассоциативный: куб 2 сдвинут на +10 по X (поле) → число = |B + (10,0,0) − A|; масштаб X ×2 →
//     пересчитано; Ctrl+Z / Ctrl+Y — число следует за объектом, размер не удаляется.
//  D. «Размер» › «Показать / скрыть размеры» — слой скрыт (во вьюпорте 0, в списке «Слой скрыт») и снова виден.
//  E. «Размер» › «Настройки размера» к выбранному: тип «Проекция», цвет, шрифт → число = длина проекции на XY.
//  F. Delete при выделенном размере — размер удалён, кубы на месте.
// Уведомлений («нельзя» и др.) и ошибок консоли нет. Логика — __tests__/dimensions.test.tsx (WASM).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:dimensions` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/dimensions.mjs /tmp/shots`.
import os from 'node:os'
import path from 'node:path'
import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const shotDir = process.argv[2]
const { browser, page, errors } = await openApp()
let stage = 'старт'
const fail = (msg) => { throw new Error(msg) }
const vpLoc = page.locator('.viewport-canvas')
const dimRows = page.locator('[data-testid=dimension-row]')
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }
const menu = page.locator('[data-testid=dimension-menu]')
/** Пункт меню кнопки «Размер»: 'place' | 'settings' | 'toggle'. */
async function menuItem(item) {
  await toolbarButton(page, 'Размер').click()
  await menu.waitFor({ timeout: 5000 })
  await menu.locator(`[data-testid=dimension-menu-${item}]`).click()
  await menu.waitFor({ state: 'detached', timeout: 5000 })
}
const listValue = async () => Number((await page.locator('[data-testid=dimension-value]').first().textContent()).replace(/[^\d.]/g, ''))
const near = (a, b, eps = 0.06) => Math.abs(a - b) <= eps
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
/** Число в списке = ожидаемому (после пересчёта). */
async function expectValue(expected, what) {
  await page.waitForFunction((e) => {
    const t = document.querySelector('[data-testid=dimension-value]')?.textContent ?? ''
    return Math.abs(Number(t.replace(/[^\d.]/g, '')) - e) <= 0.06
  }, expected, { timeout: 10000 }).catch(async () => fail(`${what}: в списке ${await listValue()}, ожидалось ${expected.toFixed(2)}`))
}
/** Поле правой панели (0 — цвет, 1..3 — позиция, 4..6 — поворот, 7..9 — масштаб). */
async function setField(index, v) {
  const f = page.locator('.panel-right input').nth(index)
  await f.fill(String(v)); await f.press('Enter')
  await page.waitForTimeout(400)
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  await placeShape(page, 'Куб'); await placeShape(page, 'Куб')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2)
  const [c1, c2] = await page.locator('.ct-item[data-object-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
  const vp = await vpLoc.boundingBox()

  // ── 0. меню кнопки «Размер»; D — сразу ──
  stage = '0. меню'
  const btn = toolbarButton(page, 'Размер')
  await btn.click()
  await menu.waitFor({ timeout: 5000 })
  const items = await menu.locator('[role^=menuitem]').allInnerTexts()
  if (items.length !== 3 || !items[0].includes('Поставить размер') || !items[1].includes('Настройки размера') || !items[2].includes('Показать / скрыть размеры')) fail('0: пункты меню: ' + JSON.stringify(items))
  if ((await btn.getAttribute('aria-expanded')) !== 'true') fail('0: aria-expanded')
  if ((await menu.locator('[data-testid=dimension-menu-toggle]').getAttribute('aria-checked')) !== 'true') fail('0: галочка «Показать» снята при видимом слое')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached', timeout: 5000 })
  if (await page.locator('[data-testid=dimension-mode]').count()) fail('0: Esc по меню включил режим')
  await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2)
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('KeyD')
  await page.locator('[data-testid=dimension-mode]').waitFor({ timeout: 5000 })
  if (await menu.count()) fail('0: D открыл меню')
  await page.keyboard.press('Escape')
  await page.locator('[data-testid=dimension-mode]').waitFor({ state: 'detached', timeout: 5000 })
  console.log('✅ 0. «Размер» → меню: «Поставить размер» (D), «Настройки размера», «Показать / скрыть размеры» ✓; Esc закрывает; D — режим сразу')

  // ── A. «Размер» › «Поставить размер» → A → B ──
  stage = 'A. размер A → B'
  await menuItem('place')
  await page.locator('[data-testid=dimension-mode]').waitFor({ timeout: 5000 })
  if (!(await page.locator('[data-testid=dimension-hint]').textContent()).startsWith('Размер: выберите первую точку')) fail('A: подсказка A')
  if ((await vpLoc.getAttribute('data-dimension-mode')) !== 'a') fail('A: режим не ждёт точку A')
  const probe = async (x, y) => {
    await page.mouse.move(x, y); await page.waitForTimeout(90)
    const h = await vpLoc.getAttribute('data-dimension-hover')
    if (!h) return null
    const [id, snap, p] = h.split('|')
    return { x, y, id, snap, p: p.split(',').map(Number) }
  }
  // B — по возможности на другой высоте, чем A (проекция на XY в разделе E короче полной длины)
  let A = null, B = null, Bany = null
  for (let j = 0; j < 14 && !(A && B); j++) for (let i = 0; i < 22 && !(A && B); i++) {
    const h = await probe(vp.x + vp.width * (0.3 + i * 0.4 / 22), vp.y + vp.height * (0.3 + j * 0.4 / 14))
    if (!h) continue
    if (h.id === c1 && !A) A = h
    if (h.id === c2) {
      Bany = Bany ?? h
      if (A && Math.abs(h.p[2] - A.p[2]) > 2) B = h
    }
  }
  B = B ?? Bany
  if (!A || !B) fail(`A: точки на кубах не найдены (A ${!!A}, B ${!!B})`)
  await page.mouse.move(A.x, A.y); await page.waitForTimeout(120)
  await page.mouse.click(A.x, A.y)
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-dimension-mode') === 'b', null, { timeout: 5000 })
  if (!(await page.locator('[data-testid=dimension-hint]').textContent()).startsWith('Размер: выберите вторую точку')) fail('A: подсказка B')
  await page.mouse.move(B.x, B.y); await page.waitForTimeout(150)
  await shot('dim-a-preview.png')
  await page.mouse.click(B.x, B.y)
  await dimRows.first().waitFor({ timeout: 5000 })
  const v0 = dist(A.p, B.p)
  await expectValue(v0, 'A')
  if (!(await dimRows.first().innerText()).startsWith('Куб 1 — Куб 2')) fail('A: строка: ' + (await dimRows.first().innerText()))
  if ((await vpLoc.getAttribute('data-dimension-count')) !== '1') fail('A: во вьюпорте не 1 размер')
  if ((await page.locator('[data-testid=dimension-created]').textContent()) !== 'Размеров: 1') fail('A: счётчик режима')
  if ((await vpLoc.getAttribute('data-dimension-mode')) !== 'a') fail('A: режим не остался для следующего размера')
  await page.keyboard.press('Escape')
  await page.locator('[data-testid=dimension-mode]').waitFor({ state: 'detached', timeout: 5000 })
  await page.mouse.move(vp.x + 5, vp.y + 5)
  await shot('dim-a-created.png')
  console.log(`✅ A. «Размер» → точка (${A.snap || 'поверхность'}) куба 1 → точка (${B.snap || 'поверхность'}) куба 2 → ${v0.toFixed(1)} мм (= |B − A|), режим остаётся; Esc — выход`)

  // ── B. клик по размерной линии — выделен ──
  stage = 'B. выбор размера во вьюпорте'
  await page.mouse.click((A.x + B.x) / 2, (A.y + B.y) / 2)
  await page.locator('[data-testid=dimension-panel]').waitFor({ timeout: 5000 })
  if (!(await page.locator('[data-testid=dimension-panel-value]').textContent()).startsWith(v0.toFixed(1))) fail('B: значение в панели')
  if (!(await dimRows.first().getAttribute('class')).includes('selected')) fail('B: строка не выделена')
  console.log('✅ B. клик по размерной линии во вьюпорте — размер выделен, панель «Размер»')

  // ── C. ассоциативный: сдвиг, масштаб, undo / redo ──
  stage = 'C. ассоциативный'
  await page.locator(`.ct-item[data-object-id="${c2}"]`).click()
  await page.locator('[data-testid=dimension-panel]').waitFor({ state: 'detached', timeout: 5000 })   // выделен объект
  const x2 = Number(await page.locator('.panel-right input').nth(1).inputValue())
  await setField(1, x2 + 10)
  const Bm = [B.p[0] + 10, B.p[1], B.p[2]]
  await expectValue(dist(A.p, Bm), 'C: сдвиг +10')
  await setField(7, 2)                                                 // масштаб X ×2 вокруг центра куба 2
  const Bs = [x2 + 10 + 2 * (B.p[0] - x2), B.p[1], B.p[2]]
  await expectValue(dist(A.p, Bs), 'C: масштаб ×2')
  await page.mouse.move(vp.x + 5, vp.y + 5)
  await page.keyboard.press('Control+z')                               // откат масштаба
  await expectValue(dist(A.p, Bm), 'C: undo масштаба')
  await page.keyboard.press('Control+z')                               // откат сдвига
  await expectValue(v0, 'C: undo сдвига')
  await page.keyboard.press('Control+y')
  await expectValue(dist(A.p, Bm), 'C: redo сдвига')
  if ((await dimRows.count()) !== 1) fail('C: undo / redo изменили слой размеров')
  await shot('dim-c-moved.png')
  console.log(`✅ C. сдвиг +10 → ${dist(A.p, Bm).toFixed(1)}, масштаб ×2 → ${dist(A.p, Bs).toFixed(1)}; Ctrl+Z / Ctrl+Y — число за объектом, размер на месте`)

  // ── D. слой: скрыть / показать ──
  stage = 'D. слой'
  await menuItem('toggle')
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-dimensions-visible') === '0')
  if ((await vpLoc.getAttribute('data-dimension-count')) !== '0') fail('D: размер виден при скрытом слое')
  if (!(await page.locator('[data-testid=dimension-list]').innerText()).includes('Слой скрыт')) fail('D: в списке нет «Слой скрыт»')
  await shot('dim-d-hidden.png')
  await toolbarButton(page, 'Размер').click()
  if ((await menu.locator('[data-testid=dimension-menu-toggle]').getAttribute('aria-checked')) !== 'false') fail('D: галочка при скрытом слое')
  await menu.locator('[data-testid=dimension-menu-toggle]').click()
  await page.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-dimension-count') === '1')
  console.log('✅ D. «Размер» › «Показать / скрыть размеры» — слой скрыт (0 во вьюпорте, «Слой скрыт», галочки нет) и снова виден')

  // ── E. настройки к выбранному: проекция, цвет, шрифт ──
  stage = 'E. настройки'
  await dimRows.first().click()
  await page.locator('[data-testid=dimension-panel]').waitFor({ timeout: 5000 })
  await menuItem('settings')
  const modal = page.locator('[data-testid=dimension-settings]')
  await modal.waitFor({ timeout: 5000 })
  if ((await modal.locator('[data-testid=dim-units]').textContent()) !== 'мм') fail('E: единицы')
  await modal.locator('[data-testid=dim-kind-projection]').click()
  await modal.locator('[data-testid=dim-color]').fill('#ff8800')
  await modal.locator('[data-testid=dim-font]').selectOption('monospace')
  await modal.locator('[data-testid=dim-apply-selected]').click()
  await modal.waitFor({ state: 'detached', timeout: 5000 })
  const panel = page.locator('[data-testid=dimension-panel]')
  if ((await panel.getAttribute('data-kind')) !== 'projection' || (await panel.getAttribute('data-color')) !== '#ff8800' || (await panel.getAttribute('data-font')) !== 'monospace') {
    fail(`E: стиль не применён: ${await panel.getAttribute('data-kind')} ${await panel.getAttribute('data-color')} ${await panel.getAttribute('data-font')}`)
  }
  await expectValue(Math.hypot(Bm[0] - A.p[0], Bm[1] - A.p[1]), 'E: проекция на XY')
  await page.mouse.move(vp.x + 5, vp.y + 5)
  await shot('dim-e-projection.png')
  console.log(`✅ E. «Размер» › «Настройки размера» → к выбранному: «Проекция», цвет #ff8800, моноширинный → ${Math.hypot(Bm[0] - A.p[0], Bm[1] - A.p[1]).toFixed(1)} мм (длина на XY)`)

  // ── F. Delete — размер удалён, кубы на месте ──
  stage = 'F. Delete'
  await page.keyboard.press('Delete')
  await page.locator('[data-testid=dimension-empty]').waitFor({ timeout: 5000 })
  if ((await page.locator('.ct-item[data-object-id]').count()) !== 2) fail('F: Delete удалил объекты')
  if ((await vpLoc.getAttribute('data-dimension-count')) !== '0') fail('F: размер остался во вьюпорте')
  console.log('✅ F. Delete при выделенном размере — размер удалён, кубы на месте')

  if (await toasts()) fail('уведомления: ' + (await toasts()))
  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('DIMENSIONS e2e: OK')
} catch (err) {
  console.error(`DIMENSIONS e2e FAIL [${stage}]:`, err.message)
  if (errors.length) console.error(errors.join('\n'))
  await page.screenshot({ path: path.join(os.tmpdir(), 'dimensions-fail.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
