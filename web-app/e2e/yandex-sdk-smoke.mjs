// e2e/yandex-sdk-smoke.mjs — smoke SDK Яндекс.Игр (только ветка yandex-games), 7 пунктов:
//   1. initPlatform — YaGames.init, «SDK initialized successfully», экономика активна, без ReferenceError
//   2. loadFromCloud — прогресс (токены) после перезагрузки приходит из облака SDK (player.getData),
//      а не из localStorage приложения (ключ tinkercraft-economy удаляется перед перезагрузкой)
//   3. loadingReady — LoadingAPI.ready() ровно один раз, после загрузки CSG
//   4. GameplayAPI — stop при каждой модалке (онбординг, аренда, текст, проекты, экспорт, импорт,
//      «Настройки размеров», «Очистить сцену?»), start при закрытии
//   5. Реклама — sticky-баннер при старте; rewarded за токены (+50, досмотр — onRewarded)
//   6. exportStl('tokens' | 'ad') — оплата токенами (списание 50 − кэшбэк) и рекламой (кэшбэк)
//   7. Квесты — прогресс по сцене (evaluateQuests после мутаций), начисление при сохранении (commitQuests)
//
// Что проверяется — production-сборка `dist-yandex` (её архив уходит в консоль Яндекс.Игр) с
// SDK-адаптером dev-режима Яндекса (настоящий `yandex-dev-adapter.js` с моками, без платформы) —
// то же, что `npx @yandex-games/sdk-dev-proxy -p dist-yandex --dev-mode=true` (статика + подмена /sdk.js),
// но без прокси (он открывает системный браузер и падает без дисплея):
//   pnpm build:yandex
//   python3 -m http.server 8090 --directory dist-yandex
//   node e2e/yandex-sdk-smoke.mjs     # YA_URL=http://localhost:8090/; /sdk.js → адаптер с yastatic.net
// Через прокси: YA_URL=https://localhost:8080/ YA_PROXY=1 (адаптер отдаёт сам прокси).
// SDK-адаптер dev-режима отдаёт язык en, облако — localStorage (ключ webgames-dev-adapter),
// rewarded — оверлей с таймером 3 с.
// Вызовы SDK перехватываются обёрткой window.YaGames до загрузки sdk.js — журнал в window.__smoke.
import { chromium } from 'playwright'
import { GL_ARGS, placeShape } from './helpers.mjs'

const URL = process.env.YA_URL ?? 'http://localhost:8090/'
/** SDK-адаптер dev-режима — тот же файл, что отдаёт sdk-dev-proxy --dev-mode */
const DEV_ADAPTER = 'http://yastatic.net/s3/games-static/sdk-dev/yandex-dev-adapter.js'
const adapter = process.env.YA_PROXY ? null : await (await fetch(DEV_ADAPTER)).text()
const results = []
const ok = (n, msg) => { results.push(`✅ ${n}: ${msg}`); console.log(`✅ ${n}: ${msg}`) }
const fail = (n, msg) => { results.push(`❌ ${n}: ${msg}`); console.error(`❌ ${n}: ${msg}`); process.exitCode = 1 }

