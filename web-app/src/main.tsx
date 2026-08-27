// src/main.tsx — Entry point
// Порядок: SDK → i18n (язык из SDK) → React render
// Для clean-версии: SDK недоступен → fallback на navigator/localStorage

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App'
import { initSdk } from './platform/sdk'

// ── Инициализация SDK и i18n перед рендером ──
async function bootstrap(): Promise<void> {
  // 1. Инициализируем SDK (для clean-версии — сразу возвращает null)
  await initSdk()

  // 2. Инициализируем i18n с языком из SDK (или fallback)
  const i18n = await import('./i18n')

  // 3. Рендерим React
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
