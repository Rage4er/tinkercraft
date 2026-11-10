// e2e/ux-polish.mjs — ux-polish: четыре правки.
//  A. CSG-GROUP-UI: кнопки «Объединение» / «Вычитание» / «Пересечение» — в тулбаре; выбрал куб и сферу →
//     «Вычитание» в тулбаре → режим (кнопка нажата), A — оранжевая (тёплая) кайма вокруг куба и сферы,
//     выбрал цилиндр и конус (B) — синяя (холодная) кайма вокруг них; Esc — каймы A нет.
// Ошибок консоли нет. Логика — src/__tests__/ux-polish.test.tsx.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-polish` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/ux-polish.mjs /tmp/shots`.
import path from 'node:path'
import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const shotDir = process.argv[2]
const { browser, page, errors } = await openApp()
let stage = 'старт'
const ok = []
const fail = (msg) => { throw new Error(msg) }
const vpLoc = page.locator('.viewport-canvas')
const rows = page.locator('.ct-item[data-object-id]')
const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const waitRows = (n, t = 30000) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: t })
const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }
const blur = () => page.evaluate(() => document.activeElement?.blur())
const pick = async (id, add = false) => {
  await page.locator(`.ct-item[data-object-id="${id}"]`).click(add ? { modifiers: ['Shift'] } : undefined)
  await page.waitForTimeout(120)
}
const dataset = () => vpLoc.evaluate((e) => ({ ...e.dataset }))
const waitData = (key, value, what) => page.waitForFunction(([k, v]) => document.querySelector('.viewport-canvas')?.dataset[k] === v, [key, value], { timeout: 10000 })
  .catch(async () => fail(`${what}: data-${key} ${JSON.stringify((await dataset())[key])}, ожидалось ${value}`))

/** Пиксели вьюпорта, подходящие под `kind` ('blue' — кайма выделенных, 'orange' — кайма группы A), без «Куба вида» и оверлеев. */
async function colorPixels(kind) {
  const vp = await vpLoc.boundingBox()
  const png = await page.screenshot({ clip: vp })
  const pts = await page.evaluate(async ({ b64, vx, vy, kind }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, img.width, img.height).data
    const skip = [...document.querySelectorAll('.viewcube-container, .viewport-canvas > :not(canvas)')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && r.width < img.width * 0.9)
    const match = kind === 'blue'
      ? (r, g, b) => b >= 200 && r <= 100 && g >= 85 && g <= 175 && b - r >= 130     // #2f80ff
      : (r, g, b) => r >= 225 && g >= 90 && g <= 160 && b <= 45                      // #ff7a00
    const out = []
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      if (!match(d[i], d[i + 1], d[i + 2])) continue
      const px = vx + x, py = vy + y
      if (skip.some((q) => px >= q.left && px <= q.right && py >= q.top && py <= q.bottom)) continue
      out.push(px, py)
    }
    return out
  }, { b64: png.toString('base64'), vx: vp.x, vy: vp.y, kind })
  const list = []
  for (let i = 0; i < pts.length; i += 2) list.push([pts[i], pts[i + 1]])
  return list
}
const bboxOf = (list) => list.length ? { x0: Math.min(...list.map((p) => p[0])), x1: Math.max(...list.map((p) => p[0])), y0: Math.min(...list.map((p) => p[1])), y1: Math.max(...list.map((p) => p[1])) } : null
const inBox = (list, b, m = 6) => list.filter(([x, y]) => x >= b.x0 - m && x <= b.x1 + m && y >= b.y0 - m && y <= b.y1 + m).length
/** Рамка объекта по синей кайме: выделить его, снять кайму. */
async function boxOf(id) {
  await pick(id); await waitData('outlineCount', '1', 'рамка объекта')
  await page.waitForTimeout(120)
  const b = bboxOf(await colorPixels('blue'))
  if (!b) fail('нет каймы у ' + id)
  return b
}

try {
  // ── A: CSG-GROUP-UI ──
  stage = 'A. CSG-GROUP-UI'
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  for (const label of ['Куб', 'Сфера', 'Цилиндр', 'Конус']) await placeShape(page, label)
  await waitRows(4)
  const [cube, sphere, cyl, cone] = await ids()
  const union = toolbarButton(page, 'Объединение'), subtract = toolbarButton(page, 'Вычитание'), intersect = toolbarButton(page, 'Пересечение')
  for (const [name, b] of [['Объединение', union], ['Вычитание', subtract], ['Пересечение', intersect]]) {
    if ((await b.count()) !== 1) fail(`A: кнопки «${name}» в тулбаре нет`)
  }
  const boxes = { cube: await boxOf(cube), sphere: await boxOf(sphere), cyl: await boxOf(cyl), cone: await boxOf(cone) }
  await blur(); await page.keyboard.press('Escape'); await waitData('outlineCount', '0', 'A: Esc')
  const orange0 = (await colorPixels('orange')).length
  await pick(cube); await pick(sphere, true)
  await subtract.click(); await blur()
  await page.locator('[data-testid=csg-group-mode], .statusbar').first().waitFor()
  await waitData('outlineACount', '2', 'A: режим вычитания — кайма A у куба и сферы')
  if (!/active/.test((await subtract.getAttribute('class')) ?? '')) fail('A: «Вычитание» в тулбаре не нажата в режиме')
  await pick(cyl); await pick(cone, true)
  await waitData('outlineCount', '2', 'A: B — цилиндр и конус')
  await page.waitForTimeout(200)
  const orange = await colorPixels('orange'), blue = await colorPixels('blue')
  await shot('polish-a-csg-mode.png')
  const oA = [boxes.cube, boxes.sphere].map((b) => inBox(orange, b))
  const notA = orange.filter(([x, y]) => ![boxes.cube, boxes.sphere].some((b) => x >= b.x0 - 8 && x <= b.x1 + 8 && y >= b.y0 - 8 && y <= b.y1 + 8))
  const oB = [boxes.cyl, boxes.cone].map((b) => inBox(notA, b))                // соседняя сфера (A) вплотную к цилиндру — её кайму не считаем
  const bB = [boxes.cyl, boxes.cone].map((b) => inBox(blue, b))
  if (orange0 > 20) fail(`A: до режима оранжевых пикселей ${orange0}`)
  if (oA.some((k) => k < 100)) fail('A: тёплая кайма у группы A (куб / сфера): ' + oA.join(' / '))
  if (oB.some((k) => k > 30)) fail('A: тёплая кайма у группы B (цилиндр / конус): ' + oB.join(' / '))
  if (bB.some((k) => k < 100)) fail('A: холодная кайма у группы B (цилиндр / конус): ' + bB.join(' / '))
  await page.keyboard.press('Escape')
  await waitData('outlineACount', '0', 'A: Esc — режим закрыт')
  ok.push(`A: кнопки CSG в тулбаре (3); «Вычитание» → режим, кнопка нажата; кайма A — оранжевая (${oA.join(' / ')} px), B — синяя (${bB.join(' / ')} px); Esc — каймы A нет`)

  stage = 'итог'
  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('UX-POLISH ✅\n  ' + ok.join('\n  '))
} catch (e) {
  console.error(`UX-POLISH ❌ [${stage}] ${e.message}`)
  if (ok.length) console.error('  пройдено:\n  ' + ok.join('\n  '))
  if (errors.length) console.error('  ошибки консоли: ' + errors.join(' | '))
  await shot('polish-fail.png').catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
