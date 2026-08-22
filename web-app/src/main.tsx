// src/main.tsx — Entry point
// Для Yandex-версии: SDK инициализируется ВНУТРИ i18n-детектора
// (YandexLanguageDetector → initSdk → YaGames.init)
// i18n.init() ждёт детектор, затем рендерит React.
// Для clean-версии: i18n-детектор сразу возвращает undefined → navigator fallback.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './App.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
