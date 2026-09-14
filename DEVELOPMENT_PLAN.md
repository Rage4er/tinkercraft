# TinkerCraft Web — План разработки

**Дата создания:** 2025-07-15
**Текущая версия:** v1.0.0

---

## 🎉 РЕЛИЗ v1.0.0

**Дата релиза:** 2026-08-19
**Платформа:** CAD-версия (чистый 3D-редактор, без интеграций игровых платформ)
**Статус:** ✅ Готов к деплою

### Что достигнуто

- Все 8 фаз разработки завершены (0–7.6)
- ~291 проблем код-ревью закрыты (0 активных)
- ~236 тестов проходят
- Полная i18n локализация (EN + RU)
- 40+ SVG-иконок
- Параметрическое Build Tree для CSG
- Optimized mirror pipeline с кэшированием
- Чистый Open Source код (CAD-версия без SDK)

### История изменений

Все детальные записи изменений см. в [`CHANGELOG.md`](CHANGELOG.md).

---

## 🗺️ Дорожная карта

### ✅ Этап 1 — CAD v1.0.0

**Статус:** Завершён (19.08.2026)

Фазы 0–7.6, релиз, тег `v1.0.0`, деплой на GitHub Pages / Vercel.

### 🔄 Этап 2 — Обновление для Яндекс.Игр

**Статус:** В процессе

#### Y.1 Фундамент SDK ✅ (21.08.2026)

- IPlatform интерфейс, Yandex/Clean реализации
- SDK инициализация, Gameplay API, COEP-разделение
- Сборка `dev:yandex`, `build:yandex`

#### Y.2 Экономика V2 ✅ (28.08.2026, исправлено 22/22 проблем, 299 тестов; **после U1–U10 — 336/336 тестов; после A/B/C — 357/357 тестов**)

- Конфиг экономики, store, квесты, триггеры
- UI-панели (EconomyHUD, QuestPanel, EconomyShop, EconomyBanner)
- i18n EN/RU для всей экономики
- Кэшбэк V2 по коэффициентам
- **Ревью экономики (EC1–EC18, 2026-09-07):** все 18 проблем закрыты (баннер, импорт, экспорт, квесты, кэшбэк, HUD, бейджи, чистые селекторы, UX состояний, тесты) — см. `CODE_REVIEW.md`
- **✅ Глубокое ревью экономики (2026-09-10) — закрыто (2026-09-11):** все 22 проблемы (6 P0 / 9 P1 / 7 P2) **исправлены**: анти-фарм кэшбэка (P0-1), expiry по серверному времени (P0-2), потеря начислений в `syncToCloud` (P0-3, P0-4), клиентская валидация (P0-5), clean-фолбэк SDK (P0-6), а также все P1/P2. Проверка: `pnpm typecheck` 0 ошибок, `pnpm test` 299/299. Полный отчёт — [`docs/ECONOMY_CODE_REVIEW.md`](docs/ECONOMY_CODE_REVIEW.md); статусы — `CODE_REVIEW.md`

#### Y.3 Релиз в Яндекс.Игры 🔲

- Проверка политики баннера (отключение баннера может противоречить модерации)
- Ассеты: иконка 512×512, скриншоты, описание
- ZIP → песочница → модерация
- Мониторинг метрик 2–4 недели

### 🔲 Этап 3 — Параметрическая история (Фаза 8)

**Статус:** Не начата (после Этапа 2)

Параметрическая история операций — редактирование параметров примитивов, CSG, mirror, fillet, extrude прямо в Timeline с перестроением цепочки.

#### Задачи Фазы 8

