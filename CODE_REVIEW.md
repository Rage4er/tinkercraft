# 🔍 Код-ревью: TinkerCraft Web

**Дата:** 2025-07-15
**Дата релиза:** 2026-08-19
**Ревьюер:** Koda AI
**Версия проекта:** 1.0.0
**Стек:** React 18 + TypeScript 5.7 + Three.js 0.170 + Zustand 5 + manifold-3d (WASM) + Vite 6 + pnpm

> **Формат:** Этот файл содержит только **активные** (неисправленные) проблемы. Исправленные проблемы перенесены в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).
>
> **🎉 РЕЛИЗ v1.0.0 (2026-08-19):** Все проблемы закрыты, проект готов к деплою.

---

## 🎉 РЕЛИЗ v1.0.0 — 2026-08-19

| Метрика | Значение |
|---------|----------|
| Всего выявлено проблем | ~291 |
| Исправлено | ~176 |
| Архитектурные / НЕ БАГ | ~115 |
| **Активных проблем** | **0** |
| **Статус релиза** | **✅ Готов к деплою** |
| **Платформа** | **CAD-версия (чистый Open Source)** |

### Что проверено к релизу

- [x] Все ~291 проблем из 20+ раундов код-ревью закрыты
- [x] Все критические (CRITICAL) и высокие (HIGH) проблемы исправлены
- [x] ~115 проблем признаны архитектурными решениями (не требуют исправления)
- [x] Утечки памяти (Three.js, WASM, IndexedDB, preview-узлы) — все устранены
- [x] Typecheck strict mode — 0 ошибок
- [x] Чистота кода — нет SDK Яндекс.Игр или других игровых платформ
- [x] i18n локализация — полный перевод EN + RU
- [x] 40+ SVG-иконок — все UI-элементы
- [x] Параметрическое Build Tree для CSG
- [x] Optimized mirror pipeline (кэширование, epsilon-фильтр)

---

## 🎮 РЕЛИЗ Y.1 — Фундамент SDK — 2026-08-21

| Метрика | Значение |
|---------|----------|
| Проблем выявлено | 0 |
| Исправлено | 0 |
| **Активных проблем** | **0** |
| **Статус** | **✅ Готов** |

### Что реализовано

- [x] IPlatform интерфейс (types.ts)
- [x] Yandex реализация (yandex.ts)
- [x] Clean stub (clean.ts)
- [x] Platform switch (index.ts)
- [x] SDK инициализация (sdk.ts + App.tsx)
- [x] SDK в HTML (index.html — п. 1.1)
- [x] Gameplay API stop/start
- [x] COEP-разделение сборок (vite.config.ts)
- [x] Сборка dev:yandex / build:yandex

---

## 🎮 РЕЛИЗ Y.2 — Экономика V12 — 2026-08-23 (текущий)

| Метрика | Значение |
|---------|----------|
| Проблем выявлено | 4 |
| Исправлено | 4 |
| **Активных проблем** | **0** |
| **Статус** | **✅ Готово** |

### Что реализовано ✅

- [x] `economy-config.ts` — все цены/лимиты V12
- [x] `economy-store.ts` — токены, лимиты, подписки, кэшбэк, квесты
- [x] `EconomyHUD.tsx` — HUD токенов + бонусы
- [x] `QuestPanel.tsx` — панель квестов
- [x] `economy-ui-config.ts` — конфиг UI + метки

### Проблемы

- [x] **Y2.1** CRITICAL — два стора экономики (game-store + economy-store) — **ИСПРАВЛЕНО**
- [x] **Y2.2** CRITICAL — замки на фигурах против V12 (все фигуры бесплатны) — **ИСПРАВЛЕНО**
- [x] **Y2.3** HIGH — триггеры квестов (не хватает `export:stl`, `sceneSize` не прогрессирует) — **ИСПРАВЛЕНО**
- [x] **Y2.4** MEDIUM — дублирование UI (EconomyHUD + GamePanel) — **ИСПРАВЛЕНО**

---

## 📋 Активные проблемы

> **Статус: ✅ Все 4 проблемы Y.2 исправлены, релиз готов.**

---

### 🔴 Y2.1 — Два стора экономики (game-store + economy-store) — CRITICAL

**Дата:** 2026-08-23
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Проблема

Два Zustand-стора экономики работают одновременно и конфликтуют:

| Стор | Файл | Модель | Бонус | Реклама | Экспорт |
|------|------|--------|-------|---------|---------|
| **game-store.ts** | `src/store/game-store.ts` | Старая V11 | +5 | +10 (безлимит) | 5 токенов |
| **economy-store.ts** | `src/store/economy-store.ts` | Новая V12 | +50 | +50 (≤3/день) | 50 токенов |

**Влияние:** Игрок видит два UI-пула (EconomyHUD + GamePanel), может получить токены двумя путями, экономика несбалансирована.

**Корневая причина:** game-store.ts создан в MVP (Y.1), economy-store.ts — в Y.2. При переходе на V12 старый стор не удалён.

**Файлы:**
- `src/store/game-store.ts` — **удалить** (устаревший)
- `src/components/GamePanel.tsx` — **удалить или переписать** на economy-store
- `src/components/PropertiesPanel.tsx` — GamePanel рендерится при отсутствии выделения

