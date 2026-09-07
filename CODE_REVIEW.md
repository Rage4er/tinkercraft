# 🔍 Код-ревью: TinkerCraft Web

**Дата создания:** 2025-07-15
**Дата релиза:** 2026-08-19
**Ревьюер:** Koda AI
**Версия проекта:** v1.0.0
**Стек:** React 18 + TypeScript 5.7 + Three.js r170 + Zustand 5 + manifold-3d (WASM) + Vite 6 + pnpm

---

## 🎉 РЕЛИЗ v1.0.0

**Статус:** ✅ Все проблемы закрыты, проект готов к деплою.

### Сводка

| Метрика | Значение |
|---------|----------|
| Всего выявлено проблем | ~291 |
| Исправлено | ~176 |
| Архитектурные / НЕ БАГ | ~115 |
| **Активных проблем** | **0** |

### Полная история

Все исправленные проблемы задокументированы в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

Детальный журнал изменений — в [`CHANGELOG.md`](CHANGELOG.md).

---

## 🔍 Ревью цепочки загрузки Yandex SDK (2026-09-07)

**Симптом:** SDK загружается, стартовая реклама и баннер отображаются, но игра не запускается.

| # | Приоритет | Проблема | Статус |
|---|-----------|----------|--------|
| 1 | 🔴 КРИТИЧНО | SDK-dev-proxy во всех тест-скриптах указывал на порт **5173**, а Vite слушает **5000** (`vite.config.ts`). Прокси показывает свой SDK-мок (реклама + баннер), но iframe игры грузится с мёртвого порта → игра не стартует | ✅ ИСПРАВЛЕНО (`package.json`, `start-dev.bat`, `start-prod.sh`) |
| 2 | 🔴 КРИТИЧНО | `main.tsx` блокирует рендер React на `await initSdk()`, а `YaGames.init()` не имел таймаута — зависший init (postMessage/timing в iframe) = игра никогда не стартует | ✅ ИСПРАВЛЕНО — таймаут 10с через `Promise.race` (`platform/sdk.ts`) |
| 3 | 🟡 СРЕДНЕ | `GameplayAPI.start()` не вызывался при старте: effect модалок срабатывает раньше, чем `initPlatform()` резолвится (`getPlatform()` === null) | ✅ ИСПРАВЛЕНО — вызов после `initPlatform()` в bootstrap-effect (`App.tsx`) |
| 4 | 🟡 СРЕДНЕ | Cleanup `clearInterval(syncInterval)` возвращался из async `bootstrap()` и терялся — интервал syncToCloud не очищался при unmount (утечка, дубль в StrictMode) | ✅ ИСПРАВЛЕНО (`App.tsx`) |

### Рекомендации из ревью — все реализованы (2026-09-07)

| # | Приоритет | Рекомендация | Статус |
|---|-----------|--------------|--------|
| R1 | 🟡 СРЕДНЕ | Рендер не должен блокироваться SDK: `main.tsx` ждал `await initSdk()` до `createRoot()` (худший случай — чёрный экран 15с) | ✅ ИСПРАВЛЕНО — i18n по языку браузера → рендер сразу → SDK параллельно; язык из SDK через `applySdkLanguage()`/`i18n.changeLanguage()` (`main.tsx`, `i18n/init.ts`) |
| R2 | 🟡 СРЕДНЕ | `EconomyOnboarding` вызывал `platform.loadData()` на монтировании вне RAF — postMessage-гонка (паттерн error #185) | ✅ ИСПРАВЛЕНО — ждёт `initPlatform()` (идемпотентен) перед `loadData()`, флаг `cancelled` при unmount (`components/EconomyOnboarding.tsx`) |
| R3 | 🟡 СРЕДНЕ | `LoadingAPI.ready()` вызывался до готовности CSG-воркера — противоречие чек-листу A.1 («нет экранов загрузки» в момент Game Ready) | ✅ ИСПРАВЛЕНО — новый `IPlatform.loadingReady()`, вызов из App.tsx при `workerOk`, fallback-таймер 15с в `yandex.ts` (`platform/types.ts`, `platform/yandex.ts`, `platform/clean.ts`, `App.tsx`) |
| R4 | 🟡 СРЕДНЕ | `getPlayer()` в `yandex.ts init()` без таймаута — зависший getPlayer блокировал init() и загрузку экономики | ✅ ИСПРАВЛЕНО — `Promise.race` с таймаутом 5с → guest mode (`platform/yandex.ts`) |

### Текущий порядок загрузки (после исправлений)

```
1. i18n (язык браузера, мгновенно)          — main.tsx
2. React render (НЕ ждёт SDK)               — main.tsx
3. initSdk() параллельно (таймаут 10с)      — platform/sdk.ts
   ├─ applySdkLanguage() — язык из SDK      — i18n/init.ts
   └─ initPlatform() → RAF: banner, getPlayer (таймаут 5с) — platform/yandex.ts
4. App.tsx bootstrap: initPlatform() → GameplayAPI.start() → economy load
5. CSG-воркер готов (workerOk) → LoadingAPI.ready() (fallback 15с)
```

---

## 📌 Будущие направления

Следующие направления для будущих итераций (не являются активными проблемами):

- **Параметрическая история операций (Фаза 8)** — редактирование параметров примитивов, CSG, mirror, fillet, extrude в Timeline
- **Импорт/экспорт профессиональных форматов** — STEP, IGES, 3MF
- **Коллаборативное редактирование** — CRDT / WebSocket
- **Физическая симуляция** — Rapier WASM

> Все планы см. в [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md).
