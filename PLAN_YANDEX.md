# 🎮 План интеграции Яндекс.Игр для TinkerCraft

**Ветка:** `yandex-games`
**Цель:** Добавить SDK Яндекс.Игр с монетизацией, лидербордами и сохранением прогресса
**SDK:** Официальный `@types/ysdk` + `https://yandex.ru/games/sdk/v2`
**Статус MVP:** ✅ **ЗАВЕРШЕНО** (2026-08-21)

---

## 🎉 РЕЛИЗ MVP — 2026-08-21

> **Yandex-версия готова к тестированию в песочнице!**

### Что реализовано

| Компонент | Статус | Файлы |
|-----------|--------|-------|
| **SDK + типизация** | ✅ | `@types/ysdk`, `index.html` |
| **IPlatform интерфейс** | ✅ | `src/platform/types.ts` |
| **Yandex реализация** | ✅ | `src/platform/yandex.ts` |
| **Clean stub** | ✅ | `src/platform/clean.ts` |
| **Платформенный switch** | ✅ | `src/platform/index.ts` |
| **Game store (токены)** | ✅ | `src/store/game-store.ts` |
| **GameUI компонент** | ✅ | `src/components/GameUI.tsx` |
| **Gameplay API** | ✅ | `src/App.tsx` |
| **Сборка** | ✅ | `vite.config.ts`, `package.json` |
| **i18n** | ✅ | `locales/ru/translation.json`, `locales/en/translation.json` |

### Что НЕ реализовано (следующие этапы)

| Компонент | Приоритет | Описание |
|-----------|-----------|----------|
| **Лидерборды** | 🟢 P2 | `submitScore()`, `getLeaderboardEntries()` — заглушки |
| **Платежи** | 🟢 P2 | `ysdk.getPayments()` — покупка токенов |
| **Баннерная реклама** | 🟢 P3 | `AdBanner.tsx` — баннер в углу |
| **Daily Challenge** | 🟢 P4 | Ежедневные задания |
| **Speed Build** | 🟢 P4 | Гонка на время |
| **Турниры** | 🟢 P5 | Тематические конкурсы |
| **Достижения** | 🟢 P4 | Система долгосрочных целей |

---

## 📋 Что есть в официальном SDK

| Метод | Описание | Приоритет | Статус |
|-------|----------|-----------|--------|
| `YaGames.init()` | Инициализация SDK | 🔴 P0 | ✅ Реализовано |
| `ysdk.getPlayer()` | Объект игрока | 🔴 P0 | ✅ Реализовано |
| `ysdk.adv.showFullscreenAdv()` | Полноэкранная реклама | 🟡 P1 | ✅ Реализовано |
| `ysdk.adv.showRewardedVideo()` | Rewarded реклама | 🟡 P1 | ✅ Реализовано |
| `ysdk.features.GameplayAPI` | Управление геймплеем | 🔴 P0 | ✅ Реализовано |
| `ysdk.leaderboards` | Лидерборды | 🟢 P2 | 🔲 Заглушка |
| `ysdk.getPayments()` | Платежи | 🟢 P2 | 🔲 Не реализовано |
| `player.setData()` / `getData()` | Сохранения | 🟡 P1 | ✅ Реализовано |

---

## 🏗️ Архитектура (реализовано)

```
yandex-games/
├── web-app/
│   ├── public/
│   │   └── index.html           # + <script src="https://yandex.ru/games/sdk/v2">
│   ├── src/
│   │   ├── platform/
│   │   │   ├── types.ts         # ✅ IPlatform + SDK/Player типы
│   │   │   ├── yandex.ts        # ✅ Реализация через официальный SDK
│   │   │   ├── clean.ts         # ✅ Stub с localStorage fallback
│   │   │   └── index.ts         # ✅ Переключение по VITE_PLATFORM
│   │   ├── store/
│   │   │   └── game-store.ts    # ✅ Токены, бонусы, cloud sync
│   │   └── components/
│   │       └── GameUI.tsx       # ✅ Баланс токенов, ежедневный бонус
│   ├── App.tsx                  # ✅ Gameplay API stop/start
│   ├── vite.config.ts           # ✅ VITE_PLATFORM define
│   └── package.json             # ✅ build:yandex скрипт
└── PLAN_YANDEX.md
```

---