#### Решение

1. Удалить `game-store.ts`
2. Удалить `GamePanel.tsx` (заменён EconomyHUD + QuestPanel)
3. Убрать импорт GamePanel из PropertiesPanel.tsx
4. Убрать import useGameStore из LeftPanel.tsx и UnlockModal.tsx (или перенести логику в economy-store)

---

### 🔴 Y2.2 — Замки на фигурах против V12 (все фигуры бесплатны) — CRITICAL

**Дата:** 2026-08-23
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Проблема

`lock-config.ts` блокирует torus (10 токенов) и cone (10 токенов) — противоречит ECONOMY.md:

> **Бесплатно навсегда:** Все примитивы (куб, сфера, цилиндр, конус, торус, призма)

**Влияние:** Игрок видит замки на фигурах, которые по V12 должны быть бесплатны.

**Файлы:**
- `src/store/lock-config.ts` — содержит `LOCKED_ITEMS` с фигурами
- `src/components/LeftPanel.tsx` — рендерит бейджи на фигурах
- `src/components/UnlockModal.tsx` — модалка разблокировки фигур

#### Решение

1. Очистить `LOCKED_ITEMS` от фигур — оставить только действия:
   ```ts
   'tool:text3d': { tokens: 75, ad: false, rental24h: true },
   'tool:extendedPalette': { tokens: 75, ad: false, rental24h: true },
   'action:exportSTL': { tokens: 50, ad: true, rental24h: false },
   'action:importSTL': { tokens: 100, ad: true, rental24h: false },
   ```
2. Убрать бейджи из LeftPanel.tsx для фигур
3. Перенести бейджи на кнопки действий (экспорт, импорт, текст, палитра)

---

### 🟡 Y2.3 — Триггеры квестов: только 1 из 14 — HIGH

**Дата:** 2026-08-23
**Приоритет:** HIGH
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Проблема

В `App.tsx` только один триггер:
```ts
completeQuest('addShape:cube') // универсальный триггер
```

Отсутствуют 13 из 14 триггеров по ECONOMY.md:

| Триггер | Статус |
|---------|--------|
| `addShape:cube` | ✅ Есть (но только куб) |
| `addShape:sphere` | ❌ Нет |
| `addShape:cylinder` | ❌ Нет |
| `addShape:cone` | ❌ Нет |
| `addShape:torus` | ❌ Нет |
| `addShape:prism` | ❌ Нет |
| `addShape:pyramid` | ❌ Нет |
| `tool:mirror` | ❌ Нет |
| `setColor` | ❌ Нет |
| `tool:align` | ❌ Нет |
| `csg:union` | ❌ Нет |
| `csg:subtract` | ❌ Нет |
| `csg:intersect` | ❌ Нет |
| `export:stl` | ❌ Нет |
| `import:stl` | ❌ Нет |
| `sceneSize` | ❌ Нет (специальный, по размеру сцены) |

**Влияние:** Квесты генерируются, но прогресс не считается — игроки получают задания, которые невозможно выполнить.

**Файл:** `src/App.tsx` (useEffect с useDocumentStore.subscribe)

#### Решение

Добавить вызовы `completeQuest()` в document-store.ts в соответствующие actions:
- `addShape` → `completeQuest('addShape:' + shapeType)`
- `csgBoolean` → `completeQuest('csg:' + op)`
- `mirrorSelected` → `completeQuest('tool:mirror')`
- `setColor` → `completeQuest('setColor')`
- `alignSelected` → `completeQuest('tool:align')`
- `exportStl` → `completeQuest('export:stl')`
- `importStl` → `completeQuest('import:stl')`
- `sceneSize` → проверять в subscribe по `Object.keys(objects).length`

#### Актуальное состояние (2026-08-23 — исправлено)

Все 14 триггеров реализованы в `App.tsx` через `useDocumentStore.subscribe` и обёртки:

| Триггер | Статус |
|---------|--------|
| `addShape:*` (все типы) | ✅ Реализован (универсальный `addShape:${shapeType}`) |
| `csg:*` (union/subtract/intersect) | ✅ Реализован (`csg:${lastGroupOp.op}`) |
| `setColor` | ✅ Реализован |
| `tool:mirror` | ✅ Реализован |
| `tool:align` | ✅ Реализован |
| `import:stl` | ✅ Реализован |
| `export:stl` | ✅ Реализован (обёртка `handleExportStl` в App.tsx) |
| `sceneSize` | ✅ Реализован (`completeQuest('sceneSize', currKeys.length)`, прогресс по количеству объектов) |

**Исправления:**
1. Добавлена обёртка `handleExportStl` в `App.tsx` — вызывает `exportStl()` + `completeQuest('export:stl')`
2. `completeQuest` в `economy-store.ts` принимает `sceneSize?: number` — прогресс квеста по количеству объектов в сцене
3. `sceneSize` больше не пропускается через `continue` — проверяет `sceneSize > quest.progress` и обновляет прогресс

---

### 🟡 Y2.4 — Дублирование UI: EconomyHUD + GamePanel — MEDIUM

**Дата:** 2026-08-23
**Приоритет:** MEDIUM
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Проблема

