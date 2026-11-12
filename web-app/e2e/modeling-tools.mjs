// e2e/modeling-tools.mjs — Пакет B (Фаза 12): массивы (ARRAY-TOOL).
//
//  A. Линейный: куб → «Массив» (тулбар) → окно: линейный, X, ×3, шаг 30 → «Создать» — три куба
//     через 30 мм по X (поля позиции), один шаг «Массив: линейный ×3, шаг 30 (X)»; Ctrl+Z — один
//     куб, Ctrl+Y — снова три.
//  B. Круговой: брусок 30×6×6 → «Массив» → круговой, Z, ×6, центр на 40 мм левее → шесть брусков на
//     окружности радиуса 40 вокруг центра, «Вращение Z» 0, 60 … 300; перезагрузка (автосохранение,
//     перестроение по истории) — те же позиции и углы.
// Ошибок консоли нет. Запуск: `pnpm dev` в одном терминале, `pnpm e2e:modeling-tools` в другом.
import fs from 'node:fs'
import path from 'node:path'
import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const shotDir = process.env.E2E_SHOTS ?? null
if (shotDir) fs.mkdirSync(shotDir, { recursive: true })
let { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const shot = async (n) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, n) }) }
const rows = () => page.locator('.ct-item[data-object-id]')
const ids = () => rows().evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const waitRows = (n) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: 20000 })
const modal = () => page.locator('[data-testid=array-modal]')
const num = (id) => page.locator(`#${id}`).inputValue().then(Number)
/** Поля позиции и поворота объекта: клик по строке в «Дереве» */
async function propsOf(id) {
  await page.locator(`.ct-item[data-object-id="${id}"] .ct-name`).click()
  // выбран только он, поля панели — его (панель обновляется после клика)
  await page.waitForFunction((k) => {
    const sel = [...document.querySelectorAll('.ct-item.ct-selected')].map((e) => e.getAttribute('data-object-id'))
    return sel.length === 1 && sel[0] === k && !!document.querySelector('#num-input-pos-X')
  }, id, { timeout: 5000 })
  await page.waitForTimeout(150)
  return { x: await num('num-input-pos-X'), y: await num('num-input-pos-Y'), z: await num('num-input-pos-Z'), rotZ: await num('num-input-rot-Z') }
}
async function setField(id, v) {
  const f = page.locator(`#${id}`)
  await f.fill(String(v)); await f.press('Enter')
}
/** Поле окна приняло значение (NumInput обновляет черновик после отрисовки) */
const fieldIs = (id, v) => page.waitForFunction(({ k, want }) => Number(document.querySelector(`#${k}`)?.value) === want, { k: id, want: v }, { timeout: 3000 }).then(() => true, () => false)
const near = (a, b, eps = 0.06) => Math.abs(a - b) <= eps
const steps = () => page.locator('.tl-item .tl-label').allInnerTexts()

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Линейный ──
  stage = 'A. линейный'
  await placeShape(page, 'Куб')
  await waitRows(1)
  const [cube] = await ids()
  const p0 = await propsOf(cube)
  const nSteps = (await steps()).length
  await toolbarButton(page, 'Массив').click()
  await modal().waitFor({ timeout: 5000 })
  if ((await page.locator('#array-title').textContent()) !== 'Массив') fail('A: заголовок окна')
  if ((await page.locator('[data-testid=array-kind-linear]').getAttribute('aria-checked')) !== 'true') fail('A: по умолчанию не линейный')
  if (!(await fieldIs('array-count', 3))) fail('A: количество по умолчанию не 3')
  await setField('array-step', 30)
  await page.locator('[data-testid=array-create]').click()
  await modal().waitFor({ state: 'detached', timeout: 10000 })
  await waitRows(3)
  const lin = []
  for (const id of await ids()) lin.push(await propsOf(id))
  const xs = lin.map((p) => p.x).sort((a, b) => a - b)
  if (!near(xs[0], p0.x) || !near(xs[1], p0.x + 30) || !near(xs[2], p0.x + 60)) fail('A: X копий ' + xs.join(', ') + ' (исходный ' + p0.x + ')')
  if (!lin.every((p) => near(p.y, p0.y) && near(p.z, p0.z))) fail('A: Y / Z копий сдвинулись ' + JSON.stringify(lin))
  const st = await steps()
  if (st.length !== nSteps + 1 || !st.at(-1).includes('Массив: линейный ×3, шаг 30 (X)')) fail('A: шаг истории ' + JSON.stringify(st.slice(-2)))
  await shot('a-linear.png')
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Control+z'); await waitRows(1)
  await page.keyboard.press('Control+y'); await waitRows(3)
  ok.push(`A: линейный ×3, шаг 30 — X ${xs.join(' / ')}; один шаг «Массив: линейный ×3, шаг 30 (X)»; Ctrl+Z — 1 объект, Ctrl+Y — 3`)

  // ── B. Круговой ──
  stage = 'B. круговой'
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await waitRows(0)
  await placeShape(page, 'Куб')
  await waitRows(1)
  const [bar] = await ids()
  await page.locator(`.ct-item[data-object-id="${bar}"] .ct-name`).click()
  await setField('num-input-size-X', 30); await setField('num-input-size-Y', 6); await setField('num-input-size-Z', 6)
  const b0 = await propsOf(bar)
  const c = { x: b0.x - 40, y: b0.y, z: 0 }
  await toolbarButton(page, 'Массив').click()
  await modal().waitFor({ timeout: 5000 })
  await page.locator('[data-testid=array-kind-circular]').click()
  if ((await page.locator('[data-testid=array-axis-Z]').getAttribute('aria-checked')) !== 'true') fail('B: ось по умолчанию не Z')
  if (!(await fieldIs('array-count', 6))) fail('B: количество по умолчанию не 6')
  if (!(await fieldIs('array-angle', 360))) fail('B: угол по умолчанию не 360')
  await setField('array-center-X', c.x); await setField('array-center-Y', c.y)
  await page.locator('[data-testid=array-create]').click()
  await modal().waitFor({ state: 'detached', timeout: 10000 })
  await waitRows(6)
  const circ = async () => {
    const out = []
    for (const id of await ids()) out.push(await propsOf(id))
    return out.sort((a, b) => a.rotZ - b.rotZ)
  }
  const ring = await circ()
  const angles = ring.map((p) => p.rotZ)
  if (angles.join() !== '0,60,120,180,240,300') fail('B: углы ' + angles.join())
  ring.forEach((p, i) => {
    const a = (i * 60 * Math.PI) / 180
    if (!near(p.x, c.x + 40 * Math.cos(a), 0.1) || !near(p.y, c.y + 40 * Math.sin(a), 0.1) || !near(p.z, b0.z)) fail(`B: экземпляр ${i} на ${p.x}, ${p.y}, ${p.z}`)
  })
  if (!(await steps()).at(-1).includes('Массив: круговой ×6, 360° (Z)')) fail('B: шаг истории')
  await shot('b-circular.png')
  // перезагрузка: автосохранение → перестроение по истории
  await page.waitForTimeout(2500)
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas', { timeout: 20000 })
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  await waitRows(6)
  const again = await circ()
  if (again.map((p) => `${p.x},${p.y},${p.z},${p.rotZ}`).join(' ') !== ring.map((p) => `${p.x},${p.y},${p.z},${p.rotZ}`).join(' ')) fail('B: после перезагрузки ' + JSON.stringify(again))
  ok.push(`B: круговой ×6, ось Z через (${c.x}, ${c.y}) — радиус 40, «Вращение Z» ${angles.join(' / ')}; перезагрузка — то же`)

  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('e2e modeling-tools OK')
  for (const s of ok) console.log('  ✅ ' + s)
  await browser.close()
} catch (e) {
  console.log(`e2e modeling-tools FAIL [${stage}] — ${e.message}`)
  for (const s of ok) console.log('  ✅ ' + s)
  await shot('fail.png').catch(() => { })
  await browser.close()
  process.exit(1)
}