/** Подписи интерфейса: язык задаёт SDK (dev-адаптер — по языку браузера) */
const LABELS = {
  ru: { cube: 'Куб', sphere: 'Сфера', cylinder: 'Цилиндр', text: 'Текст', skip: 'Пропустить', cancel: 'Отмена', pm: 'Менеджер проектов', export: 'Экспорт', import: 'Импорт', dimension: 'Размер', clear: 'Очистить сцену', rent: /^Арендовать за/, pay: /^Оплатить \d+ токенов/, watch: /^Посмотреть рекламу/, save: 'Сохранить', included: 'Кэшбэк учтён' },
  en: { cube: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', text: 'Text', skip: 'Skip', cancel: 'Cancel', pm: 'Project Manager', export: 'Export', import: 'Import', dimension: 'Dimension', clear: 'Clear Scene', rent: /^Rent for/, pay: /^Pay \d+ tokens/, watch: /^Watch ad/, save: 'Save', included: 'Cashback included' },
}
let L = LABELS.en

/** Перехват SDK (до любого скрипта страницы): init → обёртки LoadingAPI / GameplayAPI / adv / player. */
function trapSdk() {
  const S = (window.__smoke = { calls: [] })
  const log = (name) => S.calls.push(name)
  const wrap = (obj, key, name) => {
    if (!obj || typeof obj[key] !== 'function' || obj[key].__smoke) return
    const orig = obj[key].bind(obj)
    obj[key] = (...a) => { log(name); return orig(...a) }
    obj[key].__smoke = true
  }
  const wrapSdk = (sdk) => {
    const f = sdk.features ?? {}
    wrap(f.LoadingAPI, 'ready', 'LoadingAPI.ready')
    wrap(f.GameplayAPI, 'start', 'GameplayAPI.start')
    wrap(f.GameplayAPI, 'stop', 'GameplayAPI.stop')
    for (const m of ['showRewardedVideo', 'showFullscreenAdv', 'showBannerAdv', 'hideBannerAdv']) wrap(sdk.adv, m, 'adv.' + m)
    if (typeof sdk.getPlayer === 'function' && !sdk.getPlayer.__smoke) {
      const gp = sdk.getPlayer.bind(sdk)
      sdk.getPlayer = async (...a) => {
        const p = await gp(...a)
        for (const m of ['getData', 'setData', 'getStats', 'setStats']) wrap(p, m, 'player.' + m)
        return p
      }
      sdk.getPlayer.__smoke = true
    }
    return sdk
  }
  let ya
  Object.defineProperty(window, 'YaGames', {
    configurable: true,
    get() { return ya },
    set(v) {
      ya = v
      if (v && typeof v.init === 'function' && !v.init.__smoke) {
        const init = v.init.bind(v)
        v.init = async (...a) => { log('YaGames.init'); return wrapSdk(await init(...a)) }
        v.init.__smoke = true
      }
    },
  })
}

async function open(ctx, query = '') {
  const page = await ctx.newPage()
  const errors = []; const logs = []; const downloads = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
  page.on('download', (d) => downloads.push(d.suggestedFilename()))
  await page.addInitScript(trapSdk)
  if (adapter) await page.route(/\/sdk\.js$/, (r) => r.fulfill({ contentType: 'application/javascript', body: adapter }))
  await page.goto(URL + query, { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30000 })
  await page.waitForFunction(() => !/Загрузка CSG|Loading CSG/.test(document.body.innerText), null, { timeout: 60000 })
  await page.waitForFunction(() => !!window.__tcEconomy, null, { timeout: 15000 })
  return { page, errors, logs, downloads }
}

const calls = (page) => page.evaluate(() => [...window.__smoke.calls])
const eco = (page, expr) => page.evaluate(`(() => { const s = window.__tcEconomy.state(); return (${expr}) })()`)
const lastGameplay = async (page) => (await calls(page)).filter((c) => c.startsWith('GameplayAPI')).at(-1)
async function until(page, fn, ms = 6000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(100) }
  return false
}
const gameplayIs = (page, want) => until(page, async () => (await lastGameplay(page)) === `GameplayAPI.${want}`)
const tb = (page, name) => page.getByRole('toolbar').getByRole('button', { name, exact: true })
/** Досмотреть rewarded-оверлей dev-адаптера: таймер 3 с, затем «крестик» — onRewarded + onClose. */
async function watchAd(page) {
  const cross = page.locator('#ADV_BANNER img.webgames-adv-cross')
  await cross.waitFor({ timeout: 10000 })
  await page.waitForTimeout(3300)
  await cross.click()
  await page.locator('#ADV_BANNER').waitFor({ state: 'detached', timeout: 5000 })
}