Два UI-пула экономики рендерятся одновременно:

| Компонент | Где | Стор | Содержимое |
|-----------|-----|------|------------|
| **EconomyHUD** | `App.tsx:706` | economy-store | 💎 токены, +50 бонус, +50 реклама |
| **GamePanel** | `PropertiesPanel.tsx:132` | game-store | 💎 токены, +5 бонус, +10 реклама, экспорт за 5 |

**Влияние:** Игрок видит два разных UI для одной экономики с разными значениями.

**Файл:** `src/components/PropertiesPanel.tsx` — GamePanel рендерится когда `!firstSelected`

#### Решение

Убрать GamePanel из PropertiesPanel.tsx. EconomyHUD в App.tsx уже покрывает все функции.

---

## 📊 Сводка по раундам

| Раунд | Проблемы | Статус |
|-------|----------|--------|
| **Раунд 1** (2025-07-15) | CRIT-1 (God Component), CRIT-2 (store разделение), CRIT-3 (не баг), WARN-1..8, SEC-1/2, PERF-1/2/3, TEST-1, COSM-1/2/3 | ✅ Все исправлены |
| **Раунд 3** (2025-07-16) | CRIT-R3-1/2/3, WARN-R3-1..8, PERF, TEST, STRUCT | ✅ Все исправлены |
| **Раунд 4** (2026-07-16) | CRIT-R4-1/2/3, WARN-R4-1..7, LOW-R4-1/2/3 | ✅ Все исправлены |
| **Раунд 5** (2026-07-16) | CRIT-R5-1/2, WARN-R5-1/2/3, LOW-R5-1/2/3, Worker cache sync | ✅ Все исправлены |
| **Раунд 6** (2026-07-16) | CRIT-R6-1/2/3, WARN-R6-1..6, PERF-R6-1/2, Q-R6-1/2/3, SEC-R6-1 | ✅ Все исправлены |
| **Раунд 7** (2026-07-16) | ERR-1..6, PART-1..6 — верификация, точность ~78% | ✅ Задокументировано |
| **Раунд 8** (2026-07-16) | CRIT-R8-1/2/3 (WASM leak, race condition, Prototype Pollution) | ✅ Все исправлены |
| **Раунд 9** (2026-07-21) | CRIT-CSG-1/2/3 (CSG координаты, цепочка CSG) | ✅ Все исправлены |
| **Раунд 11** (2026-07-21) | UX-2/3/4 (фильтры, extrude, mirror) | ✅ Все исправлены |
| **Раунд 12** (2026-07-21) | CRIT-MIRROR-1, UX-5 (mirror rotation, ruler click-click) | ✅ Все исправлены |
| **Раунд 14** (2026-07-21) | CRIT-MIRROR-1/2, CRIT-RESIZE-1/2, UX-5/6 | ✅ Все исправлены |
| **Раунд 15** (2026-07-21) | CRIT-RESIZE-1/2, UX-6 | ✅ Все исправлены |
| **BUG-CSG-POS** (2026-07-25) | BUG-CSG-POS-1/2 (CSG позиционирование, stale cache) | ✅ Исправлено |
| **BUG-CSG-POS-5/6** (2026-07-26) | BUG-CSG-POS-5/6 (moveTreeNode рекурсия, двойное TRS) | ✅ Исправлено |
| **Раунд 16 — 17 исправлений** (2026-07-26) | CRIT-R16-1..4, PERF-R16-2/3/4, CODE-R16-1/2/3/4, SEC-R16-1/2/3, TEST-R16-2/3 | ✅ Исправлено |
| **Раунд 17 + SourceCraft** (2025-07-31) | CRIT-17-1 (boolean hash), CRIT-17-2 (resizeObject try/catch), HIGH-1..5, LOW-1..8 | ✅ Все исправлены |
| **SourceCraft — 38 проблем** (2026-07-31) | CRIT-1..12 (treeNodes, busy, drag-select, WASM leak, etc.), MED Store/CSG/UI/IO (12), LOW (12) | ✅ Все исправлены |
| **Mirror boolean/non-manifold** (2026-08-01) | MIRROR-BOOLEAN (finalTransform из centroid), MIRROR-NONMANIFOLD (workerMirrorObject для import_mesh) | ✅ Исправлено |
| **Раунд 18 — 138 проблем** (2026-08-01) | CRIT-18 (5), HIGH-18 (27), MED-18 (56), LOW-18 (50) — 4 слоя (Store, CSG, UI, IO) | ✅ Все закрыты (64 исправлено, 74 архитектурно/НЕ БАГ) |
| **Раунд 19 — 12 проблем** (2026-08-02) | MIRROR-19-1..12 (глубокий аудит mirror) | ✅ Все закрыты (6 исправлено, 5 неактуально, 1 «не баг») |
| **Раунд 20 — CSG-PARAM** (2026-08-03) | CSG-PARAM-1/2/3 (createBakedNode→createBooleanNode, localTransform, дубликаты createPrimitiveNode) | ✅ **Все исправлены** |
| **MIRROR-CSG-RS** (2026-08-07) | MIRROR-CSG-RS (потеря rotation/scale при булевых операциях над зеркальными CSG-результатами) | ✅ **Исправлено** |
| **CYCLE-CSG** (2026-08-08) | CYCLE-CSG (Cannot create cycle in tree — дети CSG-операции отсутствуют при rebuildBuildTree) | ✅ **Исправлено** |
| **7.5.4 — Тесты цепочек** (2026-08-08) | 15 тестов: CSG-цепочки, Mirror+CSG, Undo/Redo, Jump to history | ✅ **Завершено** |
| **7.5.5 — Финальная полировка** (2026-08-13) | devLog, IconButton, тултипы, Layout тулбара, [DIAG:*] → dev mode, иконки Timeline, имя проекта в PropertiesPanel, тултипы Align | ✅ **Завершено** |
| **Фаза 7 — Завершение** (2026-08-05) | Все проблемы Раундов 16–20 верифицированы и закрыты. Фаза 7 официально завершена. | ✅ **Завершена** |
| **Фаза 7.5 — Параметрический скелет** (2026-08-05) | Инфраструктура: createBooleanNode ✅, rebuild boolean ✅, mirror-store ✅, syncObjectsForOperation ✅. Тестирование цепочек ✅, финальная полировка ✅. | ✅ **Завершена** |
| **🎉 РЕЛИЗ v1.0.0** (2026-08-19) | Все ~291 проблем закрыты, 0 активных, готов к деплою | **✅ РЕЛИЗ** |
| **Y2 — Экономика V12** (2026-08-23) | 4 проблемы: 2 CRITICAL, 2 HIGH/MEDIUM → все 4 исправлены | **✅ Готово** |

