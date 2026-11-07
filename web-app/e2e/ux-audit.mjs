// e2e/ux-audit.mjs — UX-AUDIT (v1.3.2): прогон «как пользователь».
//
// Две части:
//  ✅  ожидание оправдывается — проверка падает при регрессии (сценарии, которых нет в
//      других e2e: 7 примитивов и их поля, интерфейс, .3dtc и STL через UI, «удалить всё»
//      + undo, объект на 100k треугольников);
//  🐞  известные баги (DEVELOPMENT_PLAN.md › «UX-AUDIT») — `known(id, …)` проверяет
//      ОЖИДАНИЕ пользователя и требует, чтобы оно сейчас НЕ выполнялось (баг воспроизводится).
//      Если ожидание выполнилось — баг, видимо, исправлен: прогон падает с просьбой
//      перенести проверку в ✅ (аналог `it.fails` в vitest).
// Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-audit` в другом.
// Необязательный аргумент — каталог для скриншотов: `node e2e/ux-audit.mjs /tmp/ux`.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, panelButton, toolbarButton } from './helpers.mjs'

const shotDir = process.argv[2]
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-audit-'))
const { browser, page, errors } = await openApp()
const fail = (msg) => { throw new Error(msg) }
const right = page.locator('.panel-right')
const rows = page.locator('.ct-item[data-object-id]')
const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const steps = () => page.locator('.tl-item').count()
const status = async () => (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ')
const toasts = async () => (await page.locator('.toast-msg').allTextContents()).join(' | ')
const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }) }
const ok = []
const known = []

