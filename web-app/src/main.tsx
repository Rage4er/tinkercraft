// src/main.tsx — Entry point
// Порядок (U10): сплэш-экран → i18n → await initSdk() → React render
//
// ⚠️ U10: SDK инициализируется ДО того, как UI редактора становится доступен.
// Раньше `createRoot().render()` выполнялся до `await initSdk()`, из-за чего
// весь UI был доступен пользователю до готовности Yandex SDK (нарушение
// требований платформы/модерации).
//
// Компромисс с «чёрным экраном» решён сплэшем: пока SDK не готов (или не
// подтверждено его отсутствие → clean-режим), пользователь видит экран
// загрузки со спиннером. Зависший YaGames.init() больше не даёт чёрный экран —
// initSdk() имеет внутренний таймаут 10с и переключается в clean-режим,
// после чего игра открывается как обычно.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App'
import { initSdk } from './platform/sdk'
import { initI18n, applySdkLanguage } from './i18n/init'

/** Показать простой сплэш (инлайн-стили, без зависимости от CSS/React) */
function showSplash(): void {
  const root = document.getElementById('root')
  if (!root) return
  // Не перезаписываем существующий контент (HMR) — добавляем сплэш поверх
  if (root.querySelector('[data-bootstrap-splash]')) return
  const splash = document.createElement('div')
  splash.setAttribute('data-bootstrap-splash', '')
  splash.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:16px', 'background:var(--bg-primary,#16181d)', 'color:var(--text-primary,#e6e8ec)',
    'font-family:system-ui,sans-serif',
  ].join(';')
  const spinner = document.createElement('div')
  spinner.style.cssText = [
    'width:36px', 'height:36px', 'border-radius:50%',
    'border:3px solid var(--border,#33373f)', 'border-top-color:var(--primary,#4f8cff)',
    'animation:tc-splash-spin 0.9s linear infinite',
  ].join(';')
  const label = document.createElement('div')
  label.textContent = 'TinkerCraft'
  label.style.cssText = 'font-size:15px;letter-spacing:0.06em;opacity:.85'
  const hint = document.createElement('div')
  hint.textContent = 'Загрузка…'
  hint.style.cssText = 'font-size:12px;opacity:.55'
  splash.append(spinner, label, hint)
  root.appendChild(splash)
}

/** Убрать сплэш после рендера React */
function hideSplash(): void {
  document.querySelectorAll('[data-bootstrap-splash]').forEach((el) => el.remove())
}

async function bootstrap(): Promise<void> {
  showSplash()

  try {
    // 1. i18n сразу — язык браузера (SDK ещё не готов, fallback по приоритету).
    //    Позже, после initSdk(), применяем язык из SDK через applySdkLanguage().
    await initI18n()
  } catch (e) {
    console.warn('[Bootstrap] i18n init failed:', e)
  }

  // 2. ⚠️ U10: инициализируем SDK ДО рендера UI редактора.
  //    Пользователь видит сплэш со спиннером (не чёрный экран).
  //    initSdk() идемпотентен (кэшируется) и имеет внутренний таймаут 10с:
  //    зависший YaGames.init() → clean-режим (null), игра всё равно откроется.
  try {
    await initSdk()
    applySdkLanguage()
  } catch (e) {
    console.warn('[Bootstrap] SDK init failed — running in clean mode:', e)
  }

  // 3. UI редактора рендерим ТОЛЬКО после готовности SDK (или clean-фолбэка).
  //    GameplayAPI.start() вызывается в App.tsx после полного монтирования
  //    и подтверждённого init (см. getInitDonePromise в platform/sdk.ts).
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // 4. Сплэш убираем после первого кадра рендера React.
  requestAnimationFrame(() => requestAnimationFrame(hideSplash))
}

// Стиль анимации спиннера (инжектим один раз)
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = '@keyframes tc-splash-spin{to{transform:rotate(360deg)}}'
  document.head.appendChild(style)
}

bootstrap()