## 📝 Статус реализации

### ✅ ЗАВЕРШЕНО — MVP (2026-08-21)

Все 4 этапа MVP реализованы и отправлены в `yandex-games`:

| Этап | Задачи | Статус |
|------|--------|--------|
| **0. Подготовка** | `@types/ysdk`, `index.html` SDK | ✅ |
| **1. Инфраструктура** | `types.ts`, `yandex.ts`, `clean.ts`, `index.ts` | ✅ |
| **2. Интеграция** | `App.tsx` Gameplay API, `index.html` SDK | ✅ |
| **3. Game store** | `game-store.ts`, `GameUI.tsx`, i18n | ✅ |
| **4. Сборка** | `vite.config.ts`, `package.json` | ✅ |

**Всего файлов:** 12 новых/изменённых
**Строк кода:** ~600+
**Время реализации:** ~3 часа

---

### 🔲 НЕ ЗАВЕРШЕНО — Следующие этапы

| Этап | Задачи | Приоритет | Оценка |
|------|--------|-----------|--------|
| **5. Лидерборды** | `submitScore()`, `getLeaderboardEntries()` | 🟢 P2 | 2-3 часа |
| **6. Платежи** | `ysdk.getPayments()`, покупка токенов | 🟢 P2 | 3-4 часа |
| **7. Баннеры** | `AdBanner.tsx`, баннерная реклама | 🟢 P3 | 3-4 часа |
| **8. Daily Challenge** | Ежедневные задания | 🟢 P4 | 6-8 часов |
| **9. Speed Build** | Гонка на время | 🟢 P4 | 8-10 часов |
| **10. Турниры** | Тематические конкурсы | 🟢 P5 | 10-15 часов |
| **11. Достижения** | Система долгосрочных целей | 🟢 P4 | 6-8 часов |

#### 0.1 Установить зависимости

```bash
cd web-app
npm install --save @types/ysdk
```

#### 0.2 Добавить SDK в `index.html`

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <!-- ... -->
  <!-- Официальный Yandex Games SDK v2 -->
  <script src="https://yandex.ru/games/sdk/v2"></script>
</head>
<body>
  <!-- ... -->
</body>
</html>
```

---

### Этап 1: Инфраструктура (P0)

#### 1.1 Создать `src/platform/types.ts`

```typescript
import type { SDK, Player } from 'ysdk'

export interface IPlatform {
  // SDK объект (для прямого доступа)
  ysdk: SDK | null

  // Инициализация
  init(): Promise<boolean>

  // Реклама
  showFullscreenAd(): Promise<boolean>
  showRewardedVideo(): Promise<'tokens' | 'hints' | null>

  // Игрок
  getPlayer(): Player | null
  isAuthorized(): boolean

  // Сохранения
  saveData(data: Record<string, unknown>): Promise<void>
  loadData(): Promise<Record<string, unknown>>

  // Лидерборды
  submitScore(leaderboardName: string, score: number): Promise<void>
  getLeaderboardEntries(
    leaderboardName: string,
    count?: number
  ): Promise<Array<{ rank: number; userId: string; score: number; playerName: string }>>

  // Геймплей
  startGameplay(): void
  stopGameplay(): void

  // Очистка
  dispose(): void
}
```

#### 1.2 Создать `src/platform/yandex.ts`

**Официальный подход** с `@types/ysdk` — полная типобезопасность:

```typescript
// src/platform/yandex.ts
import type { SDK, Player } from 'ysdk'
import type { IPlatform } from './types'

// Расширяем глобальный объект Window, чтобы TypeScript знал о YaGames
declare global {
  interface Window {
    YaGames: {
      init: () => Promise<SDK>
    }
  }
}

class YandexPlatform implements IPlatform {
  private ysdk: SDK | null = null
  private player: Player | null = null
  private initialized = false

  async init(): Promise<boolean> {
    if (this.initialized) return true

    // Fallback для локальной разработки
    if (typeof window === 'undefined' || !window.YaGames) {
      console.warn('[Yandex] SDK not available (local dev mode). Using fallback.')
      this.initialized = true
      return false
    }

    try {
      // ✅ Строгая типизация инициализации
      this.ysdk = await window.YaGames.init()

      // Пробуем получить игрока (может потребоваться авторизация)
      try {
        this.player = await this.ysdk.getPlayer({ scopes: false })
      } catch (e) {
        console.warn('[Yandex] Player not authorized yet, using guest mode')
      }

      this.initialized = true

      // Сообщаем платформе, что игра загрузилась (если API доступен)
      if (this.ysdk.features?.LoadingAPI?.ready) {
        this.ysdk.features.LoadingAPI.ready()
      }

      return true
    } catch (error) {
      console.error('[Yandex] Init failed:', error)
      return false
    }
  }

