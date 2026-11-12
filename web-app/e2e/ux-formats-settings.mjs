// e2e/ux-formats-settings.mjs — Пакет A (Фаза 13): настройки, темы, звуки, форматы, блокировка.
//
//  A. APP-SETTINGS: шестерёнка в статус-баре → окно; язык ru → en → ru; единицы см — поле X куба
//     «3.00 см», ввод 5 → куб на X = 50 мм; «Сбросить»; настройки переживают перезагрузку; Esc.
//  B. THEME-ENGINE: «Высокий контраст» — фон панели чёрный, data-theme-id; фон сцены — чёрный.
//  C. SFX: клик по кнопке — click, фигура — create, CSG — success; звук выкл. — тишина.
//  D. FORMATS: «Экспорт» — меню STL / OBJ / 3MF / glTF; каждый — файл с верным расширением и
//     содержимым; «Импорт» OBJ — объект в сцене.
//  E. LOCK-OBJECT: замок в дереве → клик по кубу во вьюпорте не выбирает, Ctrl+A — без него,
//     Delete — остаётся (уведомление); снять замок — снова выбирается.
// Ошибок консоли нет. Запуск: `pnpm dev` в одном терминале, `pnpm e2e:ux-formats-settings` в другом.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, placeShape, toolbarButton } from './helpers.mjs'

const shotDir = process.env.E2E_SHOTS ?? null
if (shotDir) fs.mkdirSync(shotDir, { recursive: true })
const { browser, page, errors } = await openApp()
const ok = []
let stage = 'init'
const fail = (msg) => { throw new Error(msg) }
const shot = async (n) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, n) }) }
const vpLoc = page.locator('.viewport-canvas')
const rows = page.locator('.ct-item[data-object-id]')
const ids = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-object-id')))
const waitRows = (n) => page.waitForFunction((k) => document.querySelectorAll('.ct-item[data-object-id]').length === k, n, { timeout: 15000 })
const blur = () => page.evaluate(() => document.activeElement?.blur())
const modal = page.locator('[data-testid=settings-modal]')
const openSettings = async () => { await page.locator('[data-testid=settings-button]').click(); await modal.waitFor({ timeout: 5000 }) }
const closeSettings = async () => { await page.locator('[data-testid=settings-close]').click(); await modal.waitFor({ state: 'detached', timeout: 5000 }) }
const sfx = () => page.evaluate(() => ({ last: document.documentElement.dataset.sfxLast ?? null, count: Number(document.documentElement.dataset.sfxCount ?? 0) }))
const css = (sel, prop) => page.evaluate(({ s, p }) => getComputedStyle(document.querySelector(s))[p], { s: sel, p: prop })
/** Точка на верхней грани объекта на экране (режим размещения сферы — грань под курсором), затем Esc. */
async function topOf(id) {
  const vp = await vpLoc.boundingBox()
  await page.getByText('Сфера', { exact: true }).first().click()
  await page.locator('[data-testid=placement-mode]').waitFor({ timeout: 5000 })
  let hit = null
  for (let j = 0; j < 26 && !hit; j++) for (let i = 0; i < 34 && !hit; i++) {
    const x = vp.x + vp.width * (0.15 + i * 0.7 / 34), y = vp.y + vp.height * (0.2 + j * 0.6 / 26)
    await page.mouse.move(x, y); await page.waitForTimeout(50)
    const h = await vpLoc.evaluate((e) => ({ face: e.dataset.placementFace ?? null, normal: e.dataset.placementNormal ?? null }))
    if (h.face === id && h.normal === '0.00,0.00,1.00') hit = { x, y }
  }
  await page.keyboard.press('Escape')
  await page.locator('[data-testid=placement-mode]').waitFor({ state: 'detached', timeout: 5000 })
  if (!hit) fail(`${stage}: верх объекта ${id} на экране не найден`)
  return hit
}
const selected = () => page.evaluate(() => [...document.querySelectorAll('.ct-item.ct-selected')].map((e) => e.getAttribute('data-object-id')))