**Проблема:** Ошибка `Cannot create cycle in tree: obj_7 → csg_8 or obj_5 → csg_8` при `jumpToHistory`, `loadFromProject`, `undo/redo`. При восстановлении дерева из истории boolean-узлы создавались без проверки существования детей (`op.ids[0]`, `op.ids[1]`). Дети могли быть удалены из `objects` (через `delete`), но оставаться в операции `group` → `createBooleanNode` падал с ошибкой циклической зависимости.

**Корень проблемы:** В `rebuildBuildTree` (`rebuild.ts`) при обработке `group` операции не проверялось, что дети уже зарегистрированы в дереве. `isAncestor` в `createBooleanNode` (`history-tree.ts`) проверял циклы через `parentId`, но если дети отсутствовали в дереве — проверка не срабатывала.

**Решение:**
1. Добавлена проверка `getNode(childAId)` и `getNode(childBId)` перед `createBooleanNode`
2. Если один из детей отсутствует — операция пропускается с `console.warn`
3. Улучшено логирование ошибки при создании boolean-узла (выводятся childA/childB и операция)
4. Используется `continue` вместо `break` для корректной обработки оставшихся операций

**Файлы:** `rebuild.ts` (добавлена проверка существования детей, улучшено логирование)

---

### ✅ ЗАВЕРШЕНО — 7.5.4: Тесты цепочек операций (2026-08-08)

**15 тестов в `build-chain.test.ts`, 5 групп:**

1. **CSG цепочки** (3 теста): union/subtract/intersect, вложенный CSG (cube→union+cyl→union+sphere), parentId chain
2. **Mirror + CSG** (2 теста): mirror YZ→union со сферой, multi-select mirror
3. **Undo/Redo через CSG** (3 теста): undo удаляет boolean-ноду, redo воссоздаёт, глубокий 5-шаговый undo/redo
4. **Jump to history** (4 теста): jump к середине цепочки, jump с delete после CSG, jump с delete child CSG, jump через delete→redo
5. **Edge cases** (3 теста): пустая история, несколько CSG с разными types, CSG с move после

**Результат:** 220/220 тестов проекта проходят. Build tree корректно восстанавливается из истории операций.

**Файлы:** `src/store/build-chain.test.ts`

## 📊 Сводка по раундам

