# Рефакторинг `yandex-games` (Y.1–Y.5) — 2026-11-05

> Цель: вынести yandex-код (экономика, SDK) из общих файлов в отдельные, чтобы
> `merge main → yandex-games` давал минимум конфликтов. **Поведение приложения не менялось**
> (кроме одного осознанного исправления — Gameplay API, см. §5).
>
> Не путать с историческими «Y.1 Фундамент SDK» / «Y.2 Экономика V2» из `DEVELOPMENT_PLAN.md`
> (это фазы 2026-08; здесь Y.N — шаги рефакторинга).

## 1. Результат

| Шаг | Что вынесено | Куда | Коммит |
|---|---|---|---|
| **Y.1** | `EconomyPanel` (токены, бонус, квесты, аренда, подписки), хелперы времени, мини-HUD и режим экономики в правой панели | `components/EconomyPanel.tsx` | `8bf51d4` |
| **Y.2** | SDK-bootstrap, `LoadingAPI.ready()`, Gameplay API | `hooks/useYandexInit.ts` | `a7ce22e` |
| **Y.5** | Онбординг, модалка аренды, модалки экспорта/импорта + их обработчики | `components/EconomyOverlays.tsx` | `a7ce22e` |
| — | Gameplay API: пауза при любой модалке (исправление) | `hooks/useYandexInit.ts` | `2b4cfd2` |
| **Y.4** | Тип `ExportPaymentMethod` | `store/economy-types.ts` | `c8a4aac` |
| **Y.3** | Экономические врезки `document-store` и экономика экспорта STL | `store/economy-integration.ts` | `10724e0` |

Дифф к `main` (строк добавлено/удалено):

| Файл | До рефакторинга | После |
|---|---|---|
| `components/PropertiesPanel.tsx` | +719 / −165 | +89 / −14 |
| `App.tsx` | +240 | +63 / −14 |
| `store/document-store.ts` | +258 | +146 / −18 |

Тесты: 625 → **647** (47 файлов), `pnpm verify` (typecheck + test + build + build:yandex) зелёный.

## 2. Карта: что откуда переехало

### `PropertiesPanel.tsx` → `components/EconomyPanel.tsx` (Y.1)
- `EconomyPanel` (default export, без пропсов — всё в `economy-store`).
- Хелперы `serverNow`, `formatRentalRemaining`, `formatSubRemaining`, `checkBonusAvailable`; `t: any` заменён на `TFunction`.
- `EconomyModeSection` — мини-HUD (EC6) + блок «режим экономики» с кнопкой «назад» (B2/B3). Читает `economyPanelOpen` из `ui-store` сам.
- `useEconomyModeReset(firstSelectedId)` — сброс режима при смене выбранного объекта (B3).
- В `PropertiesPanel` осталось: `<EconomyModeSection />`, `useEconomyModeReset(...)`, `{isEconomyAvailable() && <EconomyPanel />}` (нет выделения) и гейтинг расширенной палитры (`canUseExtendedPicker` и др. — переплетён с draft-цветом).
- Форматирование блоков `canResize` / `canFillet` / `selectedIds.length === 2` возвращено к виду `main` (убрано ~150 строк шума).

### `App.tsx` → `hooks/useYandexInit.ts` (Y.2)
- Bootstrap: `initPlatform` → `loadFromCloud` → `initDailyQuests` → `checkSubscriptionExpiry` → debug-grant → баннер (`syncPlatformBanner`) → синк 30 с → day-rollover (60 с + `visibilitychange` + `focus`).
- `LoadingAPI.ready()` — после `workerOk` и `getInitDonePromise()`.
- Gameplay API — start/stop по `isAnyModalOpen()`.
- В `App.tsx`: `useYandexInit()` одной строкой. Удалён мёртвый `setEconomyPanelOpen`.

### `App.tsx` → `components/EconomyOverlays.tsx` (Y.5)
- `EconomyOnboarding`, `RentalModal`, `ExportModal`, `ImportModal`, обработчики выполнения экспорта/импорта.
- Флаги `showExportModal` / `showImportModal` перенесены из локального state `App` в `ui-store`; Toolbar открывает их через `setShowExportModal(true)` / `setShowImportModal(true)`.
- Оверлеи монтируются после `TextModal` (порядок наложения равных `z-index` изменился: модалка аренды теперь поверх текстовой; `handleAddText` закрывает текстовую перед открытием аренды).

### `document-store.ts` → `store/economy-integration.ts` (Y.3)
- Тонкие обёртки: `evaluateQuestsAfterMutation`, `earnActionToken`, `completeImportQuest`, `commitQuests`.
- `settleExport(ctx, download)` — вся экономика экспорта STL + `stripHeavyFieldsForHash`.
- `exportStl` в ядре: сериализация Blob (`exportToStl`) → `settleExport(...)`.
- `document-store.ts` больше не импортирует `economy-store` / `economy-config`.