const browser = await chromium.launch({ args: GL_ARGS })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 850 }, acceptDownloads: true })
try {
  // ── Сессия 1: новый игрок, debug-выдача 3000 TC (UB3-3: ?debug-tokens) ──
  const s1 = await open(ctx, '?debug-tokens=3000')
  const { page } = s1
  L = (await page.locator('.shape-lbl').first().textContent()) === 'Куб' ? LABELS.ru : LABELS.en

  // 1. initPlatform
  {
    const c = await calls(page)
    const inited = s1.logs.some((l) => l.includes('[Yandex] SDK initialized successfully'))
    const refErr = s1.errors.filter((e) => /ReferenceError/.test(e))
    const economy = await page.evaluate(() => document.documentElement.hasAttribute('data-economy'))
    const tokens = await eco(page, 's.tokens')
    if (c[0] === 'YaGames.init' && inited && !refErr.length && economy && tokens === 3000) ok(1, `initPlatform — YaGames.init → «SDK initialized successfully», экономика активна (html[data-economy], панель 240 px), debug-выдача 3000 TC, ReferenceError нет`)
    else fail(1, `init=${c[0]} logged=${inited} economy=${economy} tokens=${tokens} refErr=${refErr.join(' | ')}`)
  }

  // 3. loadingReady
  {
    const n = (await calls(page)).filter((x) => x === 'LoadingAPI.ready').length
    const sent = s1.logs.some((l) => l.includes('[Yandex] LoadingAPI.ready() sent'))
    n === 1 && sent ? ok(3, 'LoadingAPI.ready() — ровно один раз, после загрузки CSG') : fail(3, `LoadingAPI.ready ×${n}, лог ${sent}`)
  }

  // 5a. sticky-баннер при старте
  {
    const c = await calls(page)
    c.includes('adv.showBannerAdv') ? ok('5a', 'реклама: sticky-баннер при старте (adv.showBannerAdv)') : fail('5a', 'showBannerAdv не вызван: ' + c.join(','))
  }

  // 4. GameplayAPI: онбординг нового игрока → «Skip»; затем каждая модалка
  const gp = []
  const checkModal = async (name, openFn, closeFn) => {
    await openFn()
    const stopped = await gameplayIs(page, 'stop')
    await closeFn()
    const started = await gameplayIs(page, 'start')
    gp.push(`${name}: ${stopped ? 'stop' : '—'}/${started ? 'start' : '—'}`)
    return stopped && started
  }
  let allGp = true
  {
    const skip = page.getByRole('button', { name: L.skip, exact: true })
    if (await skip.isVisible().catch(() => false)) {
      const stopped = (await lastGameplay(page)) === 'GameplayAPI.stop'
      await skip.click()
      const started = await gameplayIs(page, 'start')
      gp.push(`онбординг: ${stopped ? 'stop' : '—'}/${started ? 'start' : '—'}`)
      allGp &&= stopped && started
    } else { gp.push('онбординг: не показан'); allGp = false }
  }
  await placeShape(page, L.cube)
  await page.keyboard.press('Escape')   // снять выделение — панель экономики
  allGp &&= await checkModal('аренда 3D-текста', () => page.getByText(L.text, { exact: true }).first().click(),
    () => page.getByRole('button', { name: L.cancel, exact: true }).click())
  allGp &&= await checkModal('проекты', () => tb(page, L.pm).click(), () => page.keyboard.press('Escape'))
  allGp &&= await checkModal('экспорт', () => tb(page, L.export).click(), () => page.getByRole('button', { name: L.cancel, exact: true }).click())
  allGp &&= await checkModal('импорт', () => tb(page, L.import).click(), () => page.getByRole('button', { name: L.cancel, exact: true }).click())
  allGp &&= await checkModal('настройки размеров', async () => { await tb(page, L.dimension).click(); await page.locator('[data-testid=dimension-menu-settings]').click() },
    () => page.keyboard.press('Escape'))
  allGp &&= await checkModal('очистить сцену?', () => tb(page, L.clear).click(), () => page.getByRole('button', { name: L.cancel, exact: true }).click())
  // аренда 3D-текста за токены → модалка текста (тоже пауза)
  {
    await page.getByText(L.text, { exact: true }).first().click()
    await page.getByRole('button', { name: L.rent }).click()
    const textModal = page.locator('.text-modal-input')
    const rented = await textModal.waitFor({ timeout: 5000 }).then(() => true, () => false)
    const stopped = await gameplayIs(page, 'stop')
    await page.keyboard.press('Escape')
    const started = await gameplayIs(page, 'start')
    gp.push(`текст (после аренды 75 TC): ${rented && stopped ? 'stop' : '—'}/${started ? 'start' : '—'}`)
    allGp &&= rented && stopped && started
  }
  allGp ? ok(4, 'GameplayAPI — пауза при каждой модалке, продолжение при закрытии: ' + gp.join('; ')) : fail(4, gp.join('; '))

  // 5b. rewarded за токены: +50
  {
    await page.keyboard.press('Escape')
    const before = await eco(page, 's.tokens')
    await page.locator('.panel-right button', { hasText: '+50' }).nth(1).click()   // 1-я «+50» — бонус дня, 2-я — реклама
    await watchAd(page)
    const got = await until(page, async () => (await eco(page, 's.tokens')) === before + 50)
    const c = await calls(page)
    got && c.includes('adv.showRewardedVideo') ? ok('5b', `реклама: rewarded за токены — досмотр → +50 (${before} → ${before + 50}), геймплей на паузе во время ролика`) : fail('5b', `токены ${before} → ${await eco(page, 's.tokens')}`)
  }

  // 6. exportStl: токены, затем реклама (модель изменена — иначе кэшбэка нет по анти-фарму)
  {
    await placeShape(page, L.sphere)
    const t0 = await eco(page, 's.tokens')
    await tb(page, L.export).click()
    await page.getByRole('button', { name: L.pay }).click()
    const dl1 = await until(page, async () => s1.downloads.length === 1, 10000)
    const t1 = await eco(page, 's.tokens')
    const paid = t0 - t1
    const includedToast = await page.locator('.toast-msg', { hasText: L.included }).count()
    await placeShape(page, L.cylinder)
    await tb(page, L.export).click()
    await page.getByRole('button', { name: L.watch }).click()
    await watchAd(page)
    const dl2 = await until(page, async () => s1.downloads.length === 2, 10000)
    const t2 = await eco(page, 's.tokens')
    const cashback = s1.logs.some((l) => /Cashback V2 claimed/.test(l))
    if (dl1 && dl2 && paid > 0 && paid <= 50 && includedToast && t2 > t1 && cashback) ok(6, `exportStl('tokens') — STL скачан, списано ${paid} TC (50 − кэшбэк), тост «кэшбэк учтён»; exportStl('ad') — досмотр → STL, кэшбэк +${t2 - t1} TC`)
    else fail(6, `dl1=${dl1} dl2=${dl2} paid=${paid} toast=${includedToast} t1=${t1} t2=${t2} cashback=${cashback} downloads=${s1.downloads.join(',')}`)
  }

  // 7. Квесты: 3 задания дня; прогресс заданий «по сцене» = подсчёт по сцене (evaluateQuests после
  //    мутаций); выполнить одно-два задания действиями в редакторе; сохранение в проект →
  //    commitQuests → награда токенами + облако (player.setData)
  {
    const quests = () => eco(page, 's.todayQuests.map((x) => ({ trigger: x.trigger, progress: x.progress, target: x.target, completed: x.completed, reward: x.reward, difficulty: x.difficulty }))')
    const names = () => page.evaluate(() => [...document.querySelectorAll('.object-list-label, .ct-item[data-object-id] .ct-name')].map((e) => e.textContent.trim().split(' ')[0]))
    const q0 = await quests()
    const n0 = await names()
    const scene = { count_objects: n0.length, count_cubes: n0.filter((n) => n === L.cube).length, count_unique_shapes: new Set(n0).size }
    // evaluateQuests: progress = min(подсчёт, цель); выполненное — замирает на цели
    const bad = q0.filter((x) => x.trigger in scene && x.progress !== (x.completed ? x.target : Math.min(scene[x.trigger], x.target)))
    // выполнить задания, которые делаются парой действий
    const rows = page.locator('.object-list-item, .ct-item[data-object-id]')
    const selectN = async (k) => { await rows.nth(0).click(); for (let i = 1; i < k; i++) await rows.nth(i).click({ modifiers: ['Shift'] }); await page.evaluate(() => document.activeElement?.blur()) }
    const extra = { ru: ['Конус', 'Тор', 'Призма', 'Пирамида'], en: ['Cone', 'Torus', 'Prism', 'Pyramid'] }[L === LABELS.ru ? 'ru' : 'en']
    const done = []
    for (const x of q0.filter((x) => !x.completed)) {
      if (x.trigger === 'count_unique_shapes') { for (const sh of extra.slice(0, Math.max(0, x.target - scene.count_unique_shapes))) await placeShape(page, sh); done.push(x.trigger) }
      else if (x.trigger === 'count_cubes' && x.target <= 6) { for (let i = scene.count_cubes; i < x.target; i++) await placeShape(page, L.cube); done.push(x.trigger) }
      else if (x.trigger === 'count_objects' && x.target <= 20) { for (let i = (await names()).length; i < x.target; i++) await placeShape(page, L.cube); done.push(x.trigger) }
      else if (x.trigger === 'count_csg' || x.trigger === 'csg_complex') { await selectN(x.trigger === 'csg_complex' ? 3 : 2); await page.keyboard.press('KeyU'); await page.waitForTimeout(1500); done.push(x.trigger) }
      else if (x.trigger === 'count_mirrored') { for (let i = 0; i < x.target; i++) { await selectN(1); await page.keyboard.press('KeyM'); await page.waitForTimeout(800) } done.push(x.trigger) }
    }
    await page.keyboard.press('Escape')
    const q1 = await quests()
    // награда при сохранении — за выполненные и ещё не начисленные (экспорт тоже вызывает commitQuests)
    const paidBefore = await eco(page, 's.todayQuestsCompleted')
    const completed = q1.filter((x) => x.completed && !paidBefore.includes(x.difficulty))
    const t0 = await eco(page, 's.tokens')
    await tb(page, L.pm).click()
    await page.locator('.modal-box input.modal-input').fill('smoke')
    await page.locator('.modal-box button.btn.primary').click()
    await page.waitForTimeout(1000)
    await page.keyboard.press('Escape')
    const committedLog = await until(page, async () => s1.logs.some((l) => l.includes('[Economy] Quest rewards committed to cloud')))
    const t1 = await eco(page, 's.tokens')
    const reward = completed.reduce((a, x) => a + x.reward, 0)
    const cloud = (await calls(page)).includes('player.setData')
    const qs = q1.map((x) => `${x.trigger} ${x.progress}/${x.target}${x.completed ? ' ✓' : ''}`).join(', ')
    if (q0.length === 3 && !bad.length && completed.length && committedLog && t1 - t0 === reward && cloud)
      ok(7, `квесты — 3 задания дня, прогресс по сцене совпал (${JSON.stringify(scene)}); выполнены действиями (${done.join(', ')}) → ${qs}; сохранение проекта → commitQuests: +${reward} TC, облако (player.setData)`)
    else fail(7, `q0 ${JSON.stringify(q0)}; несовпадение ${JSON.stringify(bad)}; сцена ${JSON.stringify(scene)}; после ${qs}; commitLog=${committedLog} Δ=${t1 - t0} reward=${reward} cloud=${cloud}`)
  }

  const errs1 = s1.errors.filter((e) => !/favicon|Failed to load resource/.test(e))
  if (errs1.length) fail('err', 'ошибки консоли: ' + errs1.join(' | '))
  const tokensBefore = await eco(page, 's.tokens')
  await page.waitForTimeout(1500)   // syncToCloud (debounce)
  await page.evaluate(() => window.__tcEconomy.state().syncToCloud())

  // 2. loadFromCloud: удалить локальный persist экономики → перезагрузка без debug → токены из облака
  {
    await page.evaluate(() => localStorage.removeItem('tinkercraft-economy'))
    await page.close()
    // ?debug-tokens=1 — только консольный помощник __tcEconomy (выдача = max(текущий, 1) — счёт не меняется)
    const s2 = await open(ctx, '?debug-tokens=1')
    const c = await calls(s2.page)
    const tokens = await eco(s2.page, 's.tokens')
    const order = c.indexOf('YaGames.init') === 0 && c.indexOf('player.getData') > 0
    if (order && tokens === tokensBefore) ok(2, `loadFromCloud — localStorage приложения очищен, токены из облака SDK: ${tokens} (как до перезагрузки), порядок init → player.getData`)
    else fail(2, `tokens ${tokens} vs ${tokensBefore}, calls ${c.slice(0, 8).join(',')}`)
    const errs2 = s2.errors.filter((e) => !/favicon|Failed to load resource/.test(e))
    if (errs2.length) fail('err2', 'ошибки консоли (сессия 2): ' + errs2.join(' | '))
  }
} catch (e) {
  fail('script', e.message.split('\n').slice(0, 4).join(' | '))
} finally {
  await browser.close()
}
console.log('\n' + results.join('\n'))