| Раунд | Проблемы | Статус |
|-------|----------|--------|
| **Раунд 1** (2025-07-15) | CRIT-1 (God Component), CRIT-2 (store разделение), CRIT-3 (не баг), WARN-1..8, SEC-1/2, PERF-1/2/3, TEST-1, COSM-1/2/3 | ✅ Все исправлены |
| **Раунд 3** (2025-07-16) | CRIT-R3-1/2/3, WARN-R3-1..8, PERF, TEST, STRUCT | ✅ Все исправлены |
| **Раунд 4** (2026-07-16) | CRIT-R4-1/2/3, WARN-R4-1..7, LOW-R4-1/2/3 | ✅ Все исправлены |
| **Раунд 5** (2026-07-16) | CRIT-R5-1/2, WARN-R5-1/2/3, LOW-R5-1/2/3, Worker cache sync | ✅ Все исправлены |
| **Раунд 6** (2026-07-16) | CRIT-R6-1/2/3, WARN-R6-1..6, PERF-R6-1/2, Q-R6-1/2/3, SEC-R6-1 | ✅ Все исправлены |
| **Раунд 7** (2026-07-16) | ERR-1..6, PART-1..6 — верификация, точность ~78% | ✅ Задокументировано |
| **Раунд 8** (2026-07-16) | CRIT-R8-1/2/3 (WASM leak, race condition, Prototype Pollution) | ✅ Все исправлены |
| **Раунд 9** (2026-07-21) | CRIT-CSG-1/2/3 (CSG координаты, цепочка CSG) | ✅ Все исправлены |
| **Раунд 11** (2026-07-21) | UX-2/3/4 (фильтры, extrude, mirror) | ✅ Все исправлены |
| **Раунд 12** (2026-07-21) | CRIT-MIRROR-1, UX-5 (mirror rotation, ruler click-click) | ✅ Все исправлены |
| **Раунд 14** (2026-07-21) | CRIT-MIRROR-1/2, CRIT-RESIZE-1/2, UX-5/6 | ✅ Все исправлены |
| **Раунд 15** (2026-07-21) | CRIT-RESIZE-1/2, UX-6 | ✅ Все исправлены |
| **BUG-CSG-POS** (2026-07-25) | BUG-CSG-POS-1/2 (CSG позиционирование, stale cache) | ✅ Исправлено |
| **BUG-CSG-POS-5/6** (2026-07-26) | BUG-CSG-POS-5/6 (moveTreeNode рекурсия, двойное TRS) | ✅ Исправлено |
| **Раунд 16 — 17 исправлений** (2026-07-26) | CRIT-R16-1..4, PERF-R16-2/3/4, CODE-R16-1/2/3/4, SEC-R16-1/2/3, TEST-R16-2/3 | ✅ Исправлено |
| **Раунд 17 + SourceCraft** (2025-07-31) | CRIT-17-1 (boolean hash), CRIT-17-2 (resizeObject try/catch), HIGH-1..5, LOW-1..8 | ✅ Все исправлены |
| **SourceCraft — 38 проблем** (2026-07-31) | CRIT-1..12 (treeNodes, busy, drag-select, WASM leak, etc.), MED Store/CSG/UI/IO (12), LOW (12) | ✅ Все исправлены |
| **Mirror boolean/non-manifold** (2026-08-01) | MIRROR-BOOLEAN (finalTransform из centroid), MIRROR-NONMANIFOLD (workerMirrorObject для import_mesh) | ✅ Исправлено |
| **Раунд 18 — 138 проблем** (2026-08-01) | CRIT-18 (5), HIGH-18 (27), MED-18 (56), LOW-18 (50) — 4 слоя (Store, CSG, UI, IO) | ✅ Все закрыты (64 исправлено, 74 архитектурно/НЕ БАГ) |
| **Раунд 19 — 12 проблем** (2026-08-02) | MIRROR-19-1..12 (глубокий аудит mirror) | ✅ Все закрыты (6 исправлено, 5 неактуально, 1 «не баг») |
| **Раунд 20 — CSG-PARAM** (2026-08-03) | CSG-PARAM-1/2/3 (createBakedNode→createBooleanNode, localTransform, дубликаты createPrimitiveNode) | ✅ **Все исправлены** |
| **MIRROR-CSG-RS** (2026-08-07) | MIRROR-CSG-RS (потеря rotation/scale при булевых операциях над зеркальными CSG-результатами) | ✅ **Исправлено** |
| **CYCLE-CSG** (2026-08-08) | CYCLE-CSG (Cannot create cycle in tree — дети CSG-операции отсутствуют при rebuildBuildTree) | ✅ **Исправлено** |
| **7.5.4 — Тесты цепочек** (2026-08-08) | 15 тестов: CSG-цепочки, Mirror+CSG, Undo/Redo, Jump to history | ✅ **Завершено** |
| **7.5.5 — Финальная полировка** (2026-08-13) | devLog, IconButton, тултипы, Layout тулбара, [DIAG:*] → dev mode, иконки Timeline, имя проекта в PropertiesPanel, тултипы Align | ✅ **Завершено** |
| **Фаза 7 — Завершение** (2026-08-05) | Все проблемы Раундов 16–20 верифицированы и закрыты. Фаза 7 официально завершена. | ✅ **Завершена** |
| **Фаза 7.5 — Параметрический скелет** (2026-08-05) | Инфраструктура: createBooleanNode ✅, rebuild boolean ✅, mirror-store ✅, syncObjectsForOperation ✅. Тестирование цепочек ✅, финальная полировка ✅. | ✅ **Завершена** |
| **🎉 РЕЛИЗ v1.0.0** (2026-08-19) | Все ~291 проблем закрыты, 0 активных, готов к деплою | **✅ РЕЛИЗ** |

---

## 📊 Итоговая статистика

| Метрика | Значение |
|---------|----------|
| Всего выявлено проблем | ~295 (за всё время) |
| Исправлено | ~176 |
| Архитектурные / НЕ БАГ | ~115 |
| **Активных проблем** | **0** |
| **Фаза 7** | **✅ Завершена (2026-08-05)** |
| **Фаза 7.5** | **✅ Завершена (2026-08-13)** |
| **Фаза 7.6** | **✅ Завершена (2026-08-13)** |
| **🎉 РЕЛИЗ v1.0.0** | **✅ 2026-08-19** |
| **🎮 Y.1 Фундамент SDK** | **✅ 2026-08-21** |
| **🎮 Y.2 Экономика V12** | **✅ 2026-08-23 — все проблемы исправлены** |
| **🔍 Y.3 Экономика — аудит соответствия ECONOMY.md** | **✅ 2026-08-27 — все 13 проблем исправлены** |

