// src/main.tsx — Entry point
// Порядок: i18n (язык браузера, мгновенно) → React render → SDK (параллельно)
//
// ⚠️ Рендер НЕ блокируется SDK: раньше `await initSdk()` стоял до createRoot(),
// из-за чего зависший YaGames.init() оставлял чёрный экран до 15 секунд.
// Теперь React стартует сразу, а язык из SDK (п. 2.14) применяется через
// i18n.changeLanguage() сразу после готовности SDK — до первого взаимодействия.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App'
import { initSdk } from './platform/sdk'
import { initI18n, applySdkLanguage } from './i18n/init'

async function bootstrap(): Promise<void> {
  // 1. i18n сразу — язык браузера (SDK ещё не готов, fallback по приоритету)
  await initI18n()

  // 2. Рендерим React НЕМЕДЛЕННО — не ждём SDK
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // 3. SDK инициализируем параллельно; когда готов — применяем язык из SDK.
  // initSdk() идемпотентен (кэшируется), повторный вызов из App.tsx → initPlatform()
  // вернёт тот же промис.
  try {
    await initSdk()
    applySdkLanguage()
  } catch (e) {
    console.warn('[Bootstrap] SDK init failed:', e)
  }
}

bootstrap()