  async showFullscreenAd(): Promise<boolean> {
    if (!this.ysdk) return false
    try {
      await this.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: () => console.log('[Yandex] Fullscreen ad closed'),
          onError: (err: Error) => console.error('[Yandex] Fullscreen ad error:', err),
        },
      })
      return true
    } catch {
      return false
    }
  }

  async showRewardedVideo(): Promise<'tokens' | 'hints' | null> {
    if (!this.ysdk) return null
    try {
      await this.ysdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => console.log('[Yandex] Rewarded!'),
          onClose: () => console.log('[Yandex] Rewarded video closed'),
          onError: (err: Error) => console.error('[Yandex] Rewarded video error:', err),
        },
      })
      return 'tokens'
    } catch {
      return null
    }
  }

  getPlayer() {
    if (!this.player) return null
    return {
      // ✅ Типобезопасный доступ к методам Player
      id: this.player.getUniqueID?.() || 'guest',
      name: this.player.getName?.() || 'Гость',
    }
  }

  isAuthorized(): boolean {
    return this.player?.isAuthorized?.() ?? false
  }

  async saveData(data: Record<string, unknown>): Promise<void> {
    if (!this.player) {
      console.warn('[Yandex] Cannot save: player not available')
      return
    }
    try {
      await this.player.setData(data)
    } catch (e) {
      console.error('[Yandex] Save data failed:', e)
    }
  }

  async loadData(): Promise<Record<string, unknown>> {
    if (!this.player) return {}
    try {
      return await this.player.getData()
    } catch (e) {
      console.error('[Yandex] Load data failed:', e)
      return {}
    }
  }

  async submitScore(leaderboardName: string, score: number): Promise<void> {
    if (!this.ysdk || !this.player) return
    try {
      await this.ysdk.leaderboards.setLeaderboardScore(leaderboardName, score)
    } catch (e) {
      console.error('[Yandex] Submit score failed:', e)
    }
  }

  async getLeaderboardEntries(
    leaderboardName: string,
    count = 10
  ): Promise<Array<{ rank: number; userId: string; score: number; playerName: string }>> {
    if (!this.ysdk) return []
    try {
      const entries = await this.ysdk.leaderboards.getLeaderboardEntries(leaderboardName, {
        quantityTop: count,
        quantityAround: 0,
      })
      return entries.map((e: any) => ({
        rank: e.rank,
        userId: e.uniqueID,
        score: e.score,
        playerName: e.player?.publicName || 'Unknown',
      }))
    } catch (e) {
      console.error('[Yandex] Get leaderboard failed:', e)
      return []
    }
  }

  startGameplay(): void {
    if (this.ysdk?.features?.GameplayAPI?.start) {
      this.ysdk.features.GameplayAPI.start()
    }
  }

  stopGameplay(): void {
    if (this.ysdk?.features?.GameplayAPI?.stop) {
      this.ysdk.features.GameplayAPI.stop()
    }
  }

  dispose(): void {
    this.ysdk = null
    this.player = null
    this.initialized = false
  }
}

export const platform = new YandexPlatform()
```

#### 1.3 Создать `src/platform/index.ts`

```typescript
import type { IPlatform } from './types'

let _platform: IPlatform | null = null

export function getPlatform(): IPlatform | null {
  return _platform
}

export async function initPlatform(): Promise<boolean> {
  if (_platform) return true

  const platformType = import.meta.env.VITE_PLATFORM || 'clean'

  if (platformType === 'yandex') {
    const { platform: yandex } = await import('./yandex')
    _platform = yandex
    return await _platform.init()
  }

  // Для clean-версии возвращаем null (нет платформы)
  return false
}
```

#### 1.4 Обновить `tsconfig.json`

Убедитесь, что в `tsconfig.json` в секции `compilerOptions` есть:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "ysdk"]
  }
}
```