---

*Полная история всех код-ревью с детальным описанием каждого раунда: [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md)*

---

## 🔴 MIRROR-CSG-RS — Потеря rotation/scale при булевых операциях над зеркальными CSG-результатами (2026-08-07)

**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

### Проблема

После зеркалирования CSG-объекта (с rotation/scale) последующие булевы операции теряли параметры дочерних фигур (rotation, scale).

**Корневая причина — двойная:**

1. **`handleSyncMesh`** (worker-handlers.ts) применял **только трансляцию** к геометрии CSG-объекта, игнорируя rotation/scale в transform. Для зеркальных CSG-результатов (baked, с rotation/scale в transform) это означало, что булевы операции оперировали **неповёрнутой/немасштабированной** геометрией — терялись все параметры дочерних фигур.

2. **`csgBoolean` `ensureInTree`** регистрировал CSG-результаты как `createPrimitiveNode(id, 'cube', {})` — placeholder cube с пустыми params. При последующем rebuild из дерева (mirror, undo/redo) вместо реальной CSG-геометрии строился дефолтный куб 20×20×20 — «параметры детей обнуляются».

### Исправление

1. **`handleSyncMesh`**: теперь применяет **полный TRS** (rotation + scale + position) через `buildTransformMatrix`, когда transform содержит не-identity rotation/scale. Fast path — только translation — сохранён для обычных CSG-результатов.

2. **`handleRebuildTreeNode`** (baked-нода): аналогично — полный TRS при наличии rotation/scale.

3. **`transformBakedMesh`** (history-tree.ts): аналогично — полный TRS при наличии rotation/scale.

4. **`rebuildFromHistory`**: больше **не запекает** RS (rotation/scale) в вершины. Вершины остаются центрированными (TRS применяется при рендере через pivot и в worker для CSG-булевых).

5. **`csgBoolean` `ensureInTree`**: CSG-результаты теперь регистрируются как **baked-ноды** (готовый меш + полный transform), а не placeholder cube с пустыми params.

### Файлы

`worker-handlers.ts`, `history-tree.ts`, `document-store.ts`, `rebuild.ts`

---

## 🪞 Mirror Pipeline — Раунд 9 (2025-08-07)

**Проблемы, найденные при анализе production-логов:**

| ID | Проблема | Статус | Файлы |
|----|----------|--------|-------|
| **MIRROR-R9-1** | Дублирование preview+confirm (mirrorObject x2) | ✅ ИСПРАВЛЕНО | `mirror-store.ts` |
| **MIRROR-R9-2** | Тройной syncObjectsForOperation (preview hover YZ→XZ→XY) | ✅ ИСПРАВЛЕНО | `mirror-store.ts` |
| **MIRROR-R9-3** | Дубль moveObject с одинаковыми параметрами | ✅ ИСПРАВЛЕНО | `document-store.ts` |
| **MIRROR-R9-4** | Кэш не инвалидировался при изменениях сцены | ✅ ИСПРАВЛЕНО | `document-store.ts`, `mirror-store.ts` |

**Решения:**
1. **MIRROR-CACHE**: `previewMirror` сохраняет результаты в `mirrorCache`, `mirrorSelected` проверяет кэш по plane+ids+transformHash — skip full rebuild.
2. **MIRROR-CACHE-SYNC**: `previewMirror` проверяет кэш перед `syncObjectsForOperation` — skip sync при hover без изменений.
3. **MIRROR-DELTA-EP**: `moveObject` проверяет delta < 1e-6 по всем 9 параметрам — skip near-identical calls.
4. **MIRROR-CACHE-INVALIDATE**: `invalidateMirrorCache()` вызывается в 14 мутирующих методах.

---

## 🔍 Y.3 — Экономика: аудит соответствия ECONOMY.md (2026-08-27)

**Дата ревью:** 2026-08-27
**Источник:** `ECONOMY.md` v1.0 (релиз)
**Проверено файлов:** `economy-store.ts`, `economy-config.ts`, `economy-ui-config.ts`, `EconomyHUD.tsx`, `QuestPanel.tsx`, `ExportModal.tsx`, `TextModal.tsx`, `document-store.ts`, `App.tsx`, `PropertiesPanel.tsx`, `LeftPanel.tsx`, `translation.json`
**Итого проблем:** 13 (7 критических, 3 средних, 3 незначительных)

### Сводная таблица

