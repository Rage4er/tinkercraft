// e2e/double-click-timing.mjs — DOUBLE-CLICK-TIMING в браузере: фильтр двойного клика по фигуре
// палитры (повтор той же фигуры раньше 200 мс — отбрасывается, UX-AUDIT-9) меряет интервал по
// времени КЛИКА (`event.timeStamp`), а не по времени обработки.
// Медленный CPU — по-настоящему: главный поток занят долгой задачей, клики приходят в это время и
// ждут в очереди ввода браузера (клики — сырым CDP `Input.dispatchMouseEvent`, без ожидания
// обработки, как от мыши; `page.mouse.click` ждёт обработки и очередь не создаёт). Что очередь
// была, проверяется по самим событиям: обработаны подряд, а `timeStamp` — через заданный интервал.
//  A. поток занят 900 мс, клики через 300 мс → обработаны подряд → ДВЕ фигуры (было: одна).
//  B. поток занят 900 мс, клики через 100 мс → обработаны подряд → ОДНА фигура (защита).
//  C. долгая задача сразу после первого клика, второй через 100 мс ждёт её → обработан через
//     > 200 мс → ОДНА фигура (было: две).
//  D. без нагрузки (быстрый CPU): клики через 100 мс — одна, через 300 мс — две.
//  E. палитра не уезжает: до 14 фигур (история переполняет свой список) левая панель не
//     прокручивается, «Куб» на месте; текущий шаг виден — прокручен список истории.
//     Клики по одной точке через 300 мс при 9+ фигурах → две (было: панель уезжала на строку
//     с каждой фигурой — второй клик мимо «Куба», флейк UX-AUDIT-9 в CI).
// Перед каждой парой проверяется, что «Куб» там же, где в начале (окно 1400×850, как в ux-audit).
// Уведомлений и ошибок консоли нет. Логика — __tests__/double-click-timing.test.tsx (WASM).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:double-click-timing` в другом.
import os from 'node:os'
import path from 'node:path'
import { openApp } from './helpers.mjs'

