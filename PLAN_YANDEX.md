# 🎮 План интеграции Яндекс.Игр для TinkerCraft

**Ветка:** `yandex-games`
**Цель:** Добавить SDK Яндекс.Игр с монетизацией, лидербордами и сохранением прогресса
**SDK:** Официальный `@types/ysdk` + `https://yandex.ru/games/sdk/v2`

---

## 📋 Что есть в официальном SDK

| Метод | Описание | Приоритет |
|-------|----------|-----------|
| `YaGames.init()` | Инициализация SDK | 🔴 P0 |
| `ysdk.getPlayer()` | Объект игрока (авторизация) | 🔴 P0 |
| `ysdk.adv.showFullscreenAdv()` | Полноэкранная реклама | 🟡 P1 |
| `ysdk.adv.showRewardedVideo()` | Rewarded реклама (за бонусы) | 🟡 P1 |
| `ysdk.features.GameplayAPI` | Управление геймплеем (для модерации) | 🔴 P0 |
| `ysdk.leaderboards` | Лидерборды | 🟢 P2 |
| `ysdk.getPayments()` | Объект платежей (покупки) | 🟢 P2 |
| `ysdk.serverTime()` | Серверное время (от накруток) | 🟢 P2 |
| `player.setData()` / `getData()` | Сохранения игрока | 🟡 P1 |
| `player.getName()` / `getID()` | Информация об игроке | 🟡 P1 |

---

## 🏗️ Архитектура

```
yandex-games/
├── web-app/
│   ├── public/
│   │   └── index.html           # + <script src="https://yandex.ru/games/sdk/v2">
│   ├── src/
│   │   ├── platform/
│   │   │   ├── types.ts         # IPlatform интерфейс + SDK/Player типы
│   │   │   ├── yandex.ts        # Реализация через официальный SDK
│   │   │   └── index.ts         # Переключение по VITE_PLATFORM
│   │   ├── store/
│   │   │   ├── game-store.ts    # Токены, бонусы, лидерборды
│   │   │   └── yandex-sync.ts   # Синхронизация с Яндекс.Облако
│   │   └── components/
│   │       ├── GameUI.tsx       # Баланс токенов, кнопка "Бонус"
│   │       ├── AdBanner.tsx     # Баннерная реклама
│   │       └── Leaderboard.tsx  # Таблица лидеров
│   ├── vite.config.ts           # + define: VITE_PLATFORM
│   └── package.json             # + build:yandex скрипт
│       └── dependencies:
│           └── @types/ysdk
└── PLAN_YANDEX.md               # Этот файл
```

---

## 📝 Этапы реализации

### Подготовка (P0)

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

**Официальный подход** с `@types/ysdk`:

```typescript
import type { IPlatform } from './types'
import type { SDK, Player } from 'ysdk'

class YandexPlatform implements IPlatform {
  public ysdk: SDK | null = null
  private player: Player | null = null
  private initialized = false
  private useLocalStorage = false

  async init(): Promise<boolean> {
    if (this.initialized) return true

    // ✅ Обработка офлайн-режима и локальной разработки
    if (typeof window === 'undefined' || !(window as any).YaGames) {
      console.warn('[Yandex] SDK not available (local dev or offline mode)')
      this.useLocalStorage = true
      return false
    }

    // Проверка окружения
    if (!import.meta.env.VITE_PLATFORM || import.meta.env.VITE_PLATFORM !== 'yandex') {
      console.warn('[Yandex] Platform not enabled')
      return false
    }

    try {
      // ✅ Официальный SDK с типизацией
      const YaGames = (window as any).YaGames
      this.ysdk = await YaGames.init()
      console.log('[Yandex] SDK initialized')

      // Загрузка игрока
      try {
        this.player = await this.ysdk.getPlayer()
        console.log('[Yandex] Player authorized:', this.player.getName())
      } catch {
        console.log('[Yandex] Player not authorized (guest mode)')
        this.player = null
      }

      this.initialized = true
      return true
    } catch (error) {
      console.error('[Yandex] Init failed:', error)
      this.useLocalStorage = true
      return false
    }
  }

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