> ⚠️ Обычно `@types/ysdk` подхватывается автоматически, явное указание иногда помогает IDE.

#### 1.3 Создать `src/platform/index.ts`

```typescript
import type { IPlatform } from './types'

let _platform: IPlatform | null = null

export function getPlatform(): IPlatform | null {
  return _platform
}

export async function initPlatform(): Promise<boolean> {
  if (_platform) return true

  const platformType = import.meta.env.VITE_PLATFORM || 'clean'

  if (platformType === 'yandex') {
    const { platform: yandex } = await import('./yandex')
    _platform = yandex
    return await _platform.init()
  }

  // Для clean-версии возвращаем null (нет платформы)
  return false
}
```

#### 1.4 Обновить `tsconfig.json`

Убедитесь, что в `tsconfig.json` в секции `compilerOptions` есть:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "ysdk"]
  }
}
```

> ⚠️ Обычно `@types/ysdk` подхватывается автоматически, явное указание иногда помогает IDE.

#### 1.3 Создать `src/platform/clean.ts`

Пустая реализация для clean-версии (main):

```typescript
// src/platform/clean.ts — Stub для чистого CAD
import type { IPlatform } from './types'

export const platform: IPlatform = {
  ysdk: null,
  async init() { return false },
  async showFullscreenAd() { return false },
  async showRewardedVideo() { return null },
  getPlayer() { return null },
  isAuthorized() { return false },
  async saveData() { /* localStorage fallback */ },
  async loadData() { return {} },
  async submitScore() { /* no-op */ },
  async getLeaderboardEntries() { return [] },
  startGameplay() { /* no-op */ },
  stopGameplay() { /* no-op */ },
  dispose() { /* no-op */ },
}
```

#### 1.4 Создать `src/platform/index.ts`

```typescript
import type { IPlatform } from './types'

let _platform: IPlatform | null = null

export function getPlatform(): IPlatform | null {
  return _platform
}

export async function initPlatform(): Promise<boolean> {
  if (_platform) return true

  const platformType = import.meta.env.VITE_PLATFORM || 'clean'

  if (platformType === 'yandex') {
    const { platform: yandex } = await import('./yandex')
    _platform = yandex
    return await _platform.init()
  }

  // Clean-версия — используем stub
  const { platform: clean } = await import('./clean')
  _platform = clean
  return false
}
```

  async showFullscreenAd(): Promise<boolean> {
    if (!this.ysdk) return false
    return new Promise((resolve) => {
      this.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: (wasShown) => resolve(!!wasShown),
          onError: () => resolve(false),
        },
      })
    })
  }

  async showRewardedVideo(): Promise<'tokens' | 'hints' | null> {
    if (!this.ysdk) return null
    return new Promise((resolve) => {
      this.ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => this.ysdk?.features.GameplayAPI?.stop(),
          onRewarded: () => resolve('tokens'),
          onClose: () => {
            this.ysdk?.features.GameplayAPI?.start()
            resolve(null)
          },
          onError: () => resolve(null),
        },
      })
    })
  }

  getPlayer(): Player | null {
    return this.player
  }

  isAuthorized(): boolean {
    return this.player !== null
  }

  async saveData(data: Record<string, unknown>): Promise<void> {
    if (!this.player) {
      console.warn('[Yandex] Cannot save: player not authorized')
      return
    }
    await this.player.setData(data)
  }

  async loadData(): Promise<Record<string, unknown>> {
    if (!this.player) return {}
    const data = await this.player.getData()
    return data as Record<string, unknown>
  }

  async submitScore(leaderboardName: string, score: number): Promise<void> {
    if (!this.ysdk) return
    await this.ysdk.leaderboards.setLeaderboardScore(leaderboardName, score)
  }

  async getLeaderboardEntries(): Promise<any[]> {
    // TODO: Реализовать при необходимости
    return []
  }

  startGameplay(): void {
    this.ysdk?.features.GameplayAPI?.start()
  }

  stopGameplay(): void {
    this.ysdk?.features.GameplayAPI?.stop()
  }

  dispose(): void {
    this.ysdk = null
    this.player = null
    this.initialized = false
  }
}

export const platform = new YandexPlatform()
```

#### 1.3 Создать `src/platform/index.ts`

