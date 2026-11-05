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
