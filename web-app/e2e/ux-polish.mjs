// e2e/ux-polish.mjs — ux-polish: четыре правки.
//  A. CSG-GROUP-UI: кнопки «Объединение» / «Вычитание» / «Пересечение» — в тулбаре; выбрал куб и сферу →
//     «Вычитание» в тулбаре → режим (кнопка нажата), A — оранжевая (тёплая) кайма вокруг куба и сферы,
//     выбрал цилиндр и конус (B) — синяя (холодная) кайма вокруг них; Esc — каймы A нет.
//  B. CLEANUP-TREE-SNAPSHOT: куб − сфера (режим) → CSG с 2 детьми в дереве → сдвиг X → undo ×2 — снова куб и
//     сфера, redo ×2 — CSG с теми же детьми, X на месте; undo / redo без ошибок (снимков дерева нет).
//  C. SHADOW-BOUNDS-400 (чистая сцена): куб у начала координат и на X = 600 / 1500 (раньше за краем области
//     теней ±200 мм) → «Вписать» → тень есть (пиксели, темнее с кубом, чем со скрытым кубом), центр области
//     теней (data-shadow-center) — у куба; отдалились — тень есть, область больше.
//  D. DIMENSION-UNDO (чистая сцена): два куба → «Размер» (D) → точка куба 1 → точка куба 2 → размер в списке
//     → выбрать его, Delete — удалён → Ctrl+Z — вернулся (то же число), «Повторить» активна → Ctrl+Y — удалён →
//     кнопки «Отменить» / «Повторить» тулбара — то же; история документа не изменилась (2/2).
// Ошибок консоли нет. Логика — src/__tests__/ux-polish.test.tsx.
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-polish` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/ux-polish.mjs /tmp/shots`.
import path from 'node:path'
import { openApp, placeShape, toolbarButton, csgModeStart, csgModeConfirm } from './helpers.mjs'

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
const shotPage = async (p, name) => { if (shotDir) await p.screenshot({ path: path.join(shotDir, name) }) }
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

  // ── B: CLEANUP-TREE-SNAPSHOT — undo / redo без снимков дерева ──
  stage = 'B. CLEANUP-TREE-SNAPSHOT'
  await page.locator('.statusbar').waitFor()
  const histText = async () => (await page.locator('.statusbar').innerText()).match(/История: (\d+)\/(\d+)/)
  const waitHist = (k) => page.waitForFunction((k) => new RegExp(`История: ${k}/`).test(document.querySelector('.statusbar')?.textContent ?? ''), k, { timeout: 30000 })
  // сцена A: куб, сфера, цилиндр, конус — вычитаем сферу из куба
  const h0 = Number((await histText())[1])
  await pick(cube); await csgModeStart(page, 'subtract'); await pick(sphere); await csgModeConfirm(page)
  await waitRows(3); await waitHist(h0 + 1)
  const root = (await ids()).find((i) => ![cyl, cone].includes(i))
  const expand = async () => {
    const ch = page.locator(`.ct-item[data-object-id="${root}"] .ct-chevron`)
    if ((await page.locator('.ct-child').count()) === 0) await ch.click()
    await page.waitForFunction(() => document.querySelectorAll('.ct-child').length === 2, null, { timeout: 10000 })
      .catch(async () => fail(`B: детей CSG в дереве ${await page.locator('.ct-child').count()}, ожидалось 2`))
    return page.locator('.ct-child').allInnerTexts()
  }
  const kids0 = await expand()
  await pick(root)
  const fx = page.locator('.panel-right #num-input-pos-X'); await fx.fill('40'); await fx.press('Enter'); await waitHist(h0 + 2)
  await page.waitForTimeout(200)
  const undoB = toolbarButton(page, 'Отменить'), redoB = toolbarButton(page, 'Повторить')
  await undoB.click(); await waitHist(h0 + 1)
  await undoB.click(); await waitHist(h0)
  await waitRows(4)
  if (JSON.stringify((await ids()).sort()) !== JSON.stringify([cube, sphere, cyl, cone].sort())) fail('B: undo — не куб, сфера, цилиндр, конус: ' + (await ids()).join(', '))
  await redoB.click(); await waitHist(h0 + 1); await waitRows(3)
  await redoB.click(); await waitHist(h0 + 2)
  const kids1 = await expand()
  if (JSON.stringify(kids1) !== JSON.stringify(kids0)) fail(`B: дети CSG после redo ${JSON.stringify(kids1)}, было ${JSON.stringify(kids0)}`)
  await pick(root)
  const x = Number((await page.locator('.panel-right #num-input-pos-X').inputValue()).replace(',', '.'))
  if (Math.abs(x - 40) > 0.01) fail('B: после redo X = ' + x)
  await shot('polish-b-undo-redo.png')
  ok.push(`B: куб − сфера → CSG (${kids0.length} ребёнка) → X 40 → undo ×2 — куб и сфера на месте, redo ×2 — CSG с теми же детьми, X 40`)

  // ── C: SHADOW-BOUNDS-400 — тени за пределами 400 × 400 ──
  stage = 'C. SHADOW-BOUNDS-400'
  {
    const s2 = await openApp()
    const p2 = s2.page
    try {
      const vp2 = p2.locator('.viewport-canvas')
      await p2.locator('button.tab-btn', { hasText: 'Дерево' }).click()
      await placeShape(p2, 'Куб')
      await p2.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1)
      const cid = await p2.locator('.ct-item[data-object-id]').first().getAttribute('data-object-id')
      const row = p2.locator(`.ct-item[data-object-id="${cid}"]`)
      const setPos = async (x) => {
        await row.click()
        for (const [f, v] of [['X', x], ['Z', 10]]) { const el = p2.locator(`.panel-right #num-input-pos-${f}`); await el.fill(String(v)); await el.press('Enter'); await p2.waitForTimeout(250) }
      }
      /** Кадр, который больше не меняется (анимация «вписать» и демпфирование камеры закончились; на CPU — дольше). */
      const frame = async () => {
        const clip = await vp2.boundingBox()
        const t0 = Date.now()
        let prev = await p2.screenshot({ clip })
        for (;;) {
          await p2.waitForTimeout(300)
          const cur = await p2.screenshot({ clip })
          if (Buffer.compare(prev, cur) === 0) return cur
          if (Date.now() - t0 > 20000) fail('C: вид не успокаивается')
          prev = cur
        }
      }
      /** Пикселей тени: кадр с кубом темнее кадра со скрытым кубом (все каналы ≥ 4). */
      const shadowPx = async (wheel = 0) => {
        await p2.evaluate(() => document.activeElement?.blur()); await p2.keyboard.press('KeyF')
        await p2.waitForTimeout(1500)
        const b = await vp2.boundingBox()
        for (let i = 0; i < wheel; i++) { await p2.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p2.mouse.wheel(0, 300); await p2.waitForTimeout(40) }
        await p2.keyboard.press('Escape'); await p2.waitForTimeout(300)
        const on = await frame()
        const ds = await vp2.evaluate((e) => ({ half: Number(e.dataset.shadowHalf), center: e.dataset.shadowCenter }))
        await row.click(); await p2.locator('.panel-right button', { hasText: 'Да' }).click(); await p2.waitForTimeout(200)
        await p2.keyboard.press('Escape'); await p2.waitForTimeout(400)
        const off = await frame()
        await row.click(); await p2.locator('.panel-right button', { hasText: 'Нет' }).click(); await p2.waitForTimeout(200)
        const n = await p2.evaluate(async ([a, c]) => {
          const load = async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data }
          const p = await load(a), q = await load(c)
          let k = 0
          for (let i = 0; i < p.length; i += 4) if (q[i] - p[i] >= 4 && q[i + 1] - p[i + 1] >= 4 && q[i + 2] - p[i + 2] >= 4) k++
          return k
        }, [on.toString('base64'), off.toString('base64')])
        return { n, ...ds }
      }
      const res = []
      for (const [x, wheel] of [[0, 0], [600, 0], [1500, 0], [1500, 8]]) {
        await setPos(x)
        const r = await shadowPx(wheel)
        const cx = Number(r.center.split(',')[0])
        if (r.n < 150) fail(`C: куб на X = ${x}${wheel ? ', отдалились' : ''} — тени нет (${r.n} px)`)
        if (r.n > 20000) fail(`C: куб на X = ${x} — «тень» ${r.n} px: кадры с кубом и без отличаются целиком (вид сдвинулся)`)
        if (Math.abs(cx - x) > 60) fail(`C: центр области теней ${r.center}, куб на X = ${x}`)
        if (x >= 600 && !wheel && r.half < 200) fail(`C: область теней ±${r.half} мм`)
        res.push(`X ${x}${wheel ? ' (отдалились)' : ''}: тень ${r.n} px, область ±${r.half} мм у ${r.center}`)
        if (x === 1500) await shotPage(p2, wheel ? 'polish-c-shadow-far.png' : 'polish-c-shadow-1500.png')
      }
      if (s2.errors.length) fail('C: ошибки консоли: ' + s2.errors.join(' | '))
      ok.push('C: ' + res.join('; '))
    } finally {
      await s2.browser.close()
    }
  }

  // ── D: DIMENSION-UNDO — удалить размер → Ctrl+Z → вернулся, Ctrl+Y → удалён ──
  stage = 'D. DIMENSION-UNDO'
  {
    const s3 = await openApp()
    const p3 = s3.page
    try {
      const vp3 = p3.locator('.viewport-canvas')
      const dimRows = p3.locator('[data-testid=dimension-row]')
      await p3.locator('button.tab-btn', { hasText: 'Дерево' }).click()
      await placeShape(p3, 'Куб'); await placeShape(p3, 'Куб')
      await p3.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2)
      const [c1, c2] = await p3.locator('.ct-item[data-object-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
      await p3.evaluate(() => document.activeElement?.blur()); await p3.keyboard.press('KeyF'); await p3.waitForTimeout(1500)
      const vb = await vp3.boundingBox()
      await p3.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2)
      await p3.keyboard.press('KeyD')
      await p3.locator('[data-testid=dimension-mode]').waitFor({ timeout: 5000 })
      const probe = async (x, y) => {
        await p3.mouse.move(x, y); await p3.waitForTimeout(90)
        const h = await vp3.getAttribute('data-dimension-hover')
        if (!h) return null
        const [id] = h.split('|')
        return { x, y, id }
      }
      let A = null, B = null
      for (let j = 0; j < 14 && !(A && B); j++) for (let i = 0; i < 22 && !(A && B); i++) {
        const h = await probe(vb.x + vb.width * (0.25 + i * 0.5 / 22), vb.y + vb.height * (0.25 + j * 0.5 / 14))
        if (h?.id === c1 && !A) A = h
        if (h?.id === c2 && !B) B = h
      }
      if (!A || !B) fail(`D: точки на кубах не найдены (A ${!!A}, B ${!!B})`)
      await p3.mouse.move(A.x, A.y); await p3.waitForTimeout(120); await p3.mouse.click(A.x, A.y)
      await p3.waitForFunction(() => document.querySelector('.viewport-canvas')?.getAttribute('data-dimension-mode') === 'b', null, { timeout: 5000 })
      await p3.mouse.move(B.x, B.y); await p3.waitForTimeout(150); await p3.mouse.click(B.x, B.y)
      await dimRows.first().waitFor({ timeout: 5000 })
      await p3.keyboard.press('Escape')
      await p3.locator('[data-testid=dimension-mode]').waitFor({ state: 'detached', timeout: 5000 })
      const rowText = await dimRows.first().innerText()
      const hist = async () => (await p3.locator('.statusbar').innerText()).match(/История: (\d+\/\d+)/)[1]
      const h0 = await hist()
      const undoBtn = toolbarButton(p3, 'Отменить'), redoBtn = toolbarButton(p3, 'Повторить')
      const rowsAre = (n, what) => p3.waitForFunction((k) => document.querySelectorAll('[data-testid=dimension-row]').length === k, n, { timeout: 5000 })
        .catch(async () => fail(`D: ${what} — размеров в списке ${await dimRows.count()}, ожидалось ${n}`))
      // выбрать размер в списке → Delete
      await dimRows.first().click()
      await p3.evaluate(() => document.activeElement?.blur())
      await p3.keyboard.press('Delete')
      await rowsAre(0, 'Delete')
      if ((await p3.locator('.ct-item[data-object-id]').count()) !== 2) fail('D: Delete удалил объекты')
      if (!(await undoBtn.isEnabled())) fail('D: «Отменить» неактивна после удаления размера')
      await p3.keyboard.press('Control+z')
      await rowsAre(1, 'Ctrl+Z')
      if ((await dimRows.first().innerText()) !== rowText) fail(`D: вернулся другой размер: ${await dimRows.first().innerText()} (был ${rowText})`)
      if (!(await redoBtn.isEnabled())) fail('D: «Повторить» неактивна после Ctrl+Z удаления')
      await shot('polish-d-undo.png')
      await p3.keyboard.press('Control+y')
      await rowsAre(0, 'Ctrl+Y')
      await undoBtn.click()
      await rowsAre(1, '«Отменить» в тулбаре')
      await redoBtn.click()
      await rowsAre(0, '«Повторить» в тулбаре')
      await undoBtn.click()
      await rowsAre(1, '«Отменить» ещё раз')
      if ((await hist()) !== h0) fail(`D: история документа изменилась: ${h0} → ${await hist()}`)
      if ((await p3.locator('.ct-item[data-object-id]').count()) !== 2) fail('D: объекты изменились')
      if (s3.errors.length) fail('D: ошибки консоли: ' + s3.errors.join(' | '))
      ok.push(`D: размер «${rowText.replace(/\s+/g, ' ')}» → Delete — удалён → Ctrl+Z — вернулся, «Повторить» активна → Ctrl+Y — удалён; кнопки тулбара — то же; история ${h0} не изменилась`)
    } finally {
      await s3.browser.close()
    }
  }

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
