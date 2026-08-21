# 🎮 План интеграции Яндекс.Игр для TinkerCraft

**Ветка:** `yandex-games`
**Цель:** Добавить SDK Яндекс.Игр с монетизацией, лидербордами и сохранением прогресса
**SDK файл:** `web-app/public/yandex-sdk.js` (464 строки, полный менеджер)

---

## 📋 Что есть в SDK

| Метод | Описание | Приоритет |
|-------|----------|-----------|
| `initialize()` | Инициализация YaGames SDK | 🔴 P0 |
| `startGameplay()` / `stopGameplay()` | Управление геймплеем (для модерации) | 🔴 P0 |
| `showFullscreenAd()` | Полноэкранная реклама | 🟡 P1 |
| `showRewardedVideo()` | Rewarded реклама (за бонусы) | 🟡 P1 |
| `getPlayer()` | Объект игрока | 🟡 P1 |
| `isAuthorized()` | Проверка авторизации | 🟡 P1 |
| `getPayments()` | Объект платежей (покупки) | 🟢 P2 |
| `getServerTime()` | Серверное время (от накруток) | 🟢 P2 |
| `onPause()` / `onResume()` | События паузы/возобновления | 🟢 P2 |
| `dispose()` | Очистка ресурсов | 🟢 P2 |

---

## 🏗️ Архитектура

```
yandex-games/
├── web-app/
│   ├── public/
│   │   └── yandex-sdk.js      # ✅ Уже есть (YandexSDKManager)
│   ├── src/
│   │   ├── platform/
│   │   │   ├── types.ts       # IPlatform интерфейс
│   │   │   ├── yandex.ts      # Реализация через YandexSDKManager
│   │   │   └── index.ts       # Переключение по VITE_PLATFORM
│   │   ├── store/
│   │   │   ├── game-store.ts  # Токены, бонусы, лидерборды
│   │   │   └── yandex-sync.ts # Синхронизация с Яндекс.Облако
│   │   └── components/
│   │       ├── GameUI.tsx     # Баланс токенов, кнопка "Бонус"
│   │       ├── AdBanner.tsx   # Баннерная реклама
│   │       └── Leaderboard.tsx # Таблица лидеров
│   ├── index.html             # + <script src="/yandex-sdk.js">
│   ├── vite.config.ts         # + define: VITE_PLATFORM
│   └── package.json           # + build:yandex скрипт
└── PLAN_YANDEX.md             # Этот файл
```

---

## 📝 Этапы реализации

### Этап 1: Инфраструктура (P0)

#### 1.1 Создать `src/platform/types.ts`

```typescript
export interface IPlatform {
  // Инициализация
  init(): Promise<boolean>

  // Реклама
  showFullscreenAd(): Promise<boolean>
  showRewardedVideo(): Promise<'tokens' | 'hints' | null>

  // Игрок
  getPlayer(): { id: string; name: string } | null
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

Адаптация `YandexSDKManager` из `yandex-sdk.js`:

```typescript
import type { IPlatform } from './types'
import { YandexSDKManager } from '../../public/yandex-sdk.js'

declare global {
  interface Window {
    YaGames: any
  }
}

class YandexPlatform implements IPlatform {
  private sdk: YandexSDKManager | null = null
  private initialized = false

  async init(): Promise<boolean> {
    if (this.initialized) return true

    // ✅ Обработка офлайн-режима и локальной разработки
    if (typeof window === 'undefined' || !window.YaGames) {
      console.warn('[Yandex] SDK not available (local dev or offline mode)')
      // Fallback: использовать localStorage для локальной разработки
      this.useLocalStorage = true
      return false
    }

    // Проверка окружения
    if (!import.meta.env.VITE_PLATFORM || import.meta.env.VITE_PLATFORM !== 'yandex') {
      console.warn('[Yandex] Platform not enabled')
      return false
    }

    try {
      this.sdk = new YandexSDKManager()
      const result = await this.sdk.initialize()
      this.initialized = result
      return result
    } catch (error) {
      console.error('[Yandex] Init failed:', error)
      // Fallback при ошибке SDK
      console.warn('[Yandex] Falling back to localStorage')
      this.useLocalStorage = true
      return false
    }
  }