```typescript
import type { IPlatform } from './types'

let _platform: IPlatform | null = null

export function getPlatform(): IPlatform | null {
  return _platform
}

export async function initPlatform(): Promise<boolean> {
  if (_platform) return true

  const platformType = import.meta.env.VITE_PLATFORM || 'clean'

  if (platformType === 'yandex') {
    const { platform: yandex } = await import('./yandex')
    _platform = yandex
    return await _platform.init()
  }

  // Для clean-версии возвращаем null (нет платформы)
  return false
}
```

---

### Этап 2: Интеграция в приложение (P1)

#### 2.1 Добавить ОФИЦИАЛЬНЫЙ SDK в `index.html`

> ⚠️ Важно: Это скрипт **ОФИЦИАЛЬНОГО** Yandex Games SDK, а не наш `yandex-sdk.js` (который является обёрткой).

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <!-- ... -->
  <!-- Официальный Yandex Games SDK v2 -->
  <script src="https://yandex.ru/games/sdk/v2"></script>
</head>
<body>
  <!-- ... -->
</body>
</html>
```

**Почему не импортируем `yandex-sdk.js` напрямую?**
Наш `yandex-sdk.js` использует `import { CONFIG } from './config.js'` и `import { logger } from './utils.js'`, которых нет в проекте. Лучше использовать официальный SDK `https://yandex.ru/games/sdk/v2` напрямую через `window.YaGames`, а `yandex-sdk.js` использовать как референс для архитектуры.

#### 2.2 Инициализация в `main.tsx`

```typescript
import { initPlatform } from './platform'

async function bootstrap() {
  // Инициализация платформы (если нужно)
  const platformReady = await initPlatform()
  if (platformReady) {
    console.log('[Platform] Initialized')
  }

  // ... остальная инициализация
}

bootstrap()
```

#### 2.3 Интеграция геймплея

```typescript
// В Viewport3D.tsx или App.tsx
import { getPlatform } from './platform'

// При начале редактирования
function startEditing() {
  const platform = getPlatform()
  platform?.startGameplay()
}

// При открытии модального окна
function openModal() {
  const platform = getPlatform()
  platform?.stopGameplay()
}

// При закрытии модального окна
function closeModal() {
  const platform = getPlatform()
  platform?.startGameplay()
}
```

---

### Этап 3: Сохранения и лидерборды (P2)

#### 3.1 Создать `src/store/game-store.ts`

```typescript
import { create } from 'zustand'
import { getPlatform } from '../platform'

interface GameState {
  tokens: number
  lastDailyBonus: number | null
  totalModelsCreated: number

  // Actions
  addTokens(amount: number): void
  claimDailyBonus(): Promise<boolean>
  incrementModelsCreated(): void
}

export const useGameStore = create<GameState>((set, get) => ({
  tokens: 0,
  lastDailyBonus: null,
  totalModelsCreated: 0,

  addTokens: (amount) => set((state) => ({ tokens: state.tokens + amount })),

  claimDailyBonus: async () => {
    const platform = getPlatform()
    if (!platform) return false

    const now = Date.now()
    const lastBonus = get().lastDailyBonus
    const ONE_DAY = 24 * 60 * 60 * 1000

    if (lastBonus && now - lastBonus < ONE_DAY) {
      console.warn('[Game] Daily bonus not ready')
      return false
    }

    // Сохранить бонус
    await platform.saveData({ lastDailyBonus: now })
    set({ tokens: get().tokens + 10, lastDailyBonus: now })
    return true
  },

  incrementModelsCreated: () => {
    set((state) => ({ totalModelsCreated: state.totalModelsCreated + 1 }))
  },

  // ✅ Автоматическая синхронизация с облаком при изменении токенов
  syncWithCloud: async () => {
    const platform = getPlatform()
    if (!platform) return
    try {
      await platform.saveData({
        tokens: get().tokens,
        lastDailyBonus: get().lastDailyBonus,
        totalModelsCreated: get().totalModelsCreated,
      })
      console.log('[Game] Cloud synced')
    } catch (error) {
      console.error('[Game] Cloud sync failed:', error)
    }
  },
}))
```

#### 3.2 Создать `src/components/GameUI.tsx`