| ID | Приоритет | Описание | Статус |
|----|-----------|----------|--------|
| Y3.1 | 🔴 CRITICAL | `earnActionToken()` нигде не вызывается | ✅ ИСПРАВЛЕНО |
| Y3.2 | 🔴 CRITICAL | `calculateAndClaimCashback()` нигде не вызывается | ✅ ИСПРАВЛЕНО |
| Y3.3 | 🔴 CRITICAL | Хэш модели для кэшбэка не проверяется | ✅ ИСПРАВЛЕНО |
| Y3.4 | 🔴 CRITICAL | Событийные квесты (`export_stl`, `import_stl`) не обрабатываются | ✅ ИСПРАВЛЕНО |
| Y3.5 | 🔴 CRITICAL | Квест `csg_complex` всегда возвращает 0 | ✅ ИСПРАВЛЕНО |
| Y3.6 | 🔴 CRITICAL | Квест `count_mirrored` всегда 0 | ✅ ИСПРАВЛЕНО |
| Y3.7 | 🔴 CRITICAL | 3D текст определяется неверно (`'text'` вместо `'text3d'`) | ✅ ИСПРАВЛЕНО |
| Y3.8 | 🟡 HIGH | Нет UI для покупки аренды | ✅ ИСПРАВЛЕНО |
| Y3.9 | 🟡 HIGH | Нет UI для покупки подписок | ✅ ИСПРАВЛЕНО |
| Y3.10 | 🟡 HIGH | Кнопка «Бесплатный экспорт» противоречит ECONOMY.md | ✅ ИСПРАВЛЕНО |
| Y3.11 | 🟢 LOW | Нет таймера кулдауна рекламы в UI | ✅ ИСПРАВЛЕНО |
| Y3.12 | 🟢 LOW | Fallback категорий квестов нарушает правило | ✅ ИСПРАВЛЕНО |
| Y3.13 | 🟢 LOW | `todayQuestsCompleted` не используется | ✅ ИСПРАВЛЕНО |

---

### 🔴 Y3.1 — `earnActionToken()` нигде не вызывается — CRITICAL

**Дата:** 2026-08-27
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

Добавлены вызовы `earnActionToken()` в:
- `addShape` (document-store.ts)
- `addRawMesh` (document-store.ts)
- `addTextMesh` (document-store.ts)
- `importStl` (document-store.ts)

**Файлы:**
- `src/store/document-store.ts` — добавлены вызовы

---

### 🔴 Y3.2 — `calculateAndClaimCashback()` нигде не вызывается — CRITICAL

**Дата:** 2026-08-27
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

Добавлен вызов `calculateAndClaimCashback()` + проверка хэша в `exportStl` (document-store.ts):
- Рассчитывается `objectCount` (без import_mesh и text3d)
- Считаются `csgOps` (operations типа 'group')
- Проверяется `lastExportHash` — кэшбэк только при изменении модели
- Хэш сохраняется при успешном кэшбэке

**Файлы:**
- `src/store/document-store.ts` — добавлены вызовы
- `src/store/economy-store.ts` — экспортирован `createExportHash`

---

### 🔴 Y3.3 — Хэш модели для кэшбэка не проверяется — CRITICAL

**Дата:** 2026-08-27
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

В `economy-store.ts`:
- `lastExportHash` объявлена (строки 100, 246) ✅
- `createExportHash()` реализована (строки 217–220) ✅

В `document-store.ts` `exportStl`:
- Вызывается `createExportHash()` для создания хэша модели
- Проверяется `lastExportHash` — кэшбэк только при изменении модели
- Хэш сохраняется при успешном кэшбэке

**Файлы:**
- `src/store/document-store.ts` — добавлена проверка хэша
- `src/store/economy-store.ts` — `createExportHash` экспортирован

---

### 🔴 Y3.4 — Событийные квесты не обрабатываются — CRITICAL

**Дата:** 2026-08-27
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

Добавлен `completeEventQuest` в economy-store.ts и вызовы в document-store.ts:

| Квест | Триггер | Место |
|-------|---------|-------|
| «Первая выгрузка» | `export_stl` | `exportStl()` |
| «Чужая геометрия» | `import_stl` | `importStl()` |
| «Достойная печать» | `export_stl_large` | обрабатывается через `evaluateQuests` (objectCount ≥ 10) |

`completeEventQuest` в economy-store.ts:
- Находит квест по trigger
- Устанавливает `completed: true`, `progress: target`
- Начисляет токены за новый выполненный квест

**Файлы:**
- `src/store/economy-store.ts` — добавлен `completeEventQuest`
- `src/store/document-store.ts` — добавлены вызовы в `exportStl` и `importStl`

---

### 🔴 Y3.5 — Квест `csg_complex` всегда возвращает 0 — CRITICAL

**Дата:** 2026-08-27
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

В `evaluateQuests` (economy-store.ts) добавлен подсчёт CSG с детьми:
- Проверяются операции `group` — собираются `ids` operand-ов
- Для каждого CSG-объекта проверяется, есть ли он в `ids` и сколько детей
- Если CSG имеет ≥ 3 детей — `csgWithChildren++`
- Case `csg_complex` теперь использует `csgWithChildren`

**Файлы:**
- `src/store/economy-store.ts` — реализован подсчёт CSG с детьми

---

### 🔴 Y3.6 — Квест `count_mirrored` всегда 0 — CRITICAL

**Дата:** 2026-08-27
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

В `evaluateQuests` (economy-store.ts) добавлена проверка зеркального отражения:
- Проверяется `transform.scaleX < 0 || scaleY < 0 || scaleZ < 0`
- Счётчик `mirroredCount++` для каждого зеркального объекта
- Case `count_mirrored` теперь использует `mirroredCount`

**Файлы:**
- `src/store/economy-store.ts` — добавлена проверка mirror по transform

