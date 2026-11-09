// e2e/double-click-timing.mjs — клики по фигуре палитры на медленном CPU и неподвижная палитра.
// DOUBLE-CLICK-TIMING (v1.3.6) мерил фильтр двойного клика по иконке по времени клика; с PLUG-AND-PLAY
// клик по иконке только включает режим размещения, фигура появляется, когда её ставят (клик по сетке
// / грани, Enter) — фильтр удалён. Здесь — что клики, в т. ч. пришедшие из очереди подряд, дают ровно
// столько фигур, сколько размещений, и что палитра не уезжает из-под курсора (TIMELINE-SCROLL-FIX).
// Медленный CPU — по-настоящему: главный поток занят долгой задачей, клики приходят в это время и
// ждут в очереди ввода браузера (сырым CDP `Input.dispatchMouseEvent`, без ожидания обработки, как от
// мыши; `page.mouse.click` ждёт обработки и очередь не создаёт). Что очередь была, проверяется по
// самим событиям: обработаны подряд, а `timeStamp` — через заданный интервал.
//  A. поток занят 900 мс, два клика по «Кубу» через 300 мс (обработаны подряд) → один режим, 0 фигур;
//     Enter → ровно 1.
//  B. поток занят 900 мс: клик по «Кубу», через 300 мс клик по сетке (оба в очереди) → 1 фигура, там,
//     где был клик (стоит на сетке).
//  C. без нагрузки: «Куб» → двойной клик по сетке → 1 фигура (второй клик — уже не размещение).
//  E. палитра не уезжает: до 14 фигур (история переполняет свой список) левая панель не
//     прокручивается, «Куб» на месте; текущий шаг виден — прокручен список истории; клик по иконке
//     в одной и той же точке + Enter, через 300 мс ещё раз → 2 фигуры (раньше панель уезжала на строку
//     с каждой фигурой — второй клик мимо «Куба», флейк UX-AUDIT-9 в CI).
// Перед каждой проверкой — «Куб» там же, где в начале (окно 1400×850, как в ux-audit).
// Уведомлений и ошибок консоли нет. Логика — __tests__/double-click-timing.test.tsx (WASM).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:double-click-timing` в другом.
import os from 'node:os'
import path from 'node:path'
import { openApp } from './helpers.mjs'