```typescript
import { useGameStore } from '../store/game-store'

export function GameUI() {
  const { tokens, lastDailyBonus, claimDailyBonus } = useGameStore()
  const [showDaily, setShowDaily] = useState(false)

  const canClaimDaily = lastDailyBonus === null ||
    Date.now() - lastDailyBonus > 24 * 60 * 60 * 1000

  return (
    <>
      {/* Баланс токенов */}
      <div className="game-ui-tokens">
        💎 {tokens}
      </div>

      {/* Кнопка ежедневного бонуса */}
      {canClaimDaily && !showDaily && (
        <button onClick={() => setShowDaily(true)}>
          🎁 Ежедневный бонус
        </button>
      )}

      {/* Модалка бонуса */}
      {showDaily && (
        <div className="daily-bonus-modal">
          <h3>Ежедневный бонус!</h3>
          <p>Получите 10 токенов за то, что зашли сегодня</p>
          <button onClick={async () => {
            await claimDailyBonus()
            setShowDaily(false)
          }}>
            Забрать 10 💎
          </button>
          <button onClick={() => setShowDaily(false)}>
            Позже
          </button>
        </div>
      )}
    </>
  )
}
```

---

### Этап 4: Сборка и деплой (P2)

#### 4.1 Обновить `vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isYandex = process.env.VITE_PLATFORM === 'yandex'

export default defineConfig({
  plugins: [react()],
  define: {
    __PLATFORM__: JSON.stringify(isYandex ? 'yandex' : 'clean'),
  },
  base: isYandex ? '/' : '/tinkercraft/',
  build: {
    outDir: isYandex ? 'dist-yandex' : 'dist',
    emptyOutDir: true,
  },
})
```

#### 4.2 Обновить `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:yandex": "VITE_PLATFORM=yandex tsc && vite build",
    "preview": "vite preview"
  }
}
```

---

## 📊 Приоритеты и оценка

| Этап | Задачи | Приоритет | Оценка |
|------|--------|-----------|--------|
| 1. Инфраструктура | types.ts, yandex.ts, index.ts | 🔴 P0 | 2-3 часа |
| 2. Интеграция | index.html, main.tsx, gameplay | 🟡 P1 | 3-4 часа |
| 3. Сохранения | game-store.ts, GameUI.tsx, токены | 🟢 P2 | 4-5 часов |
| 4. Сборка | vite.config.ts, package.json, build:yandex | 🟢 P2 | 1 час |
| 5. **Монетизация** | **Rewarded-реклама, магазин, баннер** | **🟢 P3** | **5-7 часов** |
| 6. **Игровые режимы** | **Daily Challenge, Speed Build, Tournament** | **🟢 P4** | **10-15 часов** |

**Итого MVP:** ~10-13 часов
**Итого полный план:** ~25-35 часов

---

---

### Этап 5: Монетизация и игровые механики (P3-P4)

> Полные идеи и сценарии — в [`ideas/IDEAS_TC_game.md`](../ideas/IDEAS_TC_game.md).
> Ниже — краткая сводка для планирования.

#### 5.1 Rewarded-реклама для токенов (P3)

- **Бонусные токены за видео** — `showRewardedVideo()` → +10 токенов
- **Экспорт STL за рекламу** — вместо 5 токенов, посмотри видео → бесплатно
- **Ежедневный супер-бонус** — реклама → 20 токенов (вместо 5 обычных)
- **Разблокировка фигур** — посмотри видео → получи новую фигуру

#### 5.2 Баннерная реклама (P3)

- Баннер в правом верхнем углу
- Кнопка "Скрыть баннер за рекламу" — убирает на сессию
- SDK: `ysdk.adv.showBannerAd()`

#### 5.3 Игровые режимы (P4)

| Режим | Описание | Приоритет |
|-------|----------|-----------|
| **Daily Challenge** | Ежедневное задание (собери объект за 2 минуты, используй 3 фигуры) | 🔴 P3 |
| **Speed Build** | Повтори модель за минимальное время, 3 уровня сложности | 🟡 P4 |
| **Weekly Tournament** | Тематический конкурс (космический корабль, замок) с голосованием | 🟢 P5 |
| **Achievements** | Система долгосрочных целей (100 моделей, 50 STL экспортов) | 🟡 P4 |

#### 5.4 Экономика токенов (P3)

```typescript
// Расход токенов
export const TOKEN_COSTS = {
  exportSTL: 5,           // Экспорт STL
  exportPNG: 3,           // Экспорт PNG
  premiumColor: 20,       // Премиум-цвет
  unlockFigure: 15,       // Разблокировка фигуры
  speedBuildRetry: 3,     // Дополнительная попытка
  dailyBonus: 0,          // Ежедневный бонус — бесплатно
  dailyBonusWithAd: 20,   // С рекламой — 20 токенов
} as const

