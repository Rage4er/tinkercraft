# 🔍 Код-ревью: TinkerCraft Web

**Дата:** 2025-07-15
**Ревьюер:** Koda AI
**Версия проекта:** 0.0.1
**Стек:** React 18 + TypeScript 5.7 + Three.js 0.170 + Zustand 5 + manifold-3d (WASM) + Vite 6 + pnpm

> **Формат:** Этот файл содержит только **активные** (неисправленные) проблемы. Исправленные проблемы перенесены в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

---

## 📋 Активные проблемы

### 🔴 Mirror — 10 проблем (MIRROR-1..10)

| # | Проблема | Severity | Файл | Суть |
|---|----------|----------|------|------|
| MIRROR-1 | Плоскость зеркала через origin вместо центра BBox выделения | MEDIUM | [`history-tree.ts:577-583`](web-app/src/csg/history-tree.ts:577) | ✅ ИСПРАВЛЕНО — mirror через центр BBox выделения |
| MIRROR-2 | Отсутствие предпросмотра результата | MEDIUM | — | Пользователь не видит результат до применения |
| MIRROR-3 | Baked nodes с вращением — rotation не инвертируется | **HIGH** | [`history-tree.ts:604-614`](web-app/src/csg/history-tree.ts:604) | ✅ ИСПРАВЛЕНО |
| MIRROR-4 | 3D хендлы для выбора плоскости mirror | LOW | — | Выпадающий список менее интуитивен, чем 3D-стрелки |
| MIRROR-5 | Потеря параметричности boolean → baked при mirror | **HIGH** | [`document-store.ts:641-643`](web-app/src/store/document-store.ts:641) | ✅ ИСПРАВЛЕНО |
| MIRROR-6 | Fallback-ноды не удаляются после mirror | MEDIUM | [`document-store.ts:584-594`](web-app/src/store/document-store.ts:584) | ✅ ИСПРАВЛЕНО — созданные fallback-ноды удаляются |
| MIRROR-7 | Трансформ boolean ноды из первого child | MEDIUM | [`history-tree.ts:596-634`](web-app/src/csg/history-tree.ts:596) | ✅ ИСПРАВЛЕНО — используется собственный localTransform |
| MIRROR-8 | Scale не инвертируется при mirror | **HIGH** | [`rebuildOps.ts:78-81`](web-app/src/csg/rebuildOps.ts:78) | ✅ ИСПРАВЛЕНО |
| MIRROR-9 | Двойная синхронизация для import_mesh | LOW | [`document-store.ts:556-564`](web-app/src/store/document-store.ts:556) | Лишний postMessage в воркер |
| MIRROR-10 | Нет проверки успешности sync перед mirror | MEDIUM | [`document-store.ts:549-558`](web-app/src/store/document-store.ts:549) | ✅ ИСПРАВЛЕНО — `.catch(() => {})` удалён, ошибки идут в try/catch |

### ⚠️ Раунд 16 — Код-ревью (18 проблем, верифицированы)

#### 🔴 Критические (4)

| # | Проблема | Файл | Вердикт верификации | Скорректированный приоритет |
|---|----------|------|---------------------|---------------------------|
| CRIT-R16-1 | `handleRebuildScene` без `try/finally` — утечка WASM-памяти при ошибках | [`worker-handlers.ts:756`](web-app/src/csg/worker-handlers.ts:756) | ⚠️ Частично верно — утечка временная, до следующего rebuild | ✅ Исправлено |
| CRIT-R16-2 | Мутация `vertices` в `extractAndCenter` — неожиданный побочный эффект | [`helpers.ts:29`](web-app/src/store/helpers.ts:29) | ⚠️ Верно, но преувеличено — JSDoc уже документирует поведение | ✅ Исправлено |
| CRIT-R16-3 | `any` в `collectSubtreeForWorker` и `applyCSGMeshes` | [`history-tree.ts:366`](web-app/src/csg/history-tree.ts:366) | ✅ Верно — нарушение strict: true | ✅ Исправлено |
| CRIT-R16-4 | `JSON.stringify` в `computeNodeHash` — проблема производительности | [`history-tree.ts:254`](web-app/src/csg/history-tree.ts:254) | ✅ Верно, но severity спорный — вызывается только при rebuild | ✅ Исправлено |