| # | Задача | Приоритет | Статус |
|---|--------|-----------|--------|
| 8.1 | Timeline edit — UI для редактирования параметров операции | Высокий | 🔲 |
| 8.2 | Edit modal для примитивов (размеры, радиусы, сегменты) | Высокий | 🔲 |
| 8.3 | Edit modal для CSG (тип операции, operand-ы) | Высокий | 🔲 |
| 8.4 | Rebuild on edit — перестроение цепочки после изменения параметра | Высокий | 🔲 |
| 8.5 | Edit modal для fillet/extrude/mirror | Средний | 🔲 |
| 8.6 | Undo для edit — запись изменений в историю | Средний | 🔲 |
| 8.7 | Visual feedback — подсветка редактируемого шага | Низкий | 🔲 |
| 8.8 | CSG-CSG-POSITION-DRIFT — смещение операндов при boolean CSG | Высокий | 🔲 |
| 8.9 | MIRROR-CSG-CHILD-RS-LOSS — сброс масштаба/поворота при зеркале CSG | Высокий | 🔲 |

### 🔲 Будущие возможности (после Фазы 8)

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| Импорт SVG (2D → 3D экструзия) | Средний | 🔲 |
| Импорт 3MF | Средний | 🔲 |
| Экспорт STEP / IGES (OpenCascade.js) | Низкий | 🔲 |
| Размеры / аннотации поверх 3D | Средний | 🔲 |
| Физическая симуляция (Rapier WASM) | Низкий | 🔲 |
| Коллаборативное редактирование (CRDT / WebSocket) | Низкий | 🔲 |

---

## Архитектура

| Уровень | Технология |
|---|---|
| UI / Состояние | React 18 + Zustand 5 |
| 3D Рендеринг | Three.js r170 |
| CSG | manifold-3d 3.0.1+ (WASM, выделенный Worker) |
| Персистентность | IndexedDB (автосохранение + несколько проектов), JSZip (.doodle) |
| PWA | Vite + manifest.json + COOP/COEP заголовки |
| Платформы | Yandex Games SDK / Clean (fallback) |

---

## Быстрый старт

```bash
# Клонировать репозиторий
git clone https://github.com/your-org/tinkercraft.git
cd tinkercraft/web-app

# Установить зависимости
pnpm install

# Запустить dev-сервер
pnpm dev

# Проверка типов
pnpm typecheck

# Запуск тестов
pnpm test
```

---

## Структура файлов

```
web-app/
├── src/
│   ├── App.tsx              # Главный компонент (layout, shortcuts)
│   ├── App.css              # Глобальные стили, темы
│   ├── constants.ts         # Константы (ALL_SHAPES, SNAP_VALUES, и т.д.)
│   ├── main.tsx             # Точка входа
│   ├── components/          # React-компоненты
│   ├── store/               # Zustand stores
│   ├── csg/                 # CSG worker, tree, rebuild
│   ├── io/                  # Импорт/экспорт (STL, Doodle)
│   ├── platform/            # Yandex SDK / Clean stub
│   └── i18n/                # Локализация (EN, RU)
├── public/                  # Статика (favicon, manifest)
├── vite.config.ts           # Конфигурация Vite
├── package.json             # Зависимости, скрипты
└── tsconfig.json            # TypeScript
```

---

## Бенчмарки производительности

| Операция | Среднее время | Примечание |
|----------|---------------|------------|
| Создание куба | < 5ms | WASM, без синхронизации |
| CSG Union (2 куба) | < 20ms | WASM, ~1000 треугольников |
| CSG Subtract (2 куба) | < 25ms | WASM |
| Mirror (простой объект) | < 30ms | clone + mirror + rebuild |
| Undo/Redo (с кэшем) | < 1ms | Snapshot cache |
| Undo/Redo (без кэша) | < 100ms | Полный rebuild через WASM |
| Импорт STL (10K tris) | < 50ms | Парсинг + создание mesh |
| Экспорт STL (10K tris) | < 20ms | Бинарный STL |

---

## Известные проблемы