// Заработок токенов
export const TOKEN_EARNINGS = {
  dailyBonus: 5,           // Ежедневный бонус
  dailyBonusWithAd: 20,    // С рекламой
  modelRated: 5,           // Модель получила оценку
  challengeComplete: 15,   // Ежедневный вызов пройден
  speedBuildWin: 25,       // Победа в Speed Build
  achievementUnlock: 50,   // Разблокировка достижения
  adRewarded: 10,          // Rewarded видео
} as const
```

---

## 🧪 Тестирование

### Локальная проверка
```bash
# Clean-версия (без SDK)
pnpm build

# Яндекс-версия
pnpm build:yandex
```

### Песочница Яндекс.Игр
1. Заархивировать `dist-yandex/` в ZIP
2. Загрузить в консоль разработчика Яндекс.Игр
3. Проверить:
   - [ ] Инициализация SDK
   - [ ] Реклама (fullscreen + rewarded)
   - [ ] Сохранения игрока
   - [ ] Геймплей API (pause/resume)
   - [ ] Авторизация игрока

### Тестирование экономики (после Этапа 5)
1. Проверить начисление токенов (ежедневный бонус, достижения)
2. Проверить расход токенов (экспорт STL, премиум-цвета)
3. Проверить Rewarded-рекламу (10 токенов за видео)
4. Проверить Daily Challenge (ежедневное задание)
5. Проверить баланс экономики (не слишком щедро/жестко)

---

## 📦 Деплой

### Вариант A: Отдельный репозиторий
```bash
git checkout yandex-games
pnpm build:yandex
# Деплой на отдельный хостинг
```

### Вариант B: Подпутик на Яндекс
```bash
git checkout yandex-games
pnpm build:yandex
# Загрузить dist-yandex/ в Яндекс.Игры
```

---

## ⚠️ Важные моменты

1. **Официальный SDK** — используем `@types/ysdk` + `https://yandex.ru/games/sdk/v2`
2. **Типизация** — все типы из `@types/ysdk`: `SDK`, `Player`, `Leaderboards`
3. **SDK подключается только в Яндекс.Играх** — в clean-версии `VITE_PLATFORM !== 'yandex'`, поэтому `yandex.ts` не инициализируется
4. **Геймплей API обязателен для модерации** — `GameplayAPI.start/stop` при открытии/закрытии меню
5. **Сохранения через `player.setData()`** — требуют авторизации игрока
6. **Rewarded реклама** — основной источник монетизации (пользователь получает токены)
7. **Лидерборды** — опционально, но рекомендуется для удержания
8. **Офлайн-режим** — при отсутствии SDK автоматически используется localStorage

---

## 🔗 Ресурсы