  async showFullscreenAd(): Promise<boolean> {
    if (!this.sdk) return false
    return this.sdk.showFullscreenAd()
  }

  async showRewardedVideo(): Promise<'tokens' | 'hints' | null> {
    if (!this.sdk) return null
    const rewarded = await this.sdk.showRewardedVideo()
    return rewarded ? 'tokens' : null
  }

  getPlayer() {
    if (!this.sdk) return null
    const player = this.sdk.getPlayer()
    if (!player) return null
    return {
      id: player.getID?.() || 'anonymous',
      name: player.getName?.() || 'Player'
    }
  }

  isAuthorized(): boolean {
    return this.sdk?.isAuthorized() ?? false
  }

  async saveData(data: Record<string, unknown>): Promise<void> {
    if (!this.sdk) return
    const player = this.sdk.getPlayer()
    if (!player) {
      console.warn('[Yandex] Cannot save: player not authorized')
      return
    }
    await player.setData(data)
  }

  async loadData(): Promise<Record<string, unknown>> {
    if (!this.sdk) return {}
    const player = this.sdk.getPlayer()
    if (!player) return {}
    const data = await player.getData()
    return data as Record<string, unknown>
  }

  async submitScore(leaderboardName: string, score: number): Promise<void> {
    if (!this.sdk) return
    // TODO: Использовать ysdk.leaderboards.setLeaderboardScore
    console.log(`[Yandex] Submit score ${score} to ${leaderboardName}`)
  }

  async getLeaderboardEntries(): Promise<any[]> {
    // TODO: Использовать ysdk.leaderboards.getLeaderboardEntries
    return []
  }

  startGameplay(): void {
    this.sdk?.startGameplay()
  }

  stopGameplay(): void {
    this.sdk?.stopGameplay()
  }

  dispose(): void {
    this.sdk?.dispose()
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

1. **SDK подключается только в Яндекс.Играх** — в clean-версии `VITE_PLATFORM !== 'yandex'`, поэтому `yandex.ts` не инициализируется
2. **Геймплей API обязателен для модерации** — `startGameplay()` / `stopGameplay()` должны вызываться при открытии/закрытии меню
3. **Сохранения через `player.setData()`** — требуют авторизации игрока
4. **Rewarded реклама** — основной источник монетизации (пользователь получает токены)
5. **Лидерборды** — опционально, но рекомендуется для удержания
6. **Экономика токенов** — тестируется на 10 000 игроков (из [`IDEAS_TC_game.md`](../ideas/IDEAS_TC_game.md))
   - Ожидаемый доход: ~275 000 ₽/месяц
   - 6 способов монетизации (баннер, rewarded, экспорты, фигуры, ускорение, супер-бонус)

---

## 🔗 Ресурсы

- [Документация Яндекс.Игр SDK](https://yandex.ru/dev/games/doc/ru/)
- [Инициализация SDK](https://yandex.ru/dev/games/doc/ru/sdk/initializing-js)
- [Реклама](https://yandex.ru/dev/games/doc/ru/ads/ads-js)
- [Сохранения](https://yandex.ru/dev/games/doc/ru/persistence/persistence-js)
- [Лидерборды](https://yandex.ru/dev/games/doc/ru/leaderboards/leaderboards-js)
- **[Идеи для Яндекс-версии](../ideas/IDEAS_TC_game.md)** — полный список геймплейных режимов и экономики

---

## 📝 Чек-лист перед отправкой на модерацию

- [ ] SDK инициализируется без ошибок
- [ ] `LoadingAPI.ready()` вызывается после загрузки
- [ ] `GameplayAPI.start/stop` работают правильно
- [ ] Реклама показывается и закрывается
- [ ] Сохранения работают (setData/getData)
- [ ] Авторизация игрока (гостевой режим тоже работает)
- [ ] Нет крэшей при отсутствии SDK (локальный режим)
- [ ] Обработка паузы (onPause/onResume) — при сворачивании вкладки
- [ ] Сохранение прогресса при закрытии вкладки
- [ ] `LoadingAPI.ready()` вызывается до показа интерфейса
- [ ] Реклама не показывается во время геймплея (только в меню)
- [ ] Данные игрока корректно загружаются при старте
- [ ] Нет дублирования рекламы при быстрых переходах