| # | Проблема | Приоритет | Статус |
|---|----------|-----------|--------|
| **CSG-CSG-POSITION-DRIFT** | Булевые операции между двумя CSG-результатами приводят к смещению операндов | **HIGH** | 🔄 Фаза 8 |
| **MIRROR-CSG-CHILD-RS-LOSS** | Зеркалирование CSG сбрасывает масштаб/поворот дочерних примитивов | **HIGH** | 🔄 Фаза 8 |
| **P0-1** | Анти-фарм кэшбэка не работает: хэш модели не проверяется, повторный экспорт той же модели даёт повторный кэшбэк (`economy-store.ts:1052`, `document-store.ts:1047`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `calculateAndClaimCashback(scan, hash?)` + `todayExportHashes[]`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-2** | Expiry аренд/подписок и кулдауны по локальному `Date.now()` — перевод часов продлевает доступ (§5) (`economy-store.ts:478,488,518,529,537`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `serverTimeNow()`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-3** | `syncToCloud` теряет обновления при `pendingSync=true` — потерянные начисления (`economy-store.ts:789`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `syncTailPending`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-4** | `lastSavedData` не в `partialize` — облако может быть перезаписано старыми данными (`economy-store.ts:841`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `lastSavedData` в `partialize` + `loadFromCloud`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-5** | Вся экономика client-side: правка localStorage = неограниченные токены/подписки (`economy-store.ts:244`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `sanitizeEconomyData()`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-6** | Clean-фолбэк SDK: экономика остаётся активной при падении `yandex.init()`, заработок невозможен (`platform/index.ts:10`, `platform/yandex.ts:29`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `isEconomyAvailable()`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **U10** | SDK инициализируется ПОСЛЕ доступности игры — React-дерево рендерится до `initSdk()` (`main.tsx`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-12) — сплэш → `initSdk()` (таймаут 10с → clean) → рендер; `LoadingAPI.ready()` по факту готовности (workerOk + initDone), fallback 15с убран; `GameplayAPI.start()` через `getInitDonePromise()` |
| **U2** | UI-таймеры кулдауна рекламы «стоят на месте» до обновления кэша 30с (`PropertiesPanel.tsx`, `EconomyMiniHUD.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-12) — `useAdCooldown()`/`getAdCooldownRemainingMs()` (`platform/ad-timers.ts`); посекундный тик с поправкой на серверное смещение; fallback `Date.now()` не кэшируется (P2-5) |
| **U1/U9** | Единый кулдаун 5 мин и единый счётчик rewarded-рекламы на все награды; нужны раздельные по видам (`economy-store.ts`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-12) — `adRewards: Record<AdRewardKind, AdRewardState>` (кулдаун и лимит ≤3/день на каждый вид `tokens`/`import`/`banner`); миграция старых полей; persist v3 + облако; лимиты 705/350; ECONOMY.md v2.1 |
| **U4** | Нет бейджа у 3D-текста на панели фигур (условие по неверному типу `text3d`) (`LeftPanel.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-12) — сравнение по реальному типу `type:'text'` + `canUseText3dRO()` |
| **U5** | Баннер: повторное списание токенов/реклама после покупки скрытия (`EconomyBanner.tsx`, EconomyShop, PropertiesPanel) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-12, P0-1) — EconomyBanner подключён в App.tsx; все 3 точки продажи защищены при активной аренде `disableBanner` |
| **U6** | Нет простой палитры без аренды/подписки (`PropertiesPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-12) — палитра Wad's Optimum 16 всегда; расширенный picker за аренду/подписку |
| **U7** | Мелкие иконки бейджей (`Badge.tsx`, `IconBadge.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-12) — иконки ×2 (10→20px / 16→20px), шрифты 16/13px |
| **U8** | Экспорт не выполняется после оплаты токенами/рекламы (`ExportModal.tsx`, `App.tsx`, `document-store.ts`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-12, P1-1) — единая модель кэшбэка `exportStl(method)`; цепочка оплата→скачивание восстановлена |
| **U3** | Панель экономики дублируется слева (магазин) и справа (`LeftPanel.tsx`, `PropertiesPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-13) — «магазин» = правая панель (`PropertiesPanel` → `EconomyPanel`); вкладка `shop` и `EconomyShop.tsx` удалены; переходы «купить» = `clearSelection()` (экономика при пустом выделении); ECONOMY.md v2.2 (§6.3 — два места) |
| **A1** | Экспорт за рекламу: начислялись токены, файл не скачивался; счётчик общий с HUD (`ExportModal.tsx`, `economy-store.ts`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-14) — вид `export` + `watchAdForExport()` без начисления токенов, экспорт после onRewarded, свой кулдаун/лимит |
| **A2** | Импорт за рекламу: +50/ролик, file chooser после рекламы (нет user activation) (`ImportModal.tsx`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-14) — серия 2 роликов оплачивает импорт (без токенов), диалог ДО рекламы (`importStl(preSelectedFile?)`) |
| **B1** | Баннер-оффер не виден по умолчанию (`economy-store.ts`, `EconomyBanner.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — `bannerVisible` init `true`, RO-геттер `shouldShowBannerRO()` |
| **B2** | Кнопка «3D-текст» disabled без доступа — нет перехода к аренде (`LeftPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — клик открывает правую панель через `setEconomyPanelOpen(true)` |
| **B3** | «Расширенный выбор» палитры закрывал панель свойств (`PropertiesPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — флаг `economyPanelOpen` (ui-store), EconomyPanel внутри панели, «← К свойствам» |
| **C1** | Бейджи увеличены в 2 раза целиком (регрессия U7) (`Badge.tsx`, `IconBadge.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-14) — компактный шрифт 10px/padding 1px 3px, иконки остаются 20×20 |
| **C2** | Токен-иконка = монета, нужен золотой куб (`Badge.tsx`, `IconBadge.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-14) — `TokenIcon` (золотой куб TC) вместо `MoneyIcon` |
| **C3** | Квест «Зазеркалье» молчит — проверка `scale < 0` не срабатывает (`economy-store.ts`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — счёт по mirror-операциям истории + legacy `scale < 0`, порог «≥ target» |

> Ревью экономики (22 проблемы: 6 P0 / 9 P1 / 7 P2) **закрыто 2026-09-11** — все проблемы исправлены (typecheck 0 ошибок, 299/299 тестов). P1/P2 не вносились в эту таблицу отдельно — полный перечень и статусы: [`docs/ECONOMY_CODE_REVIEW.md`](docs/ECONOMY_CODE_REVIEW.md), [`CODE_REVIEW.md`](CODE_REVIEW.md).
>
> **Реестр отзыва пользователя U1–U10 закрыт 2026-09-13** — все 10 проблем исправлено (U3: «магазин» = правая панель, ECONOMY.md v2.2). Проверка: `pnpm verify` — typecheck 0 ошибок, **336/336 тестов (23 файла)**, build/build:yandex успешны. Детали: [`docs/USER_FEEDBACK_ECONOMY.md`](docs/USER_FEEDBACK_ECONOMY.md), [`CHANGELOG.md`](CHANGELOG.md).
>
> **Регрессии A/B/C закрыты 2026-09-14** — платные сценарии (экспорт/импорт за рекламу), UI-переходы (баннер, 3D-текст, палитра), бейджи/квест (компактные бейджи, токен-куб, зеркала). Полный `pnpm verify` ПОСЛЕ всех правок: typecheck 0 ошибок, **357/357 тестов (23 файла)**, build/build:yandex успешны. ECONOMY.md обновлён до **v2.3** (§2 — 4 вида рекламы, максимум дня 405 TC). Детали: [`docs/USER_FEEDBACK_ECONOMY.md`](docs/USER_FEEDBACK_ECONOMY.md), [`CHANGELOG.md`](CHANGELOG.md), [`CODE_REVIEW.md`](CODE_REVIEW.md).
>
> Все ранее исправленные проблемы см. в [`CHANGELOG.md`](CHANGELOG.md).