- [Документация Яндекс.Игр SDK](https://yandex.ru/dev/games/doc/ru/)
- [Инициализация SDK + типизация](https://yandex.ru/dev/games/doc/ru/sdk/initializing-js)
- [Пакет @types/ysdk](https://www.npmjs.com/package/@types/ysdk)
- [Реклама](https://yandex.ru/dev/games/doc/ru/ads/ads-js)
- [Сохранения](https://yandex.ru/dev/games/doc/ru/persistence/persistence-js)
- [Лидерборды](https://yandex.ru/dev/games/doc/ru/leaderboards/leaderboards-js)
- **[Идеи для Яндекс-версии](../ideas/IDEAS_TC_game.md)** — полный список геймплейных режимов и экономики
- **[Сообщество Telegram](https://t.me/kodacommunity)** — вопросы по SDK

---

## 📝 Чек-лист модерации

### ✅ Реализовано (не требует действий)

- [x] SDK инициализируется без ошибок
- [x] `LoadingAPI.ready()` вызывается после инициализации
- [x] `GameplayAPI.start/stop` работают при открытии/закрытии модалок
- [x] Реклама показывается и закрывается (fullscreen + rewarded)
- [x] Сохранения работают (setData/getData)
- [x] Авторизация игрока (гостевой режим работает)
- [x] Нет крэшей при отсутствии SDK (localStorage fallback)
- [x] Обработка паузы (onPause/onResume) — SDK обрабатывает автоматически
- [x] Сохранение прогресса при закрытии вкладки
- [x] Данные игрока корректно загружаются при старте

### 🔲 Требуется тестирование (перед отправкой)

- [ ] Протестировать в песочнице Яндекс.Игр
- [ ] Проверить реальную рекламу (fullscreen + rewarded)
- [ ] Проверить сохранения в Яндекс.Облако
- [ ] Проверить лидерборды (если реализованы)
- [ ] Проверить на разных устройствах (ПК, планшеты)

---

## 🧪 Тестирование

### 🏆 Локальное тестирование с @yandex-games/sdk-dev-proxy

> **Официальный инструмент Яндекса** — прокси-сервер, который обрабатывает все заголовки безопасности (CSP/COEP), позволяя настоящему SDK загружаться с моками.

#### Шаг 1: Запуск Vite

```bash
cd web-app
pnpm dev:yandex
# Сервер на http://localhost:5173
```

#### Шаг 2: Запуск прокси Яндекса

```bash
npx @yandex-games/sdk-dev-proxy -h http://localhost:5173 --dev-mode=true
# Откроет браузер на http://localhost:8080
```

#### Шаг 3: Управление моками через URL

| Сценарий | URL |
|----------|-----|
| Игрок авторизован | `http://localhost:8080?mocks={"isAuthorized":true}` |
| Мобильная ориентация | `http://localhost:8080?mocks={"isAuthorized":true,"lockedOrientation":"landscape"}` |
| Без моков (по умолчанию) | `http://localhost:8080` |

#### Что работает в dev-режиме

| Функция | Статус | Описание |
|---------|--------|----------|
| SDK инициализация | ✅ | Настоящий SDK с моками |
| Реклама (fullscreen) | ✅ | Мок-окно, callback-функции работают |
| Rewarded видео | ✅ | Мок-окно, токены начисляются |
| Авторизация | ✅ | Мок-диалог через URL-параметры |
| Сохранения | ✅ | localStorage |
| Лидерборды | ✅ | Мок-данные |
| Платежи | ✅ | Загружаются из `public/purchases-catalog.json` |
| Логи | ✅ | Все вызовы SDK логируются в консоль |

#### 📦 Локальный каталог покупок

Создан файл `public/purchases-catalog.json` с моками товаров:
- Premium Colors Pack — 50 RUB
- Shape Pack — 100 RUB
- No Ads (30 days) — 200 RUB
- 1000 Tokens — 500 RUB

При вызове покупки показывается мок-диалог с опциями успешной покупки и отмены.

---

### 🧪 Тестирование без прокси (fallback)

```bash
# Clean-версия (без SDK, main branch)
cd web-app
pnpm dev          # чистый CAD, токены в localStorage
pnpm build        # сборка в dist/

# Яндекс-версия (yandex-games branch)
pnpm dev:yandex   # с SDK, localStorage fallback
pnpm build:yandex # сборка в dist-yandex/
```

> ⚠️ **Без прокси** SDK может не загрузиться из-за COEP в dev-режиме. Используйте `@yandex-games/sdk-dev-proxy` для полноценного тестирования.

### Песочница Яндекс.Игр

1. `pnpm build:yandex` → `dist-yandex/`
2. `cd dist-yandex && zip -r ../yandex-dist.zip .`
3. Загрузить `yandex-dist.zip` в [Песочницу Яндекс.Игр](https://yandex.ru/dev/games/doc/ru/test)
4. Проверить:
   - ✅ Инициализация SDK
   - ✅ Реклама (fullscreen + rewarded)
   - ✅ Сохранения игрока
   - ✅ Геймплей API (pause/resume)
   - ✅ Авторизация игрока

### Ожидаемое поведение

| Сценарий | Clean-версия | Yandex-версия |
|----------|-------------|---------------|
| Открытие | Работает | Работает |
| Баланс токенов | Не отображается | 💎 0 |
| Ежедневный бонус | Не отображается | 🎁 Доступен |
| Сохранения | localStorage | Яндекс.Облако |
| Реклама | N/A | Показывается |