const { browser, page, errors } = await openApp()
let stage = 'старт'
const fail = (msg) => { throw new Error(msg) }
const cubeBtn = page.locator('.shape-btn', { hasText: 'Куб' }).first()
const rows = page.locator('.ct-item[data-object-id]')
const cubes = () => rows.count()
const mode = page.locator('[data-testid=placement-mode]')
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const cdp = await page.context().newCDPSession(page)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitCubes = (k) => page.waitForFunction((n) => document.querySelectorAll('.ct-item[data-object-id]').length === n, k, { timeout: 15000 })

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  // клики (capture): по палитре или по вьюпорту — время клика и время обработки
  await page.evaluate(() => {
    window.__clicks = []
    for (const type of ['click', 'pointerup']) window.addEventListener(type, (e) => {
      const where = e.target.closest?.('.shape-btn') ? 'palette' : e.target.closest?.('.viewport-canvas') ? 'viewport' : null
      if (where && (type === 'click') === (where === 'palette')) window.__clicks.push({ where, ts: e.timeStamp, handled: performance.now() })
    }, true)
  })
  const box = await cubeBtn.boundingBox()
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  const vp = await page.locator('.viewport-canvas').boundingBox()
  const [gx, gy] = [vp.x + vp.width * 0.5, vp.y + vp.height * 0.62]   // сетка перед камерой

  /** Клик сырым CDP: ввод уходит в браузер сразу, даже если главный поток занят (не ждём обработки). */
  const rawClick = (px, py) => Promise.all(['mousePressed', 'mouseReleased'].map((type) =>
    cdp.send('Input.dispatchMouseEvent', { type, x: px, y: py, button: 'left', clickCount: 1 })))
  /** Долгая задача на главном потоке страницы (медленный CPU: кадр, сборка фигуры). */
  const longTask = (ms) => page.evaluate((d) => {
    setTimeout(() => { const t = performance.now(); while (performance.now() - t < d) { /* занят */ } }, 0)
  }, ms)
  const clicks = () => page.evaluate(() => window.__clicks)
  async function before(label) {
    stage = label
    await page.waitForTimeout(300)
    const b = await cubeBtn.boundingBox()
    if (Math.abs(b.y - box.y) > 1) fail(`палитра сдвинулась (${box.y} → ${b.y}): клики не по «Кубу»`)
    await page.evaluate(() => { window.__clicks = [] })
    return cubes()
  }
  /** Очередь была: два события обработаны подряд, а время клика — через `gap` мс. */
  function assertQueued(c, gap, what) {
    if (c.length !== 2) fail(`${what}: событий ${c.length}, ожидалось 2 (${JSON.stringify(c)})`)
    const clicked = Math.round(c[1].ts - c[0].ts), handled = Math.round(c[1].handled - c[0].handled)
    if (handled > 100 || clicked < gap - 20) fail(`${what}: очереди не было (клик ${clicked} мс, обработка ${handled} мс)`)
    return { clicked, handled }
  }

  // ── A. занятый поток, два клика по иконке через 300 мс → один режим, 0 фигур; Enter → 1 ──
  {
    const n0 = await before('A. два клика по иконке в очереди')
    await longTask(900); await page.waitForTimeout(50)
    const p1 = rawClick(x, y); await sleep(300); const p2 = rawClick(x, y)
    await Promise.all([p1, p2])
    await mode.waitFor({ timeout: 5000 })
    await page.waitForTimeout(800)
    if ((await cubes()) !== n0) fail(`A: клики по иконке добавили ${(await cubes()) - n0} фигур(ы)`)
    const t = assertQueued(await clicks(), 300, 'A')
    await page.keyboard.press('Enter')
    await waitCubes(n0 + 1)
    await page.waitForTimeout(800)
    if ((await cubes()) !== n0 + 1) fail(`A: Enter добавил ${(await cubes()) - n0} фигур(ы)`)
    console.log(`✅ A. поток занят: клики по иконке через ${t.clicked} мс обработаны через ${t.handled} мс → один режим, 0 фигур; Enter → 1`)
  }

  // ── B. занятый поток: иконка, через 300 мс клик по сетке (оба в очереди) → 1 фигура в точке клика ──
  {
    const n0 = await before('B. иконка + сетка в очереди')
    await page.mouse.move(gx, gy)                             // курсор над сценой: место превью известно заранее
    await longTask(900); await page.waitForTimeout(50)
    const p1 = rawClick(x, y); await sleep(300); const p2 = rawClick(gx, gy)
    await Promise.all([p1, p2])
    await waitCubes(n0 + 1).catch(async () => fail(`B: добавлено ${(await cubes()) - n0}, ожидалась 1`))
    await page.waitForTimeout(800)
    if ((await cubes()) !== n0 + 1) fail(`B: добавлено ${(await cubes()) - n0}, ожидалась 1`)
    if (await mode.count()) fail('B: режим размещения не выключился')
    const c = await clicks()
    const clicked = Math.round(c[1].ts - c[0].ts), handled = Math.round(c[1].handled - c[0].handled)
    if (c.length !== 2 || handled > 100 || clicked < 280) fail(`B: очереди не было (${JSON.stringify(c)})`)
    // новая фигура — последняя строка; её Z = 10 (куб стоит на сетке), не в начале координат
    await rows.last().click()
    const z = await page.locator('.panel-right input').nth(3).inputValue()
    if (Math.abs(Number(z) - 10) > 0.01) fail(`B: куб не на сетке — Z = ${z}`)
    console.log(`✅ B. поток занят: иконка и клик по сетке через ${clicked} мс обработаны через ${handled} мс → 1 фигура на сетке (Z = ${z})`)
  }

  // ── C. без нагрузки: «Куб» → двойной клик по сетке → 1 фигура ──
  {
    const n0 = await before('C. двойной клик по сетке')
    await cubeBtn.click()
    await mode.waitFor({ timeout: 5000 })
    await page.mouse.move(gx + 40, gy)
    await page.mouse.dblclick(gx + 40, gy)
    await waitCubes(n0 + 1)
    await page.waitForTimeout(800)
    if ((await cubes()) !== n0 + 1) fail(`C: двойной клик по сетке добавил ${(await cubes()) - n0} фигур(ы)`)
    console.log('✅ C. без нагрузки: «Куб» → двойной клик по сетке → 1 фигура')
  }

  // ── E. палитра не уезжает, история прокручивается в своём списке ──
  {
    stage = 'E. палитра на месте'
    await page.mouse.click(vp.x + 10, vp.y + vp.height - 10)  // снять выделение
    const layout = () => page.evaluate(() => {
      const list = document.querySelector('.tl-list')
      const cur = list.querySelector('.tl-item.current')
      const l = list.getBoundingClientRect(), c = cur?.getBoundingClientRect()
      return {
        panel: document.querySelector('.panel-left').scrollTop,
        overflow: list.scrollHeight > list.clientHeight + 1,
        listTop: list.scrollTop,
        currentVisible: !!c && c.top >= l.top - 1 && c.bottom <= l.bottom + 1,
      }
    })
    while ((await cubes()) < 14) {
      const n = await cubes()
      await page.mouse.click(x, y)                             // в одной и той же точке экрана
      await mode.waitFor({ timeout: 5000 })
      await page.keyboard.press('Enter')
      await waitCubes(n + 1)
      await page.waitForTimeout(400)                           // плавная прокрутка истории
      const b = await cubeBtn.boundingBox()
      const st = await layout()
      if (st.panel !== 0 || Math.abs(b.y - box.y) > 1) fail(`${n + 1} фигур: левая панель прокручена на ${st.panel} px, «Куб» ${box.y} → ${b.y}`)
    }
    const st = await layout()
    if (!st.overflow) fail('история не переполнила свой список — проверка прокрутки ничего не проверила')
    await page.waitForFunction(() => {
      const list = document.querySelector('.tl-list'); const cur = list.querySelector('.tl-item.current')
      const l = list.getBoundingClientRect(), c = cur.getBoundingClientRect()
      return c.top >= l.top - 1 && c.bottom <= l.bottom + 1
    }, null, { timeout: 5000 }).catch(async () => fail(`текущий шаг истории не виден: ${JSON.stringify(await layout())}`))
    const after = await layout()
    if (after.listTop <= 0) fail('список истории не прокрутился к текущему шагу')
    const n0 = await before('E. 14 фигур, два размещения через 300 мс')
    await page.mouse.click(x, y); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    await page.mouse.click(x, y); await page.keyboard.press('Enter')
    await waitCubes(n0 + 2).catch(async () => fail(`E: добавлено ${(await cubes()) - n0}, ожидалось 2`))
    if ((await layout()).panel !== 0) fail('после размещений левая панель прокрутилась')
    console.log(`✅ E. 14+ фигур: левая панель не прокручивается, «Куб» на месте; история — в своём списке (прокрутка ${after.listTop} px); два размещения через 300 мс → 2 фигуры`)
  }

  if (await toasts()) fail('уведомления: ' + (await toasts()))
  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('DOUBLE-CLICK-TIMING e2e: OK')
} catch (e) {
  console.error(`DOUBLE-CLICK-TIMING e2e FAIL [${stage}]:`, e.message)
  if (errors.length) console.error(errors.join('\n'))
  await page.screenshot({ path: path.join(os.tmpdir(), 'double-click-timing-fail.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
