// e2e/helpers.mjs — запуск приложения в Chromium через Playwright (Фаза 9+).
//
// ВАЖНО: WebGL в headless-Chromium на Linux работает ТОЛЬКО с этими флагами
// (по умолчанию getContext('webgl') → null и приложение показывает WebGLFallback).
// Проверено: `--use-angle=gl-egl --use-gl=angle` (или `--use-angle=vulkan` с
// `--enable-unsafe-swiftshader`).
import { chromium } from 'playwright'

export const APP_URL = process.env.APP_URL ?? 'http://localhost:5000/tinkercraft/'
export const GL_ARGS = ['--use-angle=gl-egl', '--use-gl=angle', '--ignore-gpu-blocklist']

/** Запускает браузер, открывает приложение, ждёт canvas и готовность CSG-воркера. */
export async function openApp({ width = 1400, height = 850 } = {}) {
  const browser = await chromium.launch({ args: GL_ARGS })
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Загрузка CSG'), null, { timeout: 30000 })
  return { browser, page, errors }
}

// CI-E2E: пороги производительности (FPS, долгие задачи, время CSG) зависят от железа. Локально
// (GPU) — строго: не выполнен — падение, как `fail`. В CI (`E2E_SOFT_PERF=1`, только job e2e в
// ci-web.yml: раннер без GPU, WebGL — Mesa llvmpipe на CPU) — предупреждение `[SOFT PERF] …` в
// stderr, скрипт идёт дальше: функциональные проверки после порога выполняются.
/** Мягкий режим порогов производительности (CI без GPU). */
export function isSoftPerf() {
  return process.env.E2E_SOFT_PERF === '1'
}
/** Порог производительности: локально — ошибка `message`, в мягком режиме — предупреждение. */
export function assertPerf(condition, message) {
  if (condition) return
  if (isSoftPerf()) console.warn(`[SOFT PERF] ${message}`)
  else throw new Error(message)
}

/**
 * CI-E2E: тост въезжает анимацией (`toastIn`, 0,2 с, translateX 20px). Без GPU кадры медленные, и
 * рамка, снятая через фиксированную паузу, — середина анимации (тост сдвинут и задевает панель).
 * Ждёт, пока анимации всех тостов закончатся; с GPU — сразу.
 */
export async function waitToastsSettled(page, timeout = 10000) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('.toast')].every((t) => t.getAnimations().every((a) => a.playState === 'finished')),
    null, { timeout },
  )
}

// ALIGN-REVIT: кнопки — по доступному имени (aria-label = подпись тултипа), а не по
// индексу: перестановка кнопок тулбара больше не ломает e2e. Имена — ru (язык по умолчанию).
/** Кнопка тулбара по aria-label (точное совпадение), напр. 'Зеркало YZ', 'Импорт', 'X мин'. */
export const toolbarButton = (page, name) =>
  page.getByRole('toolbar').getByRole('button', { name, exact: true })
/** Кнопка правой панели свойств по aria-label, напр. 'Объединение' (RegExp — для ru/en). */
export const panelButton = (page, name) =>
  page.locator('.panel-right').getByRole('button', { name, exact: true })

/**
 * ALIGN-UI-REVIT: точка экрана над гранью объекта `id`, нормаль которой принимает
 * `accept([nx, ny, nz])`. Режим выравнивания должен быть активен: подсветка под
 * курсором пишет id и нормаль грани в data-align-hover / data-align-hover-normal
 * вьюпорта. Грубая сетка находит объект, мелкая — вокруг попаданий (throttle
 * наведения 50 мс → ждём 60 мс на точку).
 */
export async function findAlignFace(page, id, accept) {
  const vp = page.locator('.viewport-canvas')
  const b = await vp.boundingBox()
  const probe = async (x, y) => {
    await page.mouse.move(x, y)
    await page.waitForTimeout(60)
    const [h, n] = await vp.evaluate((el) => [el.getAttribute('data-align-hover'), el.getAttribute('data-align-hover-normal')])
    if (!h || !n || h.split(':')[0] !== id) return null
    return n.split(',').map(Number)
  }
  const COLS = 24, ROWS = 16
  const cw = b.width / COLS, ch = b.height / ROWS
  const onObject = []
  for (let j = 1; j < ROWS; j++) for (let i = 1; i < COLS; i++) {
    const x = b.x + cw * i, y = b.y + ch * j
    const n = await probe(x, y)
    if (!n) continue
    if (accept(n)) return { x, y }
    onObject.push({ x, y })
  }
  // мелкая сетка вокруг точек объекта (грань могла попасть между узлами)
  for (const c of onObject) {
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      if (!di && !dj) continue
      const x = c.x + (cw / 3) * di, y = c.y + (ch / 3) * dj
      const n = await probe(x, y)
      if (n && accept(n)) return { x, y }
    }
  }
  throw new Error(`грань объекта ${id} не найдена на экране (точек объекта: ${onObject.length})`)
}

/**
 * UX-AUDIT-9: повторный клик по той же фигуре палитры раньше 200 мс — «двойной клик», он
 * отбрасывается. Ждёт, чтобы с прошлого клика по `label` прошло ≥ 250 мс (для e2e, которые
 * добавляют одну и ту же фигуру подряд).
 */
const lastShapeClick = new Map()
export async function spaceShapeClick(page, label) {
  const wait = (lastShapeClick.get(label) ?? 0) + 250 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  lastShapeClick.set(label, Date.now())
}


/**
 * CSG-GROUP-FIX: вычитание / пересечение — режим A → B → Enter. `via`: 'key' (X / I),
 * 'toolbar' или 'panel' (кнопка; в панели секция CSG видна от 2 выбранных или в режиме).
 * Ждёт пункт режима в статус-баре. Выделение перед вызовом — группа A.
 */
export async function csgModeStart(page, op, via = 'key') {
  if (via === 'key') {
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press(op === 'subtract' ? 'KeyX' : 'KeyI')
  } else {
    const name = op === 'subtract' ? 'Вычитание' : 'Пересечение'
    await (via === 'panel' ? panelButton : toolbarButton)(page, name).click()
  }
  await page.locator('[data-testid=csg-mode]').waitFor({ timeout: 5000 })
}
/** Подтвердить режим: Enter (фокус снят с поля ввода) или кнопка «ОК» статус-бара. */
export async function csgModeConfirm(page, how = 'enter') {
  const ok = page.locator('[data-testid=csg-mode-ok]')
  await page.waitForFunction(() => document.querySelector('[data-testid=csg-mode-ok]')?.disabled === false, null, { timeout: 5000 })
  if (how === 'ok') await ok.click()
  else {
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Enter')
  }
}
/** A op B режимом: `selectA()` → кнопка / клавиша → `selectB()` → Enter / «ОК». */
export async function csgAB(page, op, selectA, selectB, { via = 'key', confirm = 'enter' } = {}) {
  await selectA()
  await csgModeStart(page, op, via)
  await selectB()
  await csgModeConfirm(page, confirm)
}