async function add(label) {
  const before = new Set(await ids())
  await page.getByText(label, { exact: true }).first().click()
  await page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, before.size + 1, { timeout: 15000 })
  return (await ids()).find((i) => !before.has(i))
}
async function pick(id) {
  await page.locator(`.ct-item[data-object-id="${id}"]`).click()
  await page.waitForFunction((k) => {
    const sel = document.querySelectorAll('.ct-item.ct-selected')
    return sel.length === 1 && sel[0].getAttribute('data-object-id') === k
  }, id, { timeout: 5000 })
  await page.waitForTimeout(150)
}
async function setPos(id, axis, value) {
  await pick(id)
  const n = await steps()
  const f = right.locator(`#num-input-pos-${axis}`)
  await f.fill(String(value)); await f.press('Enter')
  await page.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k + 1, n, { timeout: 10000 })
}
/** «Очистить сцену» → подтверждение (UX-AUDIT-2) → пусто. */
async function clearScene() {
  if ((await rows.count()) === 0 && (await steps()) === 0) return     // очищать нечего — модалки нет
  await toolbarButton(page, 'Очистить сцену').click()
  await page.locator('[data-testid=confirm-modal]').getByRole('button', { name: 'Очистить', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 0, null, { timeout: 10000 })
}
/** Поля панели свойств выделенного объекта: «метка=значение». */
const fields = () => right.locator('.props-row').evaluateAll((rs) => rs.map((r) => {
  const l = r.querySelector('.props-label')?.textContent?.trim(); const i = r.querySelector('input')
  return l && i ? `${l}=${i.value}` : null
}).filter(Boolean))
/** Известный баг: `expectation` бросает (ожидание не выполнено) — баг на месте. */
async function knownBug(id, title, expectation) {
  let reproduced = false
  try { await expectation() } catch (e) { reproduced = true; known.push(`${id} ${title} — ${e.message}`) }
  if (!reproduced) fail(`${id} (${title}): ожидание выполнилось — баг исправлен? Перенести проверку в ✅ и обновить DEVELOPMENT_PLAN`)
}
/** Замкнутая UV-сфера ~100k треугольников (бинарный STL). */
function bigSphereStl(file) {
  const R = 30, rings = 225, segs = 224
  const P = (i, j) => { const th = Math.PI * i / rings, ph = 2 * Math.PI * j / segs; return [R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th)] }
  const tris = []
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1)
    if (i !== 0) tris.push([a, b, d]); if (i !== rings - 1) tris.push([b, c, d])
  }
  const buf = Buffer.alloc(84 + tris.length * 50); buf.writeUInt32LE(tris.length, 80)
  tris.forEach((t, k) => t.flat().forEach((v, m) => buf.writeFloatLE(v, 84 + k * 50 + 12 + m * 4)))
  fs.writeFileSync(file, buf)
  return tris.length
}

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── ✅ A. 7 примитивов: добавляются, у каждого — поля трансформа и свои размеры ──
  const DIMS = {
    'Куб': ['Ширина=20.0', 'Высота=20.0', 'Глубина=20.0'], 'Сфера': ['Радиус=12.0'],
    'Цилиндр': ['Радиус=10.0', 'Высота=20.0'], 'Конус': ['Радиус=10.0', 'Высота=24.0'],
    'Тор': ['Радиус тора=15.0', 'Радиус трубки=4.0'], 'Призма': ['Радиус=12.0', 'Высота=20.0'],
    'Пирамида': ['Радиус=12.0', 'Высота=20.0'],
  }
  for (const [label, dims] of Object.entries(DIMS)) {
    const id = await add(label)
    await pick(id)
    const f = await fields()
    for (const d of ['rotX=0.0', ...dims]) if (!f.includes(d)) fail(`${label}: нет поля ${d} (${f.join(', ')})`)
    if (!(await page.locator(`.ct-item[data-object-id="${id}"]`).innerText()).includes(label)) fail(`${label}: имя в дереве`)
  }
  ok.push('A: 7 примитивов, поля трансформа и размеров')
  await shot('ux-a-shapes.png')

  // ── ✅ E. Интерфейс: левая панель 320px, 3 столбца, версия, тема, фильтр Timeline ──
  const lp = await page.locator('.panel-left').boundingBox()
  if (Math.round(lp.width) !== 320) fail('ширина левой панели ' + lp.width)
  const cols = (await page.locator('.shape-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ').length
  if (cols !== 3) fail('столбцов фигур ' + cols)
  if (!(await status()).includes(`v${VERSION}`)) fail(`в статус-баре нет v${VERSION}`)
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const bg0 = await bg()
  await toolbarButton(page, 'Сменить тему').click(); await page.waitForTimeout(200)
  if ((await bg()) === bg0) fail('тема не сменилась')
  await toolbarButton(page, 'Сменить тему').click(); await page.waitForTimeout(200)
  await page.locator('.tl-filter-toggle').click()
  const addFilter = page.locator('.tl-filter-row', { hasText: 'Добавить' }).locator('input')
  await addFilter.uncheck(); await page.waitForTimeout(200)
  if ((await steps()) !== 0) fail('фильтр «Добавить» не скрыл шаги')
  await addFilter.check(); await page.locator('.tl-filter-toggle').click()
  ok.push(`E: панель 320px, 3 столбца, v${VERSION}, тема, фильтр Timeline`)

  // ── ✅ G. «Удалить всё» (Ctrl+A, Delete) → Ctrl+Z возвращает ──
  const before = (await ids()).length
  await page.locator('.viewport-canvas').click({ position: { x: 15, y: 15 } })
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 0, null, { timeout: 10000 })
  await page.keyboard.press('Control+z')
  await page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, before, { timeout: 10000 })
  ok.push('G: удалить всё → Ctrl+Z')

  // ── ✅ F. Сохранить .3dtc → очистить → открыть: объекты, история, дерево; экспорт STL ──
  await clearScene()
  const cube = await add('Куб'); const sph = await add('Сфера')
  await setPos(sph, 'X', 12)
  await pick(cube); await page.locator(`.ct-item[data-object-id="${sph}"]`).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Объединение').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })
  const hist0 = await page.locator('.tl-item').allInnerTexts()
  const tris0 = (await status()).match(/Треуг\.: ([\d\s]+)/)[1].replace(/\s/g, '')
  const dl = page.waitForEvent('download'); await toolbarButton(page, 'Сохранить').click()
  const proj = path.join(tmp, 'p.3dtc'); await (await dl).saveAs(proj)
  if ((await status()).includes('Не сохранено')) fail('после сохранения остался «Не сохранено»')
  const dl2 = page.waitForEvent('download'); await toolbarButton(page, 'Экспорт').click()
  const stl = path.join(tmp, 'e.stl'); await (await dl2).saveAs(stl)
  const sbuf = fs.readFileSync(stl)
  if (String(sbuf.readUInt32LE(80)) !== tris0 || sbuf.length !== 84 + sbuf.readUInt32LE(80) * 50) fail(`STL: ${sbuf.readUInt32LE(80)} треугольников, в сцене ${tris0}`)
  await clearScene()
  const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Открыть').click(); (await fc).setFiles(proj)
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })
  if (JSON.stringify(await page.locator('.tl-item').allInnerTexts()) !== JSON.stringify(hist0)) fail('история после открытия .3dtc другая')
  await page.locator('.ct-item[data-object-id] .ct-chevron').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-child').length === 2, null, { timeout: 10000 })
  ok.push(`F: .3dtc сохранить/открыть (история, дерево), STL ${tris0} треугольников`)

  // ── ✅ G. Объект на 100k треугольников: импорт, вычитание, отмена — без зависаний ──
  await clearScene()
  const nBig = bigSphereStl(path.join(tmp, 'big.stl'))
  let t = Date.now()
  const fc2 = page.waitForEvent('filechooser'); await toolbarButton(page, 'Импорт').click(); (await fc2).setFiles(path.join(tmp, 'big.stl'))
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 30000 })
  const tImport = Date.now() - t
  const big = (await ids())[0]
  const c2 = await add('Куб')
  await pick(big); await page.locator(`.ct-item[data-object-id="${c2}"]`).click({ modifiers: ['Shift'] })
  t = Date.now(); await panelButton(page, 'Вычитание').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 30000 })
  const tCsg = Date.now() - t
  if (tImport > 10000 || tCsg > 15000) fail(`100k: импорт ${tImport} мс, вычитание ${tCsg} мс`)
  if (await toasts()) fail('100k: уведомления ' + (await toasts()))
  ok.push(`G: ${nBig} треугольников — импорт ${tImport} мс, вычитание ${tCsg} мс`)

  // ── 🐞 Известные баги ──
  await clearScene()
  await add('Куб'); await add('Сфера')

  // ── ✅ UX-AUDIT-2: «Очистить сцену» — подтверждение (Отмена / Esc не очищают), Ctrl+Z возвращает ──
  {
    const modal = page.locator('[data-testid=confirm-modal]')
    const hist = await page.locator('.tl-item').allInnerTexts()
    await toolbarButton(page, 'Очистить сцену').click()
    await modal.waitFor({ timeout: 5000 })
    await modal.getByRole('button', { name: 'Отмена', exact: true }).click()
    if ((await modal.count()) !== 0 || (await rows.count()) !== 2) fail('UX-AUDIT-2: «Отмена» в подтверждении очистила сцену')
    await toolbarButton(page, 'Очистить сцену').click(); await modal.waitFor({ timeout: 5000 })
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    if ((await modal.count()) !== 0 || (await rows.count()) !== 2) fail('UX-AUDIT-2: Esc в подтверждении очистил сцену')
    await clearScene()
    if (await toolbarButton(page, 'Отменить').isDisabled()) fail('UX-AUDIT-2: после очистки «Отменить» неактивна')
    await page.keyboard.press('Control+z')
    await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2, null, { timeout: 10000 })
    if (JSON.stringify(await page.locator('.tl-item').allInnerTexts()) !== JSON.stringify(hist)) fail('UX-AUDIT-2: история после отмены очистки другая')
    if (!(await status()).includes('Не сохранено')) fail('UX-AUDIT-2: после отмены очистки нет «Не сохранено»')
    ok.push('UX-AUDIT-2: «Очистить сцену» — подтверждение (Отмена, Esc), Ctrl+Z возвращает объекты и историю')
  }

  // ── ✅ UX-AUDIT-4: пересечение непересекающихся — уведомление, объекты и история не тронуты ──
  {
    const [p, q] = await ids()
    await pick(p); await page.locator(`.ct-item[data-object-id="${q}"]`).click({ modifiers: ['Shift'] })
    const n = await steps()
    await panelButton(page, 'Пересечение').click()
    await page.locator('.toast-msg', { hasText: 'Результат CSG пуст' }).waitFor({ timeout: 10000 })
      .catch(async () => fail('UX-AUDIT-4: нет уведомления о пустом результате: ' + (await toasts())))
    if ((await rows.count()) !== 2 || (await steps()) !== n) fail(`UX-AUDIT-4: объекты ${await rows.count()}, шагов ${await steps()} (было ${n})`)
    ok.push('UX-AUDIT-4: пересечение непересекающихся — уведомление, 2 объекта, история без шага')
    await page.locator('.toast').first().click().catch(() => {})   // закрыть уведомление (клик)
  }

  // UX-AUDIT-5: горячие клавиши из подсказок не работают (Tab, L, U, M; по коду — ещё N, B, X, I)
  const a5 = await add('Куб'); const b5 = await add('Сфера')
  await knownBug('UX-AUDIT-5', 'сочетания из подсказок', async () => {
    await pick(a5); await page.locator(`.ct-item[data-object-id="${b5}"]`).click({ modifiers: ['Shift'] })
    await page.evaluate(() => document.activeElement?.blur())
    const dead = []
    const cam = toolbarButton(page, 'Перспектива ↔ Ортография')
    const c0 = await cam.getAttribute('class'); await page.keyboard.press('Tab'); await page.waitForTimeout(300)
    if ((await cam.getAttribute('class')) === c0) dead.push('Tab')
    await page.evaluate(() => document.activeElement?.blur())
    const r0 = await toolbarButton(page, 'Линейка').getAttribute('class'); await page.keyboard.press('KeyL'); await page.waitForTimeout(300)
    if ((await toolbarButton(page, 'Линейка').getAttribute('class')) === r0) dead.push('L')
    const n0 = await steps(); await page.keyboard.press('KeyU'); await page.waitForTimeout(800)
    if ((await steps()) === n0) dead.push('U')
    const n1 = await steps(); await page.keyboard.press('KeyM'); await page.waitForTimeout(800)
    if ((await steps()) === n1) dead.push('M')
    if (dead.length) throw new Error('не работают: ' + dead.join(', '))
  })

  // UX-AUDIT-3: куб − 3D-текст → отказ «меш не замкнут… Проверьте STL»
  await clearScene()
  const c3 = await add('Куб')
  const b3 = new Set(await ids())
  await page.getByText('Текст', { exact: true }).first().click()
  await page.locator('.text-modal-backdrop').waitFor({ timeout: 5000 })
  await page.locator('.text-modal-backdrop input').first().fill('A')
  await page.locator('.text-modal-backdrop button.btn.primary').click()
  await page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k + 1, b3.size, { timeout: 15000 })
  const txt = (await ids()).find((i) => !b3.has(i))
  await knownBug('UX-AUDIT-6', '3D-текст в дереве назван «Импорт»', async () => {
    const name = await page.locator(`.ct-item[data-object-id="${txt}"]`).innerText()
    if (!name.includes('Текст')) throw new Error('строка дерева: ' + name.replace(/\s+/g, ' '))
  })
  await setPos(txt, 'X', 0); await setPos(txt, 'Z', 8)
  // ── ✅ UX-AUDIT-3: куб − 3D-текст (гравировка) — CSG выполняется, без уведомлений ──
  await pick(c3); await page.locator(`.ct-item[data-object-id="${txt}"]`).click({ modifiers: ['Shift'] })
  await panelButton(page, 'Вычитание').click()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 1, null, { timeout: 15000 })
    .catch(async () => fail('UX-AUDIT-3: куб − текст не выполнен; уведомление: ' + (await toasts())))
  if (await toasts()) fail('UX-AUDIT-3: уведомления после куб − текст: ' + (await toasts()))
  ok.push('UX-AUDIT-3: куб − 3D-текст «A» → CSG-результат, без уведомлений')
  await shot('ux-text-csg.png')

  // ── ✅ UX-AUDIT-1: автосохранение → перезагрузка → работа и история на месте, уведомление ──
  await clearScene()
  await add('Куб'); await add('Сфера')
  await page.waitForTimeout(3500)                         // AUTOSAVE_DELAY_MS + запас
  const savedOps = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('tinkercraft-v1')
    r.onsuccess = () => { const g = r.result.transaction('autosave', 'readonly').objectStore('autosave').getAll(); g.onsuccess = () => res(g.result[0]?.operations?.length ?? 0) }
    r.onerror = () => res(-1)
  }))
  const saved = await savedOps()
  if (saved < 2) fail('автосохранение не записалось в IndexedDB: операций ' + saved)
  const hist1 = await page.locator('.tl-item').allInnerTexts()
  const reload = async () => {
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('canvas', { timeout: 20000 })
    await page.waitForFunction(() => !document.body.innerText.includes('Загрузка CSG'), null, { timeout: 30000 })
    await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()   // вкладка не запоминается
  }
  await reload()
  await page.waitForFunction(() => document.querySelectorAll('.ct-item[data-object-id]').length === 2, null, { timeout: 15000 })
    .catch(async () => fail(`UX-AUDIT-1: в IndexedDB ${saved} операций, после перезагрузки: ${(await status()).match(/Объектов: \d+/)?.[0]}`))
  if (JSON.stringify(await page.locator('.tl-item').allInnerTexts()) !== JSON.stringify(hist1)) fail('UX-AUDIT-1: история после восстановления другая')
  if (!(await toasts()).includes('Прошлая сессия восстановлена')) fail('UX-AUDIT-1: нет уведомления о восстановлении: ' + (await toasts()))
  if (!(await status()).includes('Не сохранено')) fail('UX-AUDIT-1: восстановленная работа не помечена «Не сохранено»')
  await clearScene()
  await reload(); await page.waitForTimeout(1500)
  if ((await rows.count()) !== 0) fail('UX-AUDIT-1: после «Очистить сцену» и перезагрузки вернулась очищенная сессия')
  ok.push(`UX-AUDIT-1: автосохранение (${saved} оп.) → перезагрузка → 2 объекта, история, уведомление; очистка → пусто`)

  if (errors.length) fail('ошибки в консоли:\n' + errors.join('\n'))
  console.log('e2e ux-audit OK')
  for (const s of ok) console.log('  ✅ ' + s)
  for (const s of known) console.log('  🐞 known: ' + s)
} catch (e) {
  console.error('e2e ux-audit FAIL —', e.message)
  for (const s of ok) console.error('  ✅ ' + s)
  process.exitCode = 1
} finally {
  await browser.close()
  fs.rmSync(tmp, { recursive: true, force: true })
}
