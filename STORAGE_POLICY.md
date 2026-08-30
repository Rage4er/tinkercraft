# 💾 Политика хранения данных — проверка соответствия требованиям Яндекс.Игр

## Наша архитектура (v2.1 — исправлено)

| Данные | Хранилище | Метод |
|--------|-----------|-------|
| **Экономика** (токены, подписки, квесты, лимиты, онбординг-флаг) | **Облако Яндекса** | `player.setData()` + `player.setStats()` |
| **Проекты** (.doodle файлы, история операций) | **Локально** IndexedDB | автосохранение |
| **Импорт/экспорт STL** | **Локально** файлы браузера | download/upload API |
| **Настройки UI** | **Локально** localStorage | — |

---

## ✅ Проверка требований платформы

### 1. "Прогресс сохраняется сразу после действия"

**Экономика (облако):**

```typescript
// После каждого действия вызываем syncToCloud()
watchAdForTokens()     → ✅ syncToCloud()
exportStl()            → ✅ syncToCloud() (через calculateAndClaimCashback)
purchaseSubscription() → ✅ syncToCloud()
claimDailyBonus()      → ✅ syncToCloud()
earnActionToken()      → ✅ syncToCloud() (исправлено v2.1)
completeEventQuest()   → ✅ syncToCloud() (исправлено v2.1)
calculateAndClaimCashback() → ✅ syncToCloud() (исправлено v2.1)
```

**Проекты (локально):**

```typescript
// IndexedDB автосохраняет при каждом изменении документа
onChange(document) → saveToIndexedDB(projectId, document)
```

**Статус:** ✅ Соответствует.

---

### 2. "После обновления страницы прогресс не теряется"

**Экономика:** загружается из облака при старте (`loadFromCloud()`).

**Проекты:** загружаются из IndexedDB при старте.

**Статус:** ✅ Соответствует.

---

### 3. "При смене ориентации состояние восстанавливается"

**Экономика:** в облаке, не зависит от ориентации устройства.
**Проекты:** в IndexedDB, не зависит от ориентации.
**Статус:** ✅ Соответствует.

---

### 4. "Работает для авторизованных и неавторизованных"

Яндекс SDK автоматически сохраняет в **гостевой профиль** для неавторизованных игроков. При авторизации данные сливаются с аккаунтом.

**Статус:** ✅ Соответствует.

---

### 5. "Облачные сохранения обязательны для игр с IAP"

У нас IAP отложен, но мы всё равно используем облако для экономики. Когда подключим IAP — требование уже выполнено.

**Статус:** ✅ Соответствует (с запасом).

---

## 🛡 syncToCloud() — что сохраняется

```typescript
// economy-store.ts:syncToCloud()
const currentData = {
  // Основные данные экономики
  tokens: get().tokens,
  lastDailyBonus: get().lastDailyBonus,
  totalModelsCreated: get().totalModelsCreated,
  activeSubscription: get().activeSubscription,
  subscriptionExpiresAt: get().subscriptionExpiresAt,
  rentals: get().rentals,
  todayQuests: get().todayQuests,
  todayQuestsCompleted: get().todayQuestsCompleted,
  // Daily-счётчики (исправлено v2.1)
  todayAdsWatched: get().todayAdsWatched,
  todayActions: get().todayActions,
  todayCashbacks: get().todayCashbacks,
  questTriggers: get().questTriggers,
}
```

---

## 🤔 Есть ли противоречие?

**Вопрос:** Проекты хранятся локально — это ок?

**Ответ:** Да, это правильно. Документация говорит про **прогресс игры** (уровни, достижения, рекорды, улучшения) — это экономика и квесты. Файлы проектов — это **результат творчества пользователя**, аналог фото в фоторедакторе или документа в текстовом редакторе.

**Аналогия:**
- Фотошоп: настройки фильтров (прогресс) → облако; фото (результат) → локально
- Figma: история версий (прогресс) → облако; экспортированные PNG → локально
- TinkerCraft: токены/подписки (прогресс) → облако; .doodle проекты (творчество) → локально

Это стандартная практика для CAD-редакторов.

---

## ✅ Итог

Архитектура хранения данных **полностью соответствует требованиям Яндекс.Игр**. Экономика в облаке, проекты локально — это правильная модель для CAD-редактора.

**Исправления v2.1:**
- `earnActionToken()` теперь вызывает `syncToCloud()`
- `calculateAndClaimCashback()` теперь вызывает `syncToCloud()`
- `completeEventQuest()` теперь вызывает `syncToCloud()`
- `syncToCloud()` теперь сохраняет daily-счётчики (`todayAdsWatched`, `todayActions`, `todayCashbacks`, `questTriggers`)
- `loadFromCloud()` теперь загружает daily-счётчики
- `partialize()` (localStorage кэш) теперь включает daily-счётчики