#### ⚡ Производительность (4)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| PERF-R16-1 | Двойной проход по вершинам в `extractAndCenterGetAABB` | [`helpers.ts:44`](web-app/src/store/helpers.ts:44) | ❌ Неверно — функция не вызывает `computeAABB`, два прохода неизбежны | ❌ Закрыто |
| PERF-R16-2 | `Array.from()` в hot path | [`history-tree.ts:446`](web-app/src/csg/history-tree.ts:446) | ⚠️ Частично неверно — только в одной из двух указанных функций | ✅ Исправлено |
| PERF-R16-3 | Избыточные ререндеры через Zustand | — | ⚠️ Вводит в заблуждение — 32/33 уже с селекторами | ✅ Исправлено |
| PERF-R16-4 | `computeVertsHash` — возможны коллизии | [`Viewport3D.tsx:68`](web-app/src/components/Viewport3D.tsx:68) | ✅ Верно — сумма произведений для симметричных мешей | ✅ Исправлено |

#### 📝 Читаемость (4)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| CODE-R16-1 | Дублирование матричной математики | [`rebuild.ts:154`](web-app/src/store/rebuild.ts:154), [`worker-matrix.ts:15`](web-app/src/csg/worker-matrix.ts:15) | ✅ Верно | ✅ Исправлено |
| CODE-R16-2 | Магические числа в Viewport3D | [`Viewport3D.tsx:97`](web-app/src/components/Viewport3D.tsx:97) | ✅ Верно | ✅ Исправлено |
| CODE-R16-3 | Смешение русского и английского в комментариях |多处 | ✅ Верно | ✅ Исправлено |
| CODE-R16-4 | `GizmoMode` с `null` как значение | [`ui-store.ts:11`](web-app/src/store/ui-store.ts:11) | ✅ Верно | ✅ Исправлено |

#### 🔒 Безопасность (3)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| SEC-R16-1 | Отсутствие валидации входящих данных в worker | [`worker.ts`](web-app/src/csg/worker.ts) | ✅ Верно — `as unknown as` касты без валидации | ✅ Исправлено |
| SEC-R16-2 | `try/catch` с пустым `catch` | [`worker-handlers.ts:104,930`](web-app/src/csg/worker-handlers.ts:104) | ⚠️ Частично неверно — только в worker-handlers.ts, не в document-store.ts | ✅ Исправлено |
| SEC-R16-3 | `setCached` без проверки на disposed объекты | [`worker-handlers.ts:108`](web-app/src/csg/worker-handlers.ts:108) | ✅ Верно, но низкая ценность — вызывается с только что созданными объектами | ✅ Исправлено |

#### 🧪 Тестирование (3)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| TEST-R16-1 | Нет тестов для критических функций | — | ⚠️ Частично неверно — `buildRebuildMeta` тестируется | ⚠️ Открыто |
| TEST-R16-2 | Тесты используют `as any` для обхода типов | — | ⚠️ Преувеличено/устарело — всего 1 `as any` в history-tree.test.ts | ✅ Исправлено |
| TEST-R16-3 | Нет тестов для `snap-utils.ts` | [`snap-utils.ts`](web-app/src/components/snap-utils.ts) | ✅ Верно — 468 строк без тестов | ✅ Исправлено |

---

## ✅ Исправленные проблемы (сводка)

Полная история исправлений с деталями — в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

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
| **Mirror HIGH** (2026-07-30) | MIRROR-3, MIRROR-5, MIRROR-8 | ✅ Исправлено |
| **Mirror MEDIUM** (2026-07-30) | MIRROR-1, MIRROR-6, MIRROR-7, MIRROR-10 | ✅ Исправлено |

---

## 🎯 План действий (приоритет)

### 🔴 HIGH — исправить в первую очередь

| # | Задача | Сложность | Файл |
|---|--------|-----------|------|
| — | (все HIGH исправлены) | — | — |

### 🟡 MEDIUM — следующий приоритет

| # | Задача | Сложность | Файл |
|---|--------|-----------|------|
| — | (все MEDIUM исправлены) | — | — |

### 🟢 LOW — косметика/производительность

| # | Задача | Сложность | Файл |
|---|--------|-----------|------|
| MIRROR-2 | Предпросмотр результата mirror | Средняя | — |
| MIRROR-4 | 3D хендлы для выбора плоскости | Высокая | — |
| MIRROR-9 | Исправить двойную синхронизацию import_mesh | Низкая | [`document-store.ts:556-564`](web-app/src/store/document-store.ts:556) |
| PERF-R16-1 | Двойной проход — ❌ неверно, закрыто | Н/Д | — |
| TEST-R16-1 | Тесты для `handleCsgBooleanSync`, `handleRebuildScene` | Высокая | — |

---

## 📊 Сводка

| Метрика | Значение |
|---------|----------|
| Всего выявлено проблем | ~80+ (за всё время) |
| Исправлено | ~77+ |
| Активных | 3 (3 Mirror LOW) |
| HIGH активных | 0 (все HIGH исправлены) |
| Точность ревью (Раунд 16) | ~50% (8/18 полностью верных) |

---

*Полная история всех код-ревью с детальным описанием каждого раунда: [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md)*
