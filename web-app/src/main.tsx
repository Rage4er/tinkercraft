// src/main.tsx — Entry point
// Порядок: SDK → i18n (язык из SDK, п. 2.14) → React render

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App'
import { initSdk } from './platform/sdk'
import { initI18n } from './i18n/init'

// ── Инициализация SDK и i18n перед рендером ──
async function bootstrap(): Promise<void> {
  // 1. Инициализируем SDK (п. 2.14: язык из SDK ДО запуска игры)
  await initSdk()

  // 2. Инициализируем i18n с языком из SDK (определяется ПОСЛЕ initSdk)
  await initI18n()

  // 3. Рендерим React
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