---

### 🔴 Y3.7 — 3D текст определяется неверно — CRITICAL

**Дата:** 2026-08-27
**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

В `evaluateQuests` (economy-store.ts, строка 480):
- Исправлено `'text'` → `'text3d'`

**Файлы:**
- `src/store/economy-store.ts` — исправлен тип shapeType

---

### 🟡 Y3.8 — Нет UI для покупки аренды — HIGH

**Дата:** 2026-08-27
**Приоритет:** HIGH
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

Создан новый компонент `EconomyShop.tsx`:
- Панель аренды с 3 позициями: 3D-текст (75), расширенная палитра (75), отключение баннера (50)
- Для каждой позиции показывается статус (активно/неактивно) и оставшееся время
- Кнопка покупки с проверкой баланса токенов
- Подписки: недельная (700) и месячная (2000) с отображением активной подписки

**Файлы:**
- `src/components/EconomyShop.tsx` — новый компонент
- `src/App.tsx` — добавлен импорт и рендер после QuestPanel

---

### 🟡 Y3.9 — Нет UI для покупки подписок — HIGH

**Дата:** 2026-08-27
**Приоритет:** HIGH
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

Подписки добавлены в `EconomyShop.tsx`:
- Недельная (700 токенов, ≈ 100/день) и месячная (2000, ≈ 67/день)
- При активной подписке показывается статус и оставшееся время
- Кнопки покупки с проверкой баланса

**Файлы:**
- `src/components/EconomyShop.tsx` — добавлен блок подписок

---

### 🟡 Y3.10 — Кнопка «Бесплатный экспорт» противоречит ECONOMY.md — HIGH

**Дата:** 2026-08-27
**Приоритет:** HIGH
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

Удалена кнопка «Бесплатный экспорт» из `ExportModal.tsx`:
- Убран блок `<button ... onClick={() => { onClose(); onExport('free') }}>...</button>`
- Остались только два варианта: токены и реклама

**ECONOMY.md п. 3.1:** «Экспорт STL (1 файл): 50 токенов / 1 просмотр рекламы / 1 операция»

**Файлы:**
- `src/components/ExportModal.tsx` — удалена кнопка бесплатного экспорта

---

### 🟢 Y3.11 — Нет таймера кулдауна рекламы в UI — LOW

**Дата:** 2026-08-27
**Приоритет:** LOW
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

Таймер кулдауна рекламы уже был реализован в `EconomyHUD.tsx`:
- `getAdCooldownRemaining()` — расчёт оставшегося времени (5 мин)
- `formatCooldown()` — форматирование в "M:SS"
- Обновление каждую секунду через `useEffect`
- Отображение ⏱ таймера между кнопкой и бонусом

**Файлы:**
- `src/components/EconomyHUD.tsx` — строки 8-22, 32-41, 92-96

---

### 🟢 Y3.12 — Fallback категорий квестов нарушает правило — LOW

**Дата:** 2026-08-27
**Приоритет:** LOW
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

В `generateDailyQuestsV2` (economy-store.ts) исправлен fallback:
- Вместо `pool[Math.floor(Math.random() * pool.length)]` (случайный без проверки)
- Теперь: `pool.find(q => !usedCategories.has(q.category)) ?? pool[0]`
- Сначала ищем квест из неиспользованной категории, только если нет — берём любой

**ECONOMY.md:** «Все из разных категорий. Никаких «5 кубов / 10 кубов / 25 кубов» в один день.»

**Файлы:**
- `src/store/economy-store.ts` — строка 187

---

### 🟢 Y3.13 — `todayQuestsCompleted` не используется — LOW

**Дата:** 2026-08-27
**Приоритет:** LOW
**Статус:** ✅ **ИСПРАВЛЕНО**

#### Решение

В `evaluateQuests` и `completeEventQuest` (economy-store.ts):
- Добавлен флаг `_justCompleted` для отслеживания новых завершений
- Токены начисляются только если `difficulty` ещё не в `todayQuestsCompleted`
- `todayQuestsCompleted` обновляется при каждом начислении
- QuestPanel.tsx уже использует `todayQuestsCompleted.includes(quest.difficulty)` для отображения

**Файлы:**
- `src/store/economy-store.ts` — добавлен `_justCompleted`, исправлена логика начисления
- `src/components/QuestPanel.tsx` — уже использовал `todayQuestsCompleted`

---

## 📌 Будущие направления

### Параметрическая история операций (Фаза 8)

Следующий этап улучшения после завершения всех раундов ревью:

- **Раскрытие CSG-операций** в Timeline — редактирование состава operand-ов и типа boolean операции
- **Редактирование параметров** примитивов прямо в истории (width/height/depth, radius, segments)
- **Перестроение цепочки** при изменении любого шага — `rebuildFromHistory(ops.slice(0, index + 1))`
- **Edit modal** для fillet, extrude, mirror — изменение параметров без undo/redo
- **Undo для edit** — запись предыдущего состояния в историю

Базовая инфраструктура уже готова: история операций ✅, build tree ✅, rebuildFromHistory ✅, boolean-ноды в дереве ✅ (CSG-PARAM-1). Нужно только UI.