### Типы (Y.4)
`ExportPaymentMethod = 'tokens' | 'ad'` — `store/economy-types.ts`; используется в `store/types.ts`, `document-store.ts`, `ExportModal.tsx`, `EconomyOverlays.tsx`.

## 3. Инварианты (не ломать)

1. **Порядок в `settleExport`:** хэш → `calculateAndClaimCashback` → `setExportHash` → скачивание → тост → `completeEventQuest(export_stl[_large])` → `commitQuests`. Кэшбэк строго ДО `setExportHash` (анти-фарм), события квестов ДО `commitQuests`. Тест: `document-store.test.ts` → «порядок settleExport».
2. **Blob до экономики (P2-6):** если `exportToStl` упал — хэш, кэшбэк и квесты не трогаются.
3. **Порядок bootstrap:** `initPlatform` → `loadFromCloud` → debug-grant (иначе облако перезатрёт счёт); guard `economyInitialized` (StrictMode) и cleanup интервалов/слушателей сохранены.
4. **Врезки НЕ в `cacheSnapshotWithTree`:** эту функцию зовут и мутации без квестов (`moveObject`, `setColor`, `toggleVisible`, `renameObject`, `restoreAutosave`, `extrudeSelected`); эмит оттуда начислял бы токены при каждом переименовании. Тест: «moveObject/renameObject/setColor НЕ оценивают квесты».
5. **Один список модалок:** `isAnyModalOpen()` в `useYandexInit.ts`. Новая модалка добавляется туда (и её флаг — в `ui-store`).
6. **Тесты мокают по пути модуля:** `EconomyPanel.tsx` обязан импортировать `../platform`, `../platform/server-time`, `../platform/ad-timers`, `../store/ui-store` напрямую (без barrel-реэкспортов) — иначе `PropertiesPanel.color.test.tsx` перестанет работать.

## 4. Как мержить `main → yandex-games` дальше

- Конфликты в `PropertiesPanel.tsx` / `App.tsx` / `document-store.ts` теперь ожидаются только в оставшихся тонких вставках:
  - `PropertiesPanel`: импорты, гейтинг палитры, три строки с экономикой, `FolderIcon` вместо эмодзи;
  - `App`: импорты, `useYandexInit()`, `<EconomyOverlays />`, гейтинг 3D-текста (`handleAddText`, пропсы `LeftPanel`);
  - `document-store`: ~20 однострочных вызовов (`evaluateQuestsAfterMutation`, `earnActionToken`, …) рядом с `invalidateMirrorCache()`.
- При конфликте в ядре: брать версию `main`, затем заново добавить однострочные вызовы по таблице из `economy-integration.ts` (вызов сразу после `cacheSnapshotWithTree` + `invalidateMirrorCache`).
- После merge: `pnpm verify`; сверить набор вызовов `grep -n "evaluateQuestsAfterMutation\|earnActionToken\|completeImportQuest\|commitQuests\|settleExport" web-app/src/store/document-store.ts`.

## 5. Единственное изменение поведения

**Gameplay API:** `stopGameplay()` вызывался только для текста, менеджера проектов и экспорта. Модалки импорта, аренды 24ч и онбординг геймплей не останавливали (требование модерации Яндекс.Игр). Теперь пауза при любой из шести модалок; онбординг публикует `ui-store.onboardingOpen`. Тесты: `hooks/useYandexInit.test.tsx` (13).

## 6. Известные ограничения / что не сделано

- Закрытие по Escape есть только у `TextModal` (остальные модалки не закрываются по Escape) — отдельная задача.
- `importStl`: врезки (`earnActionToken`, `completeImportQuest`, `evaluateQuestsAfterMutation`) проверены только по коду — юнит-теста нет (нужен разбор STL-файла).
- Мутации `csgBoolean`, `mirrorSelected`, `alignSelected`, `resizeObject`, `applyFillet` и др. не имеют юнит-тестов на квесты (покрыты `addShape`, `addTextMesh`, `addRawMesh`, `saveToProject`, экспорт).
- Гейтинг 3D-текста в `App.tsx` (`handleAddText`, пропсы `LeftPanel`) и гейтинг палитры в `PropertiesPanel` остались в общих файлах.
- Живой smoke на SDK Яндекса не выполнен (шаг 1.3 плана).

## 7. Новые файлы и тесты

| Файл | Тесты |
|---|---|
| `components/EconomyPanel.tsx` | `components/EconomyPanel.test.tsx` (4) + существующий `PropertiesPanel.color.test.tsx` |
| `hooks/useYandexInit.ts` | `hooks/useYandexInit.test.tsx` (13) |
| `components/EconomyOverlays.tsx` | отдельных тестов нет (флаги модалок покрыты в `useYandexInit.test.tsx`) |
| `store/economy-integration.ts` | `store/document-store.test.ts` (+5) |
| `store/economy-types.ts` | типы (`tsc`) |