try {
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── A. Настройки ──
  stage = 'A. настройки'
  await openSettings()
  if ((await page.locator('#settings-title').textContent()) !== 'Настройки') fail('A: заголовок окна')
  await page.locator('[data-testid=settings-language]').selectOption('en')
  await page.waitForFunction(() => document.querySelector('#settings-title')?.textContent === 'Settings')
  if (!(await page.locator('.statusbar').innerText()).includes('Objects')) fail('A: статус-бар не на английском')
  await page.locator('[data-testid=settings-language]').selectOption('ru')
  await page.waitForFunction(() => document.querySelector('#settings-title')?.textContent === 'Настройки')
  await page.locator('[data-testid=settings-units]').selectOption('cm')
  await closeSettings()
  await placeShape(page, 'Куб'); await waitRows(1)
  await rows.first().click(); await page.waitForTimeout(300)
  const xField = page.locator('.panel-right #num-input-pos-X')
  const unit0 = await page.evaluate(() => document.querySelector('.panel-right #num-input-pos-X')?.closest('.props-row')?.querySelector('.num-label')?.textContent)
  const title0 = await page.locator('.panel-right .props-section-title').first().textContent()
  const size0 = await page.locator('.panel-right #num-input-size-X').inputValue()
  if (unit0 !== 'см' || size0 !== '2.00' || title0 !== 'Позиция (см)') fail(`A: в см — поле «${unit0}», ширина ${size0}, заголовок «${title0}» (ждали «см», 2.00, «Позиция (см)»)`)
  await xField.fill('5'); await xField.press('Enter'); await page.waitForTimeout(500)
  await openSettings(); await page.locator('[data-testid=settings-units]').selectOption('mm'); await closeSettings()
  if ((await xField.inputValue()) !== '50.0') fail('A: ввод 5 см → X = ' + (await xField.inputValue()) + ' мм (ждали 50.0)')
  ok.push('A: язык ru → en → ru; единицы см — ширина куба «2.00 см», ввод X = 5 см → 50.0 мм')
  // перезагрузка: настройки сохраняются; «Сбросить» — по умолчанию; Esc закрывает
  await openSettings(); await page.locator('[data-testid=settings-theme]').selectOption('light'); await page.locator('[data-testid=settings-units]').selectOption('in'); await closeSettings()
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Загрузка CSG'), null, { timeout: 30000 })
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'light') fail('A: тема после перезагрузки не светлая')
  await openSettings()
  if ((await page.locator('[data-testid=settings-units]').inputValue()) !== 'in') fail('A: единицы после перезагрузки')
  await page.locator('[data-testid=settings-reset]').click()
  if ((await page.locator('[data-testid=settings-units]').inputValue()) !== 'mm' || (await page.locator('[data-testid=settings-theme]').inputValue()) !== 'dark') fail('A: «Сбросить» не вернул мм / тёмную')
  await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached', timeout: 5000 })
  ok.push('A: тема и единицы переживают перезагрузку; «Сбросить» — мм и тёмная; Esc закрывает')
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()

  // ── B. Тема «Высокий контраст» ──
  stage = 'B. тема'
  await openSettings(); await page.locator('[data-testid=settings-theme]').selectOption('high-contrast'); await closeSettings()
  await page.waitForTimeout(300)
  const hc = { id: await page.evaluate(() => document.documentElement.getAttribute('data-theme-id')), panel: await css('.panel-right', 'backgroundColor'), text: await css('.statusbar', 'color') }
  await shot('a-high-contrast.png')
  const light = (c) => (c.match(/\d+/g) ?? []).slice(0, 3).every((v) => Number(v) >= 220)
  if (hc.id !== 'high-contrast' || hc.panel !== 'rgb(0, 0, 0)' || !light(hc.text)) fail('B: высокий контраст: ' + JSON.stringify(hc))
  const sceneBg = await page.evaluate(async () => {
    const c = document.querySelector('.viewport-canvas canvas'); const r = c.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  const vpShot = await vpLoc.screenshot({ clip: { x: 5, y: 5, width: 4, height: 4 } })
  void sceneBg
  const pix = await page.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [...g.getImageData(1, 1, 1, 1).data].slice(0, 3) }, vpShot.toString('base64'))
  if (pix.some((v) => v > 30)) fail('B: фон сцены не чёрный: ' + pix)
  await toolbarButton(page, 'Сменить тему').click(); await page.waitForTimeout(200)
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme-id'))) !== 'light') fail('B: кнопка темы из высокого контраста — не светлая')
  await openSettings(); await page.locator('[data-testid=settings-theme]').selectOption('dark'); await closeSettings()
  ok.push(`B: «Высокий контраст» — панель rgb(0, 0, 0), текст ${hc.text}, фон сцены (${pix}); кнопка темы → светлая`)

  // ── C. Звуки ──
  stage = 'C. звуки'
  await page.locator('[data-testid=settings-button]').click()
  let s0 = await sfx()
  if (s0.last !== 'click') fail('C: клик по шестерёнке — не click: ' + JSON.stringify(s0))
  await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' })
  // после перезагрузки сцена — из автосохранения (или пусто): считаем от текущего
  await page.locator('button.tab-btn', { hasText: 'Дерево' }).click()
  const c0 = (await ids()).length
  await placeShape(page, 'Сфера'); await waitRows(c0 + 1)
  if (c0 === 0) { await placeShape(page, 'Куб'); await waitRows(2) }
  s0 = await sfx()
  if (s0.last !== 'create') fail('C: фигура — не create: ' + JSON.stringify(s0))
  const c1 = (await ids()).length
  await blur(); await page.keyboard.press('Control+a'); await toolbarButton(page, 'Объединение').click()
  await waitRows(1); await page.waitForTimeout(300)
  if ((await sfx()).last !== 'success') fail('C: CSG — не success: ' + JSON.stringify(await sfx()))
  await page.keyboard.press('Control+z'); await waitRows(c1); await page.waitForTimeout(300)
  await openSettings(); await page.locator('[data-testid=settings-sound]').uncheck(); await closeSettings()
  const beforeOff = (await sfx()).count             // клик «Закрыть» — уже без звука
  await toolbarButton(page, 'Вписать в экран').click()
  await placeShape(page, 'Куб'); await waitRows(c1 + 1)
  if ((await sfx()).count !== beforeOff) fail('C: звук выключен, а счётчик вырос')
  await openSettings(); await page.locator('[data-testid=settings-sound]').check(); await closeSettings()
  ok.push('C: клик — click, фигура — create, CSG — success; звук выключен — тишина')

  // ── D. Форматы ──
  stage = 'D. форматы'
  await toolbarButton(page, 'Экспорт').click()
  const items = await page.locator('[data-testid=export-menu] [role=menuitem]').allInnerTexts()
  if (items.length !== 4) fail('D: пунктов меню ' + items.length)
  await page.keyboard.press('Escape')
  const got = {}
  for (const f of ['stl', 'obj', '3mf', 'gltf']) {
    const dl = page.waitForEvent('download', { timeout: 15000 })
    await toolbarButton(page, 'Экспорт').click(); await page.locator(`[data-testid=export-menu-${f}]`).click()
    const d = await dl
    const p = path.join(os.tmpdir(), `tc-e2e-${Date.now()}-${d.suggestedFilename()}`); await d.saveAs(p)
    const buf = fs.readFileSync(p); fs.rmSync(p)
    got[f] = { name: d.suggestedFilename(), size: buf.length, head: buf.subarray(0, 32).toString('latin1') }
  }
  if (!got.stl.name.endsWith('.stl') || got.stl.size !== 84 + 50 * Number((await page.locator('.statusbar').innerText()).match(/Треуг\.: ([\d\s]+)/)[1].replace(/\s/g, ''))) fail('D: STL ' + JSON.stringify(got.stl))
  if (!got.obj.name.endsWith('.obj') || !got.obj.head.startsWith('# TinkerCraft Web')) fail('D: OBJ ' + JSON.stringify(got.obj))
  if (!got['3mf'].name.endsWith('.3mf') || !got['3mf'].head.startsWith('PK')) fail('D: 3MF ' + JSON.stringify(got['3mf']))
  if (!got.gltf.name.endsWith('.gltf') || !got.gltf.head.includes('"asset"')) fail('D: glTF ' + JSON.stringify(got.gltf))
  // импорт OBJ (тот, что выгрузили, — куб и сфера на одном файле)
  const objFile = path.join(os.tmpdir(), `tc-e2e-box-${Date.now()}.obj`)
  fs.writeFileSync(objFile, 'v -5 -5 -5\nv 5 -5 -5\nv 5 5 -5\nv -5 5 -5\nv -5 -5 5\nv 5 -5 5\nv 5 5 5\nv -5 5 5\nf 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\nf 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\nf 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n')
  const n0 = (await ids()).length
  const fc = page.waitForEvent('filechooser'); await toolbarButton(page, 'Импорт').click(); (await fc).setFiles(objFile)
  await waitRows(n0 + 1); fs.rmSync(objFile)
  ok.push(`D: меню «Экспорт» — 4 формата; STL ${got.stl.size} Б, OBJ, 3MF (ZIP), glTF (JSON); «Импорт» OBJ — объект в сцене`)

  // ── E. Блокировка ──
  stage = 'E. блокировка'
  // куб — последний добавленный (раздел C); после перезагрузки id прежнего куба мог смениться
  const cube = (await ids())[c1]
  const top = await topOf(cube)
  await page.mouse.click(top.x, top.y); await page.waitForTimeout(300)
  if ((await selected()).join() !== cube) fail('E: до блокировки клик не выбрал куб: ' + (await selected()))
  await page.locator(`.ct-item[data-object-id="${cube}"] [data-testid=obj-lock]`).click(); await page.waitForTimeout(300)
  if ((await page.locator('[data-testid=props-lock]').getAttribute('aria-pressed')) !== 'true') fail('E: панель свойств не «Заблокирован»')
  if (!(await xField.isDisabled())) fail('E: поле X не отключено')
  await page.mouse.click(top.x - 300, top.y + 200); await page.waitForTimeout(200)
  await page.mouse.click(top.x, top.y); await page.waitForTimeout(300)
  if ((await selected()).includes(cube)) fail('E: заблокированный выбрался кликом во вьюпорте')
  await blur(); await page.keyboard.press('Control+a'); await page.waitForTimeout(200)
  if ((await selected()).includes(cube)) fail('E: Ctrl+A выбрал заблокированный')
  await page.locator(`.ct-item[data-object-id="${cube}"] .ct-name`).click(); await blur(); await page.keyboard.press('Delete'); await page.waitForTimeout(400)
  if (!(await ids()).includes(cube)) fail('E: заблокированный удалён')
  if (!(await page.locator('.toast-msg').allInnerTexts()).some((t) => t.includes('Заблокированный объект не удаляется'))) fail('E: нет уведомления об удалении')
  await shot('e-locked.png')
  await page.locator(`.ct-item[data-object-id="${cube}"] [data-testid=obj-lock]`).click(); await page.waitForTimeout(200)
  await page.mouse.click(top.x - 300, top.y + 200); await page.waitForTimeout(200)
  await page.mouse.click(top.x, top.y); await page.waitForTimeout(300)
  if (!(await selected()).includes(cube)) fail('E: после снятия замка клик не выбрал куб')
  if ((await page.locator('.tl-label').allInnerTexts()).filter((t) => /Заблокировать|Разблокировать/.test(t)).length !== 2) fail('E: в истории нет шагов «Заблокировать» / «Разблокировать»')
  ok.push('E: замок — клик и Ctrl+A не выбирают, Delete — остаётся (уведомление), поля отключены; снять — выбирается; 2 шага в истории')

  if (errors.length) fail('ошибки консоли: ' + errors.join(' | '))
  console.log('e2e ux-formats-settings OK\n' + ok.map((s) => '  ✅ ' + s).join('\n'))
} catch (e) {
  console.error(`e2e ux-formats-settings FAIL [${stage}] — ${e.message.split('\n')[0]}\n` + ok.map((s) => '  ✅ ' + s).join('\n'))
  await shot('fail.png')
  process.exitCode = 1
} finally {
  await browser.close()
}