const { browser, page, errors } = await openApp()
let stage = 'старт'
const fail = (msg) => { throw new Error(msg) }
const cubeBtn = page.locator('.shape-btn', { hasText: 'Куб' }).first()
const cubes = () => page.locator('.ct-item[data-object-id]').count()
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const cdp = await page.context().newCDPSession(page)

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  // клики по палитре (capture): время клика и время обработки
  await page.evaluate(() => {
    window.__clicks = []
    window.addEventListener('click', (e) => {
      if (e.target.closest?.('.shape-btn')) window.__clicks.push({ ts: e.timeStamp, handled: performance.now() })
    }, true)
  })
  const box = await cubeBtn.boundingBox()
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]

  /** Клик сырым CDP: ввод уходит в браузер сразу, даже если главный поток занят (не ждём обработки). */
  const rawClick = () => Promise.all(['mousePressed', 'mouseReleased'].map((type) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })))
  /** Долгая задача на главном потоке страницы (медленный CPU: кадр, сборка фигуры). */
  const longTask = (ms) => page.evaluate((d) => {
    setTimeout(() => { const t = performance.now(); while (performance.now() - t < d) { /* занят */ } }, 0)
  }, ms)
  /** Пара кликов → ожидаемое число новых фигур; интервалы событий (время клика, обработки), мс. */
  async function pair(label, expected, run) {
    stage = label
    await page.waitForTimeout(400)                            // прошлая пара не мешает фильтру
    const b = await cubeBtn.boundingBox()
    if (Math.abs(b.y - box.y) > 1) fail(`палитра сдвинулась (${box.y} → ${b.y}): клики не по «Кубу»`)
    await page.evaluate(() => { window.__clicks = [] })
    const n0 = await cubes()
    await run()
    await page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length >= k, n0 + expected, { timeout: 15000 })
      .catch(async () => fail(`${label}: добавлено ${(await cubes()) - n0}, ожидалось ${expected}`))
    await page.waitForTimeout(1200)                           // лишняя фигура успела бы появиться
    const added = (await cubes()) - n0
    if (added !== expected) fail(`${label}: добавлено ${added}, ожидалось ${expected}`)
    const c = await page.evaluate(() => window.__clicks)
    if (c.length !== 2) fail(`${label}: событий click ${c.length}, ожидалось 2`)
    const t = { clicked: Math.round(c[1].ts - c[0].ts), handled: Math.round(c[1].handled - c[0].handled) }
    if (await toasts()) fail(`${label}: уведомления ${await toasts()}`)
    return t
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // ── A. занятый поток, клики через 300 мс → две ──
  {
    const t = await pair('A. занят, 300 мс', 2, async () => {
      await longTask(900); await page.waitForTimeout(50)
      const p1 = rawClick(); await sleep(300); const p2 = rawClick()
      await Promise.all([p1, p2])
    })
    if (t.handled > 100 || t.clicked < 280) fail(`A: очереди не было (клик ${t.clicked} мс, обработка ${t.handled} мс)`)
    console.log(`✅ A. поток занят: клики через ${t.clicked} мс обработаны через ${t.handled} мс → 2 фигуры`)
  }

  // ── B. занятый поток, клики через 100 мс → одна ──
  {
    const t = await pair('B. занят, 100 мс', 1, async () => {
      await longTask(900); await page.waitForTimeout(50)
      const p1 = rawClick(); await sleep(100); const p2 = rawClick()
      await Promise.all([p1, p2])
    })
    if (t.handled > 100 || t.clicked > 180) fail(`B: очереди не было (клик ${t.clicked} мс, обработка ${t.handled} мс)`)
    console.log(`✅ B. поток занят: двойной клик через ${t.clicked} мс (обработка через ${t.handled} мс) → 1 фигура`)
  }

  // ── C. долгая задача после первого клика: второй (через 100 мс) обработан позже 200 мс → одна ──
  {
    const t = await pair('C. задача после 1-го, 100 мс', 1, async () => {
      const t0 = Date.now()
      await rawClick()                                         // обработан сразу
      await longTask(700)
      await sleep(Math.max(0, 100 - (Date.now() - t0)))
      await rawClick()                                         // ждёт конца задачи
    })
    if (t.handled < 250 || t.clicked > 180) fail(`C: второй клик не ждал (клик ${t.clicked} мс, обработка ${t.handled} мс)`)
    console.log(`✅ C. долгая задача после клика: двойной клик через ${t.clicked} мс обработан через ${t.handled} мс → 1 фигура`)
  }

  // ── D. без нагрузки: 100 мс — одна, 300 мс — две ──
  {
    const t1 = await pair('D. без нагрузки, 100 мс', 1, async () => {
      await page.mouse.click(x, y); await page.waitForTimeout(100); await page.mouse.click(x, y)
    })
    const t2 = await pair('D. без нагрузки, 300 мс', 2, async () => {
      await page.mouse.click(x, y); await page.waitForTimeout(300); await page.mouse.click(x, y)
    })
    console.log(`✅ D. без нагрузки: через ${t1.clicked} мс → 1 фигура, через ${t2.clicked} мс → 2`)
  }

  // ── E. палитра не уезжает, история прокручивается в своём списке ──
  {
    stage = 'E. палитра на месте'
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
      await page.waitForTimeout(250)                             // не двойной клик
      await page.mouse.click(x, y)
      await page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n + 1, { timeout: 15000 })
      await page.waitForTimeout(400)                             // плавная прокрутка истории
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
    const t = await pair('E. 14 фигур, 300 мс по одной точке', 2, async () => {
      await page.mouse.click(x, y); await page.waitForTimeout(300); await page.mouse.click(x, y)
    })
    if ((await layout()).panel !== 0) fail('после пары левая панель прокрутилась')
    console.log(`✅ E. 14+ фигур: левая панель не прокручивается, «Куб» на месте; история — в своём списке (прокрутка ${after.listTop} px); 300 мс (${t.clicked}) → 2 фигуры`)
  }

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
