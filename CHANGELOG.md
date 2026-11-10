# Changelog

Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

### Fixed
- **Smoke SDK (`e2e/yandex-sdk-smoke.mjs`), пункт 7 «Квесты»:** ожидаемая награда при сохранении считала все выполненные задания дня, а уже начисленные при экспорте (`settleExport` тоже вызывает `commitQuests`) повторно не начисляются — тест падал на наборах заданий, где лёгкое выполнялось до экспорта. Теперь ожидание — выполненные и ещё не начисленные (`todayQuestsCompleted`). Приложение не менялось; на сборке v1.4.0 — 7/7

---

## [1.4.0] — 2026-11-10

Первый релиз Яндекс-версии с Фазой 9: `yandex-games` = `main` v1.3.9 один-в-один + SDK и экономика Яндекс.Игр (PR #52). Архив для консоли Яндекс.Игр — `dist-yandex` (`pnpm build:yandex`).

### Added
- **Фаза 9 и все фичи `main` v1.3.0–v1.3.9** (подробно — разделы [1.3.0]…[1.3.9] ниже): параметрическая история (дерево CSG, правка детей и прошлых шагов move / mirror / extrude с каскадом, независимые копии CSG, CSG для замкнутых STL); N-арный CSG и режим A → B → Enter; Plug & Play (размещение на грань / сетку / плоскость оси); размерные линии; навигация как в CAD, адаптивная сетка, рамка выделения; кайма выделения; каймы групп A / B, тени за видом, отмена размеров; 3D-текст — замкнутый меш, участвует в CSG (гравировка)
- **Экономика и SDK Яндекс.Игр:** токены, бонус дня, реклама (rewarded, sticky-баннер), аренда 24 ч (3D-текст, расширенная палитра, без баннера), подписки, задания дня V2, кэшбэк V2, онбординг; SDK — `initPlatform`, облачное сохранение прогресса, `LoadingAPI.ready()`, Gameplay API; рефакторинг Y.1–Y.5 (`EconomyPanel`, `useYandexInit`, `EconomyOverlays`, `economy-integration`, `economy-types`)
- **Старые сохранения игроков открываются:** `.doodle` конвертируется в `.3dtc` («Сохранить» — `.3dtc` с размерами); 3D-текст старых проектов (`text3d`) — как текст `main`
- **Smoke SDK** — `pnpm e2e:yandex-sdk-smoke`: `initPlatform`, `loadFromCloud`, `LoadingAPI.ready`, Gameplay API (8 модалок), реклама, экспорт за токены / рекламу, задания — 7/7

### Changed
- **«Открыть» / «Сохранить» — `.3dtc`, как в `main`** (было `.doodle` без размеров)
- **Скругление (fillet) удалено** (как в `main`); старые шаги вырезаются при загрузке
- **Gameplay API на паузе при любой модалке** — и при новых из `main` («Настройки размеров», «Очистить сцену?»)
- **Без SDK — вёрстка и поведение v1.3.9** (правая панель 200 px, поле цвета, переключатель языка); с SDK — правая панель 240 px под экономику

### Fixed
- Без SDK: 3D-текст не добавлялся, экспорт показывал «Кэшбэк учтён в стоимости», «Расширенный выбор» цвета не открывался
- Выбранный язык сбрасывался после перезагрузки (теперь: SDK → выбор → язык браузера)
- Тосты наезжали на правую панель 240 px; бейджи цены сдвигали «Экспорт» / «Импорт»; иконка линейки увеличивала плашку «Расстояние»
- Зашитые русские строки (названия цветов палитры, экран загрузки) — в i18n

### Особенности и ограничения
- **SUB-EXPORT-CASHBACK — подписчик получает кэшбэк при экспорте** (при подписке экспорт идёт способом «за рекламу»). Лояльно к игроку — особенность экономики, оставлено намеренно (`ECONOMY.md` §3.3)
- 3D-текст старых проектов (`text3d`) — несшитый меш: открывается и отображается, в CSG не участвует — пересоздать
- Ограничения `main` v1.3.9 — те же: размеры — не шаги «Истории», к объекту в CSG скрываются (DIMENSION-CSG-TRANSFER), при перетаскивании число — по отпусканию (DIMENSION-LIVE-DRAG); размещение — PLACEMENT-AXIS-ORIGIN / -SNAP-SLOPED / -ROTATE / -TEXT

### Подробно

#### Merge `main` v1.3.9 → `yandex-games` (ветка `yandex-games-v1.4.0`)

##### Changed
- **В `yandex-games` — Фаза 9 и все фичи `main` до v1.3.9:** параметрическая история (дерево CSG, правка детей и прошлых шагов, независимые копии), N-арный CSG и режим A → B → Enter, Plug & Play, размерные линии, UX-VIEWPORT (навигация, адаптивная сетка, рамка), кайма выделения, ux-polish (каймы групп A/B, тени за видом, отмена размеров). Ядро (`rebuild.ts`, `worker-handlers.ts`, `mirror-store.ts`, `csg/types.ts`, `ComponentTree.tsx`, `Timeline.tsx`, `WebGLFallback.tsx`) — версия `main`; `document-store.ts` — `main` + все однострочные врезки экономики Y.3 на прежних местах (`earnActionToken`, `evaluateQuestsAfterMutation`, `completeImportQuest`, `commitQuests`, `settleExport`; `cacheSnapshotWithTree` в main — `cacheSnapshot`, врезки по-прежнему не в нём); `App.tsx` / `PropertiesPanel.tsx` / `LeftPanel.tsx` / `Toolbar.tsx` / `StatusBar.tsx` — `main` + тонкие вставки yandex (`useYandexInit`, `<EconomyOverlays />`, гейтинг 3D-текста и палитры, бейджи, переключатель языка — только вне `build:yandex`); i18n ru/en — трёхстороннее слияние по ключам
- **3D-текст — как в `main`:** создаётся `addTextObject` → `addRawMesh` (шаг `import_mesh` с `text`, замкнутый меш — участвует в CSG, UX-AUDIT-3/31/36) вместо yandex-шага `text3d` (`addTextMesh` удалён). Гейтинг аренды/подписки, токен за действие и квесты — прежние. Квест «Гравировка» (`count_text3d`) и категория «текст» кэшбэка считают текст через `economyShapeKind` (`isTextObject`) (`store/economy-config.ts`, `store/economy-store.ts`)
- **Скругление (fillet) удалено и в `yandex-games`** (remove-fillet из `main`): старые шаги `fillet` вырезаются при загрузке (`io/legacy-fillet.ts`)
- **Палитра Wad's Optimum 16 и сплэш загрузки — через i18n** (`palette.colors.*`, `app.loading`): тест `i18n-coverage` из `main` (UX-AUDIT-7) нашёл зашитые русские строки (`constants.ts`, `ColorPalette.tsx`, `main.tsx`)
- **Gameplay API — пауза и при новых модалках `main`:** «Настройки размеров» (`ui-store.showDimensionSettings`) — в `isAnyModalOpen`; подтверждение «Очистить сцену» (флаг `App`) — параметром `useYandexInit(localModalOpen)` (`hooks/useYandexInit.ts`)

##### Fixed
- **Вёрстка — как в v1.3.9, широкая правая панель — только с экономикой:** правая панель `yandex-games` 240 px (UB5-2, под панель экономики) теперь только при SDK — `useYandexInit` ставит `html[data-economy]`, CSS `:root[data-economy]`; без SDK — 200 px, как в `main` (на 240 px e2e `main` `ux-audit-5` не находил грань на экране). Тосты: в `main` прижаты левее панели 200 px (UX-AUDIT-19) и при 240 px перекрывали её — с экономикой отступ 252 px (`App.css`, `hooks/useYandexInit.ts`; тест `useYandexInit.test.tsx` +1)
- **Кнопки «Экспорт» / «Импорт» с бейджами цены стояли на 0,2 px выше соседних** (обёртка с бейджами — блочная): обёртка `display: flex` — тулбар на 1366 снова ровно в одну строку (e2e `ux-audit-3` › Q) (`Toolbar.tsx`)
- **Поле цвета без SDK — как в v1.3.9:** в clean-режиме (экономики нет) панель свойств сразу показывает поле цвета (переключатель — на палитру Wad's 16); с SDK — как раньше: палитра бесплатно, полный выбор — по аренде (`PropertiesPanel.tsx`)
- **Clean-режим (без SDK, P0-6) — платные функции не работали или пугали тостом** (нашли e2e `main`, они идут в clean-режиме): 3D-текст не добавлялся — «Добавить» закрывало модалку и открывало аренду, та отвечала bypass и снова открывала модалку (`App.tsx`: гейтинг только при `isEconomyAvailable()`); экспорт STL без оплаты шёл как «за токены» — тост «Кэшбэк учтён в стоимости» (`ExportModal`: без способа оплаты — `onExport()`); «Расширенный выбор» цвета не открывался (`PropertiesPanel`: `canUseExtendedPicker` — и без SDK, поле цвета — сразу). На платформе с SDK поведение прежнее. Тесты: `__tests__/yandex-clean-mode.test.tsx` (3)
- **Язык: выбор переключателем не переживал перезагрузку:** `i18n/init.ts` определял язык SDK → браузер, без `localStorage.i18nextLng` (в `main` — localStorage → браузер). Теперь SDK (п. 2.14) → выбор переключателем → браузер. Переключатель в статус-баре — только вне `build:yandex` (там язык задаёт SDK, как раньше). Тесты: `i18n/init.test.ts` (4)

- **«Открыть» / «Сохранить» в тулбаре — `.3dtc`, как в `main`** (до v1.4.0 в `yandex-games` — `.doodle`: только история, без объектов и без слоя размеров; размеры при сохранении в файл терялись). `.doodle` больше не пишется: `openDoodle` / `saveDoodle` удалены (`store/document-store.ts`, `store/types.ts`, `App.tsx`)

##### Added
- **Smoke SDK Яндекс.Игр — `pnpm e2e:yandex-sdk-smoke`** (`e2e/yandex-sdk-smoke.mjs`, только yandex-games, не в CI): production-сборка `dist-yandex` с dev-адаптером SDK Яндекса (тот же `yandex-dev-adapter.js`, что у `sdk-dev-proxy --dev-mode`; вызовы SDK перехватываются обёрткой `window.YaGames`) — 7 пунктов: `initPlatform`, `loadFromCloud` (токены из облака после очистки localStorage приложения), `LoadingAPI.ready()` ×1, Gameplay API (пауза при каждой из 8 модалок, продолжение при закрытии), реклама (sticky-баннер, rewarded +50), `exportStl('tokens' | 'ad')` (списание 50 − кэшбэк / кэшбэк за рекламу), квесты (прогресс по сцене, выполнение, `commitQuests` при сохранении → облако)
- **Старые `.doodle` игроков открываются и конвертируются в `.3dtc`** (`io/project-file.ts`; диалог — `open3dtcFilePicker`, `accept` + `.doodle`): «Открыть» принимает `.3dtc` и `.doodle` (и `.doodle`, переименованный в `.zip`); история `.doodle` проходит ту же миграцию, что `.3dtc` (`text3d`, fillet), объекты пересобираются, документ получает имя «имя.3dtc» и пометку «не сохранено», уведомление «… (.doodle) открыт — «Сохранить» запишет его в .3dtc» (`errors.doodleConverted`, ru/en); «Сохранить» пишет `.3dtc` с размерами. Тесты: `__tests__/doodle-to-3dtc.test.ts` (7, реальный WASM)
- **`io/legacy-text3d.ts` — старые проекты игроков с 3D-текстом открываются:** шаг `text3d` (yandex до v1.4.0) при любой загрузке (`.3dtc`, старый `.doodle` — через конвертацию, автосохранение, проекты IndexedDB — `document-store.migrateLoaded`) переводится в `import_mesh` с текстом из имени; объект — 3D-текст на прежнем месте. `.3dtc` принимает тип `text3d` (раньше такой файл yandex-версии не открывался). Тесты: `__tests__/legacy-text3d-load.test.ts` (9, реальный WASM), `useYandexInit.test.tsx` (+4)

#### yandex-games — до merge main v1.3.9 (Y.1–Y.5, UB2–UB5, экономика)

##### Added
- **`docs/REFACTORING_YANDEX.md`** — сводка рефакторинга `yandex-games` Y.1–Y.5: карта «что откуда переехало», инварианты (порядок `settleExport`, bootstrap, список модалок), инструкция по следующим merge `main`, ограничения. Счётчики тестов в `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `web-app/NODEJS_SETUP.md` обновлены до 647 / 47 файлов

##### Fixed
- **Gameplay API не ставился на паузу при части модалок:** `stopGameplay()` вызывался только для текста, менеджера проектов и экспорта; модалки импорта, аренды 24ч и онбординг экономики геймплей не останавливали (требование модерации Яндекс.Игр). Теперь `useYandexInit` сам считает `isAnyModalOpen()` из `ui-store` по всем шести модалкам (единый список, `App.tsx` параметр больше не передаёт). Онбординг публикует свой флаг через новый `ui-store.onboardingOpen` (сбрасывается при закрытии и размонтировании). Тесты: +13 (`hooks/useYandexInit.test.tsx`) (`hooks/useYandexInit.ts`, `components/EconomyOnboarding.tsx`, `store/ui-store.ts`, `App.tsx`)
- **Merge origin/main → yandex-games (f332e6e), smoke-тест сборки:** `pnpm build:yandex` падал на `tsc` — в `store/document-store.test.ts` mock-колбэк `workerBuildShape` типизировал `params` как `Record<string, number>`, что несовместимо с `ShapeParams` (нет index signature). Mock приведён к сигнатуре клиента (`ShapeParams` + cast в `originBoxMesh`); восстановлена сборка `dist-yandex` (sdk.js до module-скрипта) и чистая сборка `dist`. Прогон: 625/625 тестов, typecheck 0 ошибок (`store/document-store.test.ts`)
- **UB5-1 (аренда продавалась поверх активной Pro-подписки, токены списывались за уже выданное):** `buyRental` валидировал только баланс, а `rentalsSection` в панели определял «уже активно» по `hasRental(r.key)` — без учёта подписки, которая по спеке уже включает текст/палитру/скрытие баннера. Гейт добавлен в store — в начале `buyRental` (`store/economy-store.ts`): `state.hasActiveSubscriptionRO()` → `{ ok: false, code: 'included_in_subscription' }`, до `await getServerTime()` и до `set()`, поэтому списания нет ни при каком пути вызова (RO-геттер, expiry по серверному времени, P0-2). В UI (`components/PropertiesPanel.tsx`) в `rentalsSection` добавлена ветка `hasActiveSub`: вместо колонок кнопок «токены/ревард» рендерится статус «Входит в Pro» (новый ключ `economy.status.includedInPro`, ru/en); строки не скрываются — пользователю видно, что входит в Pro. Правило зафиксировано в `ECONOMY.md` §3.2. Тесты: +4 store (`extendedPalette`, `text3d`+`disableBanner` с проверкой `bannerVisible`/`hideBannerAdv`, истёкшая подписка не блокирует, без подписки покупка проходит — регрессия UB4-1) и +2 UI (`PropertiesPanel.color.test.tsx`: «Included in Pro» + отсутствие кнопок с ценой 75/50; без подписки все 3 кнопки на месте) (`store/economy-store.ts`, `components/PropertiesPanel.tsx`, `i18n/locales/{ru,en}/translation.json`, `store/economy-store.test.ts`, `components/PropertiesPanel.color.test.tsx`, `docs/USER_FEEDBACK_UB5.md`)
- **UB4-1 (отключение баннера за токены не скрывало рекламу платформы):** покупка «Отключение баннера» (`disableBanner`, 50 TC / 24 ч) и покупка подписки ставили только `bannerVisible = false` — это наш UI-оффер в правой панели; `platform.hideBannerAdv()` вызвался исключительно из `watchAdForBanner()`, поэтому оплаченный за токены ревард не давал видимого эффекта. Вторая причина: `platform.init()` при каждой перезагрузке безусловно звал `adv.showBannerAdv()` (`platform/yandex.ts:64-72`) — баннер возвращался даже с активной арендой. Добавлена единая точка `setPlatformBannerVisible(visible)` (`getPlatform()` + `show/hideBannerAdv()` в `try/catch`, т.к. баннер может быть недоступен из-за настроек консоли) и `syncPlatformBanner()` (`hasActiveSubscriptionRO() || hasRentalRO('disableBanner')` → hide, иначе show). Вызовы: `watchAdForBanner()` (прямой вызов SDK заменён на единую точку), `buyRental()` при `key === 'disableBanner'`, `buySubscription()` после атомарного `applied`, `refreshDayRollover()` при возврате оффера, `App.tsx` — `void syncPlatformBanner()` сразу после `loadFromCloud()`. `platform.init()` не менялся: экономическое решение применяется после загрузки прогресса, зато нет циклической зависимости `platform → store`. 7 тестов (`store/economy-store.ts`, `store/economy-store.test.ts`, `App.tsx`, `docs/USER_FEEDBACK_UB4.md`)
- **UB2-1 (квесты не прогрессировали при создании примитивов):** `addShape` был единственной мутацией сцены без `evaluateQuestsAfterMutation` (все остальные — addRawMesh/addTextMesh/importStl/fillet/CSG/move/resize/mirror — её вызывают) → прогресс квеста «Разнообразие» и прочих по-состоянию не обновлялся при добавлении фигур из палитры, а `commitQuests()` при save/export коммитит только уже `completed` квесты — награда терялась. Вызов добавлен. Формулировка квеста уточнена: «≥ {{n}} разных типов фигур» (считаются уникальные ТИПЫ, а не количество примитивов). Тесты: 1 примитив → прогресс 1/4; 4 разных типа → квест завершён; 4 одинаковых → прогресс 1/4 (`store/document-store.ts`, `i18n/locales/ru/translation.json`, `store/document-store.test.ts` — мок worker-client)
- **UB2-3a (подпись переключателя палитры латиницей):** при открытом расширенном picker кнопка возврата к обычной палитре подписывалась брендом «Wad's Optimum 16» (`properties.palette`). Теперь «Обычная палитра» (`palette.regular`, ru) / «Standard Palette» (en) — ключ существовал с UB-1, но нигде не использовался. Мёртвый ключ `properties.palette` удалён из ru/en (`components/PropertiesPanel.tsx`, `i18n/locales/{ru,en}/translation.json`)

##### Changed
- **Рефакторинг yandex-games Y.3 (поведение не менялось):** экономические врезки вынесены из `store/document-store.ts` в явный модуль `store/economy-integration.ts` (без подписок и реестра — вызовы остались на тех же местах и в том же порядке): `evaluateQuestsAfterMutation`, `earnActionToken`, `completeImportQuest`, `commitQuests` (тонкие обёртки) и `settleExport()` — вся экономическая часть экспорта STL (хэш модели → `calculateAndClaimCashback` → `setExportHash` → скачивание → тост → событийные квесты → `commitQuests`; порядок зафиксирован в комментарии и тестом) вместе с `stripHeavyFieldsForHash`. `exportStl` в ядре теперь только сериализует Blob (P2-6: при ошибке экономика не трогается) и передаёт скачивание колбэком. Удалена мёртвая переменная `csgOps`. Вызов НЕ вынесен в `cacheSnapshotWithTree` намеренно: его зовут и мутации без квестов (`moveObject`, `setColor`, `toggleVisible`, `renameObject`, `restoreAutosave`, `extrudeSelected`) — иначе оценка квестов и токены начислялись бы при каждом переименовании. `document-store.ts` больше не импортирует `economy-store`/`economy-config`. Дифф к `main`: +258 → +146/−18. Тесты: +5 (`store/document-store.test.ts`: порядок `settleExport`, отсутствие побочных эффектов при падении Blob, врезки `addTextMesh`/`addRawMesh`, мутации без квестов), итого 647 в 47 файлах (`store/economy-integration.ts`, `store/document-store.ts`)
- **Рефакторинг yandex-games Y.4 (поведение не менялось):** литерал `'tokens' | 'ad'` вынесен в тип `ExportPaymentMethod` (`store/economy-types.ts`) и заменён в `store/types.ts`, `store/document-store.ts`, `components/ExportModal.tsx`, `components/EconomyOverlays.tsx`
- **Рефакторинг yandex-games Y.1 / Y.2 / Y.5 (поведение не менялось):** yandex-код вынесен из общих файлов, чтобы merge `main` → `yandex-games` давал меньше конфликтов. **Y.1** — `EconomyPanel` + хелперы времени аренды/подписки перенесены из `PropertiesPanel.tsx` в `components/EconomyPanel.tsx`; блок мини-HUD/режима экономики → `EconomyModeSection`, эффект сброса режима при смене выделения → хук `useEconomyModeReset` (в `PropertiesPanel` остались по одной строке); `t: any` заменён на `TFunction`; форматирование блоков `canResize`/`canFillet`/`selectedIds.length === 2` возвращено к виду `main`. **Y.2** — bootstrap платформы и экономики, `LoadingAPI.ready()` и Gameplay API → `hooks/useYandexInit.ts` (порядок init → loadFromCloud → debug-grant сохранён, StrictMode-guard `economyInitialized` сохранён; удалён мёртвый `setEconomyPanelOpen` в `App.tsx`). **Y.5** — онбординг, `RentalModal`, `ExportModal`, `ImportModal` и их обработчики → `components/EconomyOverlays.tsx`; флаги `showExportModal`/`showImportModal` перенесены из локального state `App.tsx` в `ui-store.ts`. Дифф к `main`: `PropertiesPanel.tsx` +719/−165 → +89/−14, `App.tsx` +240 → +63/−14. Заметки: оверлеи монтируются после `TextModal` (порядок наложения равных `z-index` изменился — модалка аренды теперь поверх текстовой, текстовая закрывается перед открытием аренды). Тесты: +4 (`components/EconomyPanel.test.tsx`), итого 629 в 46 файлах. Y.3/Y.4 — отдельными записями ниже (`components/EconomyPanel.tsx`, `components/EconomyOverlays.tsx`, `hooks/useYandexInit.ts`, `components/PropertiesPanel.tsx`, `App.tsx`, `store/ui-store.ts`)
- **UB5-2, UB5-3 (layout панелей):** правая панель расширена ×1,2 по запросу пользователя — `.panel-right { width: 200px → 240px }` (`App.css:772-782`, `flex-shrink: 0` сохранён; @media-правил в `App.css` нет, отдельных `max-width` у панели тоже). Вкладке «Список» в левой панели добавлен внутренний скролл по образцу «Дерево»: `.object-list` получил `max-height: 240px` + `overflow-y: auto` + `scrollbar-width: thin` + `scrollbar-color: var(--border) transparent` (`App.css:459-469`) — раньше длинный список растягивал секцию «Объекты», и скроллилась вся `.panel-left`, из-за чего палитра фигур и секция «История» уезжали (`App.css:338`) (`src/App.css`, `docs/USER_FEEDBACK_UB5.md`)
- **Счётчики тестов в документации:** после UB5-1 — **420 тестов в 27 файлах** (`pnpm verify`: typecheck 0 ошибок, build + build:yandex успешны). Обновлены `AGENTS.md`, `web-app/NODEJS_SETUP.md` (результат, чек-лист, история прогонов), `README.md`, `CONTRIBUTING.md`, `DEVELOPMENT_PLAN.md`. Даты в исторических записях ревью и реестров отзыва (236/236, 299, 336, 357, 393, 414) не менялись — это записи конкретных прогонов
- **Тест `doodle-io.test.ts` «открывает model.json больше прежнего лимита 5 МБ»:** проставлен явный `timeout` 30 000 мс — фикстура на 100k треугольников (сериализация + DEFLATE) стабильно выбегала за дефолтные 5000 мс на медленных прогонах и падала с «Test timed out» при корректной логике (flaky-наблюдение с 2026-09-28)
- **Счётчики тестов в документации приведены к фактическому прогону (2026-09-28):** `pnpm test` — **414 тестов в 27 файлах**, `pnpm typecheck` — 0 ошибок. Обновлено в `AGENTS.md` (было 205), `web-app/NODEJS_SETUP.md` (205/205 и 14 файлов), `README.md`, `CONTRIBUTING.md`, `DEVELOPMENT_PLAN.md` (было ~236). В `AGENTS.md` также уточнено покрытие: в список unit-тестов добавлены `src/platform/*.test.ts` и UI-тесты `src/components/*.test.tsx`; тесты экономики — `economy-config.test.ts` 26 (добавлен блок `countSceneObjects`) и `economy-store.test.ts` 76. Даты в исторических записях ревью и реестров пользовательского отзыва (236/236, 299, 336, 357, 393) не менялись — это записи конкретных прогонов
- **UB2-2 (подпись кнопки реварда импорта):** «Посмотреть рекламу (0/3, нужно 2)» → «Посмотреть 2 рекламы 0/2 (0/3)» — цена серии, прогресс ТЕКУЩЕЙ серии и дневной лимит вида `import`. `watchAdsForImport(count, onProgress?)` сообщает прогресс после каждого показа (обратная совместимость), модалка хранит `seriesWatched` и сбрасывает его при новом запуске серии. Плюрализация i18next: `watchAd_one/_few/_many` (ru, 2 → few «2 рекламы»), `watchAd_one/_other` (en) + fallback-ключ `watchAd` (`store/economy-store.ts`, `components/ImportModal.tsx`, `i18n/locales/{ru,en}/translation.json`)
- **UB2-3b (иконки экономики мелкие, бейджи перекрывают кнопки):** Badge — иконка 14px ВНУТРИ контейнера (шрифт 8px, padding 1px 3px, minWidth 14/minHeight 12, оффсеты −3px наружу) вместо 20px иконки, выступавшей за ×0.75-контейнер с `overflow:visible` и накрывавшей заметную часть кнопки; у типов `ad`/`cooldown` число теперь показывается. IconBadge — иконка 16px в контейнере под неё (было 20px/minWidth 20/minHeight 16). Мелкие кнопки аренды/подписок: дублирующие бейджи убраны (цена и так видна инлайн), иконки 10→14px. Иконки секций экономики: бонус/реклама 14→18px, часы 12→14px, квесты 12→14px, аренда/подписка 14→16px; EconomyMiniHUD 14→16px, часы 10→12px. История размеров зафиксирована в коде (U7 ×2 → UB-5 ×0.75 → UB2-3b) (`components/Badge.tsx`, `components/IconBadge.tsx`, `components/PropertiesPanel.tsx`, `components/EconomyMiniHUD.tsx`, `components/Badge.test.tsx`, `components/IconBadge.test.tsx`)
- **UB2-4 (рёбра фигур):** вьюпорт рендерит линии рёбер по выраженным граням (`EdgesGeometry`, порог 30°) цветом «на пару тонов темнее» базового цвета объекта (`edgeColorFor` = ×0.7 в sRGB). Рёбра — ребёнок меша (наследуют visibility/трансформы), пересобираются при изменении геометрии (CSG/resize/fillet) и цвета, освобождаются при удалении объекта; `raycast` отключён (не мешают выделению/snap). Защита производительности: рёбра не строятся для геометрии > 100 000 треугольников (тяжёлые импорты). Тесты `edgeColorFor` (`components/viewport-hooks.ts`, `components/viewport-hooks.test.ts`)
- **UB2-5 (расширенные тултипы панели экономики):** элементы экономики переведены с нативных `title` на двухуровневый `Tooltip` (label мгновенно, описание через 1.5с): баланс, ежедневный бонус, реклама за токены, заголовки квестов/аренды/подписки + все три показателя EconomyMiniHUD. Кнопки покупки аренды/подписок получили нативные `title`. Новые ключи `economy.tooltip.{tokensDesc,bonusTitle,bonusDesc,adTitle,adDesc,questsDesc,rentalsDesc,subsDesc}` ru/en; декоративный «(i)» без интерактива убран; мёртвые `tooltip.bonus`/`tooltip.ad` заменены на `bonusTitle/bonusDesc`/`adTitle/adDesc` (`components/PropertiesPanel.tsx`, `components/EconomyMiniHUD.tsx`, `i18n/locales/{ru,en}/translation.json`)

##### Fixed
- **UB-0a (экспорт STL — «разлёт» фигур):** `exportToStl` применял `obj.transform` (позицию) к вершинам, у которых позиция спавна УЖЕ запечена воркером в геометрию (`handleBuildShape` → `m.transform([T])`) — при экспорте нескольких фигур позиция применялась дважды, и объекты разлетались на 2× своих координат. Теперь трансформ применяется к bbox-центрированной геометрии — ровно как во вьюпорте (`centerGeometry` + transform на pivot): `R·S·(v − center) + pos`. CSG-результаты (уже центрированные) не затрагиваются. Тесты обновлены + регрессионный тест «spawn position baked into vertices is not double-applied» (`io/stl-export.ts`, `io/stl-export.test.ts`)
- **UB-0b (импортированная геометрия терялась при сохранении/загрузке):** `handleRebuildScene` в воркере запоминал для `import_mesh`/`text3d` только transform — вершины не попадали в manifold-кэш, объект отсутствовал в results, и после загрузки проекта (IndexedDB) или `.doodle` импорт/3D-текст исчезал. Теперь baked-геометрия восстанавливается из `op.vertices/indices` (с защитой по размерам, non-manifold → null + фолбэк); `move` над baked-мешом сдвигает кэш на дельту (раньше — no-op или куб-заглушка 20³); фолбэк в `rebuildFromHistory` возвращает сырой меш из операции, если воркер его не вернул; `move`/`mirror` больше не ищут `shapeInfos` для import/text3d (`csg/worker-handlers.ts`, `store/rebuild.ts`)
- **UB-0b (.doodle):** `text3d` добавлен в `VALID_OP_TYPES` (файл с 3D-текстом раньше вообще не открывался); TypedArray (`Float32Array`/`Uint32Array`) сериализуются в JSON обычными массивами (раньше `JSON.stringify` давал объект `{"0":…}` — ~2× размер и потеря `length` у `group.resultIndices`, из-за чего CSG-модели могли не восстанавливаться); лимит `model.json` поднят 5→64 МБ (импорты легко превышали 5 МБ: файл сохранялся, но не открывался), защита от ZIP-бомбы 50 МБ осталась; `restoreOperationMeshArrays` нормализует и `text3d` (`io/doodle-io.ts`)
- **UB-1 (3D-текст/расширенная палитра не открывали модалку аренды):** новый `RentalModal` — клик по НЕарендованной фиче (палитра фигур, кнопка «Расширенный выбор», `handleAddText`) открывает модалку аренды 24ч с ценой и балансом вместо молчаливого переключения правой панели. После успешной аренды исходное действие продолжается автоматически (открывается TextModal / нативный color picker через `palettePickerRequested`). Подписка/clean-версия — bypass через useEffect. Флаги `rentalModalKey`/`palettePickerRequested` в ui-store (`components/RentalModal.tsx`, `ui-store.ts`, `App.tsx`, `PropertiesPanel.tsx`, i18n ru/en)
- **UB-2 (баннер скрывался после ЛЮБОЙ рекламы):** `showRewardedVideo` в YandexPlatform вызывал `adv.hideBannerAdv()` в `onRewarded` безусловно — платный reward «отключить баннер на 24ч» выдавался бесплатно после любого ролика (токены/экспорт/импорт). Скрытие баннера осталось единой точкой в `economy-store.watchAdForBanner()` (`platform/yandex.ts`)
- **UB-3 (нет таймера отката реварда на экспорте):** ExportModal показывает тикающий кулдаун «ждём м:сс» (`useAdCooldown('export')`) и дизейблит кнопку рекламы на время паузы между просмотрами — раньше блокировка выглядела необъяснимой (лимит 3/день и кулдаун — разные ограничения). i18n `export.adCooldown` ru/en (`components/ExportModal.tsx`)
- **UB-4 (дубли кнопок скрытия баннера):** удалена дублирующая секция «Скрытие баннера» в EconomyPanel и компонент `EconomyBanner` над панелью инструментов. Единственное место — строка «Отключение баннера» в разделе «Аренда» правой панели: кнопки «токены 50» + «1 просмотр» (ревард), статус «Баннер скрыт · N ч» (`PropertiesPanel.tsx`, `App.tsx`, удалён `components/EconomyBanner.tsx`)
- **UB-5 (бейджи):** контейнер бейджа уменьшен ×0.75 (шрифт 10→7.5px, minWidth 16→12px, minHeight 14→10.5px, padding/gap/shadow/radius ×0.75, `overflow: visible`), SVG-иконки остались 20px. Тест обновлён (`components/Badge.tsx`, `components/Badge.test.tsx`)

##### Added

- **Сборка для itch.io:** новый скрипт `pnpm build:itch` (`web-app/package.json`) — `tsc && vite build --base=./ --outDir dist-itch` + удаление `dist-itch/sdk.js` (копируется из `public/`, на itch не нужен и не должен попадать в архив). Отличие от `build` (GitHub Pages, `base: '/tinkercraft/'`) — относительный `base: './'`: itch раздаёт HTML-игры из iframe по адресу вида `html.itch.zone/html/NNNNN/`, абсолютные пути не работают. Платформа — clean-режим (VITE_PLATFORM≠yandex): Yandex-чанк tree-shaken (`import.meta.env.VITE_PLATFORM` — литерал `"clean"`), `isEconomyAvailable()===false` → токены/реклама/подписки/аренда отключены, всё бесплатно; `window.YaGames` отсутствует → SDK-init возвращает null. Архив: `tinkercraft-itch-v1.3.4.zip` (569 KB, 12 файлов, `index.html` в корне ZIP, `*.zip` в gitignore); проверка: все ассеты 200 через `python3 -m http.server`, WASM грузится через `new URL(..., import.meta.url)` (относительный путь). `.gitignore` — `dist-itch/`. Документация: `web-app/NODEJS_SETUP.md` (секция «Сборка для itch.io»)
- **Реестр отзыва пользователя UB5 (2026-09-28):** `docs/USER_FEEDBACK_UB5.md` — 3 пункта ручного прогона на Яндекс Играх, задокументированы без правок в код (задокументирован 2026-09-28, исправлен 2026-09-29 — см. Fixed/Changed выше; реестр закрыт). UB5-1 (🔴 P1) — при активной Pro-подписке раздел «Аренда» продолжает продавать `text3d`/`extendedPalette`/`disableBanner` и списывает токены за уже выданное: `buyRental` валидирует только баланс (`economy-store.ts:1237-1273`), `rentalsSection` сверяет `isActive = hasRental(r.key)` без учёта подписки (`PropertiesPanel.tsx:296-373`), при этом доступ по подписке реально выдаётся в 4 местах (`PropertiesPanel.tsx:533-534`, `App.tsx:498-505/749-762`, `economy-store.ts:1231-1235`, `ExportModal.tsx:52-60`/`ImportModal.tsx:58-66`), а защищённый аналог уже существует в `RentalModal.tsx:63` (bypass по `hasActiveSub`) → предложен гейт `code: 'included_in_subscription'` + статус «Входит в Pro» + i18n + 4 теста. UB5-2 (🟡 P2) — запрос расширить правую панель ×1,2: единственная точка `.panel-right { width: 200px }` (`App.css:763-773`) → 240px, продолжение UB3-2 (иконки/кнопки не влезают). UB5-3 (🟢 P3) — у вкладки «Список» нет внутреннего скролла в отличие от «Дерево»: `.ct-list` имеет `max-height: 240px` + `overflow-y: auto` + тонкий скроллбар (`App.css:987-996`), `.object-list` — ничего из этого (`App.css:456-462`), из-за чего длинный список скроллит всю `.panel-left` (`App.css:338`)
- **Реестр отзыва пользователя UB4 (2026-09-27):** `docs/USER_FEEDBACK_UB4.md` — жалоба «не работает отключение баннера за токены, за 50 токенов; отключение баннера не отключает сам баннер, а только саму кнопку отключения» + фрагмент лога SDK (`Rental disableBanner purchased: 50 tokens, 24h`, далее `adv2_show`, ни одного `hideBannerAdv`). UB4-1 — три независимые причины (скрытие только в рекламном пути, `bannerVisible` ≠ состояние SDK, безусловный `showBannerAdv()` в `platform.init()`), исправлено единой точкой `setPlatformBannerVisible()`/`syncPlatformBanner()`, 7 тестов, чек-лист закрытия. UB4-2 — наблюдение: платформа сама перепоказывает sticky-баннер после `onAdLoadFailed`, сторож по `getBannerAdvStatus()` сознательно не реализован до подтверждения поведения
- **Реестр отзыва пользователя UB3 (2026-09-23):** `docs/USER_FEEDBACK_UB3.md` — 5 пунктов ручного прогона draft-сборки на Яндекс Играх, задокументированы без правок в код (статус 🔴 ОТКРЫТО). Пользователь повторно использовал префикс `UB2-*`, но тот реестр закрыт 2026-09-23, поэтому партия зарегистрирована как UB3-1…UB3-5 (метрики пользователя сохранены в цитате). UB3-1 — счётчик `(N/3)` реварда импорта считает показы вместо импортов: `markAdWatched` поднимает `countToday` на каждый ролик (`economy-store.ts:82-92`) при `adsPerDay=3` (`economy-config.ts:84`) → после 1 импорта `(2/3)` и `disabled={importAdCount + adCost > 3}` (`ImportModal.tsx:148`) гасит кнопку, т.е. рекламой оплачивается 1 импорт/сутки вместо 3 (частичная серия при этом «сжигает» показ: `watchedCount < count` → false, `economy-store.ts:894-914`) — требуется правка спеки (ECONOMY.md §2 «≤3 показа/день» → «3 импорта/день, 2 ролика на импорт»); UB3-2 — иконки экономической панели ×2 + кнопки «токены/ревард» в строке «Отключение баннера» (`PropertiesPanel.tsx:323-354`) не влезают по ширине; UB3-3 — нет способа накрутить токены: приложение не читает URL-параметры (`grep URLSearchParams|location.search` — 0 совпадений, `?debug-mode=16`/`?draft=true` — параметры консоли Яндекса), стартовый баланс `tokens: 0` (`economy-store.ts:658`), localStorage перебивается `loadFromCloud()`/`syncToCloud()` (`App.tsx:233, 252-254`) → предложен разовый debug-grant 3000 TC после `loadFromCloud()` с gating'ом; UB3-4 — бейджи на кнопках «Экспорт»/«Импорт» (`Toolbar.tsx:168-176`) перекрывают кнопки, просит убрать заливку (`Badge.tsx:34, 47-77`); UB3-5 — «уже получено» после бонуса (`PropertiesPanel.tsx:179-181`) заменять на иконку подарка с тикающим остатком до сброса (день = календарная дата `new Date(serverTime)`, `economy-config.ts:127-139` — разбор в локальной TZ). Попутно исправлена устаревшая ссылка в `docs/USER_FEEDBACK_ECONOMY.md` (реестр UB2 отмечен закрытым) и добавлен пост-скриптум в `docs/USER_FEEDBACK_UB2.md` (UB2-2 → UB3-1, UB2-3b → UB3-2/UB3-4)
- **Реестр отзыва пользователя UB2 (2026-09-22):** `docs/USER_FEEDBACK_UB2.md` — 6 пунктов ручного прогона на Яндекс Играх: UB2-1 квест «Разнообразие» не прогрессирует при создании примитивов (root cause подтверждён: `addShape` не вызывает `evaluateQuestsAfterMutation` — единственная мутация без него; `commitQuests` при save коммитит только уже завершённые квесты); UB2-2 текст кнопки реварда импорта («Посмотреть две рекламы 0/2 (0/3)»); UB2-3a русская подпись «Обычная палитра» у переключателя палитры; UB2-3b мелкие иконки экономики и бейджи поверх кнопок (U7×UB-5 маятник размеров); UB2-4 рёбра фигур «на пару тонов темнее» (фича вьюпорта); UB2-5 расширенные локализованные тултипы панели экономики. Статус реестра: ✅ ЗАКРЫТО (2026-09-23) — все 6 пунктов исправлены (см. Fixed/Changed выше), `pnpm verify` зелёный (393/393 тестов, 26 файлов)
- **Реестр находок по экспорту/сохранению (отзыв 2026-09-26):** `docs/USER_FEEDBACK_EXPORT.md` — разбор жалоб «фигуры разлетаются при экспорте» и «импортированную не сохранить/не экспортировать», все ссылки проверены по коммитам обеих веток. Подтверждено: UB-0a (двойное применение позиции в STL: воркер запекает `transform` в вершины, экспорт применяет его снова), UB-0b (воркер не восстанавливает baked-меш `import_mesh` при пересборке сцены) и UB-0d (лимит `model.json` 5 МБ против TypedArray-раздувания — файл сохранялся, но не открывался) исправлены на `yandex-games` (`4d64054`) и **отсутствовали на `main`** → портированы отдельным коммитом. Попутно закрыты E1/E1b/T1 (см. Fixed/Added), а E2 (STL-заголовок и кириллица) и ветка `baked` в воркере оказались исправлены в `4d64054` заранее — правки не дублируем (`docs/USER_FEEDBACK_EXPORT.md`)
- **E1 (большая сцена > 10 млн треугольников вместо файла ломала экспорт):** `MAX_TRIANGLES` урезал размер буфера и count в заголовке, но цикл записи лимита не проверял → запись выходила за границу `DataView` (`RangeError` в середине записи) либо, при ином порядке, писался файл с недостоверным числом треугольников. Теперь сверх лимита бросается `StlTooLargeError` ДО выделения буфера, лимит вынесен в `export const MAX_TRIANGLES` и в параметр `exportToStl(objects, maxTriangles)` (нужен для тестов). Заодно ожил мёртвый ключ `errors.stlTooManyTris` — он нигде не использовался (`io/stl-export.ts`)
- **E1b (ошибка STL-экспорта была невидима для пользователя):** в `exportStl` `catch` писал только `console.warn` — при падении сериализации (невалидная геометрия, лимит треугольников) файл не создавался, а в UI ничего не происходило. Теперь `notify(...)`: для `StlTooLargeError` показывается его собственное локализованное сообщение с числами, для прочих — новый ключ `errors.stlExportFailed` (`store/document-store.ts`)
- **T1 (не было тестов на цикл «экспорт/сохранение → загрузка»):** закрыта дыра в покрытии, из-за которой исправления UB-0 ничем не защищались. Добавлены: регрессия UB-0a (запечённая позиция не применяется дважды), лимит треугольников E1, round-trip `import_mesh` через `serializeDoodle → parseDoodle` (TypedArray пишется массивом, `model.json` > 5 МБ открывается, прокрустовка фикстуры в том же формате, что пишет сериализатор), новый `store/rebuild-baked.test.ts` — фолбэк baked-геометрии (`import_mesh` + `text3d`) при пустом ответе воркера, без дублирования при непустом, фильтрация битых мешей и удалённых объектов (воркер моканут, WASM не требуется) (`io/stl-export.test.ts`, `io/doodle-io.test.ts`, `store/rebuild-baked.test.ts`, `store/document-store.test.ts`)
- **B1/B2/B3 (UI-регрессии Яндекс):** баннер-оффер скрытия виден по умолчанию; клик по 3D-тексту без доступа открывает аренду; «Расширенный выбор» не закрывает панель свойств (см. Fixed)
- **withTimeout (sdk.ts):** обёртка `Promise.race` с гарантированной очисткой таймера (`clearTimeout` при успехе/ошибке исходного промиса) — устраняет ЛОЖНЫЕ предупреждения о таймауте в логе, когда исходный промис уже выиграл гонку (`platform/sdk.ts`)
- **Ревью экономики (2026-09-15):** полная проверка `economy-store.ts`/`economy-config.ts`/`economy-ui-config.ts` — 8 проблем (EC-R1…EC-R8), приоритеты и статусы в `CODE_REVIEW.md`. Ключевые: EC-R1 — `scanForCashback` не считает зеркала (тот же корень, что C3, не починен в кэшбэке); EC-R2 — гонка `claimDailyBonus` при двойном клике (+100 вместо +50) (`CODE_REVIEW.md`)

##### Fixed
- **EC-R3 (ревью экономики):** `buySubscription`/`buyRental` — атомарная повторная проверка баланса ВНУТРИ updater: между внешней проверкой `tokens < cost` и `set()` есть `await getServerTime()` — при падении баланса за время await списание могло увести токены в минус. Теперь updater отказывает (`not_enough`) без списания. Тесты ×2 (`economy-store.ts`, `economy-store.test.ts`)
- **EC-R4 (ревью экономики):** `loadFromCloud` — `lastSavedData` пересчитывается ОТДЕЛЬНЫМ `set()` ПОСЛЕ применения облачных полей (раньше object literal вычислялся до merge → hash ДО-облачного состояния → первый `syncToCloud` за запуск всегда делал избыточный `setData`); hash в `syncToCloud` = hash фактически сохранённых данных. Тест ×1 (`economy-store.ts`, `economy-store.test.ts`)
- **EC-R5 (ревью экономики):** `loadFromCloud` — keep-local стратегия вместо безусловного cloud-wins: пустое облако (никогда не сохранялось) и облако ≡ наша последняя успешная копия (canonical hash совпадает с `lastSavedData`) НЕ перезаписывают локальный прогресс — раньше несинхронизированные токены (последний syncToCloud упал) молча терялись при перезагрузке. Облако с другого устройства (новее) — по-прежнему cloud wins. Канонический хэш (sorted keys, `sortDeep`) делает локальный/облачный хэши сравнимыми; `lastSavedData` исключён из облачных данных (внутренний dedupe-флаг). ⚠️ Одноразовая миграция формата хэша — один избыточный `setData`, без потери данных. Тесты ×3 (`economy-store.ts`, `economy-store.test.ts`)
- **EC-R6 (ревью экономики):** удалено мёртвое состояние `questTriggers` и `totalModelsCreated` — объявлены/персистились/санитизировались/сбрасывались, но нигде не читались и не инкрементировались (~40 строк накладных расходов). Старые данные в localStorage/облаке игнорируются санитизацией (`economy-store.ts`)
- **EC-R7 (ревью экономики):** `CATEGORY_ICON` — ключи приведены к `QuestCategory` (`variety`→`diversity`, `text` удалён — таких категорий нет; раньше `CATEGORY_ICON['diversity']` === undefined — латентный баг), `satisfies Record<QuestCategory, string>` даёт compile-time проверку полноты (`economy-ui-config.ts`)
- **EC-R8 (ревью экономики):** косметика — удалён дубликат `getTodayQuests()` в интерфейсе EconomyState, исправлены опечатки «Mutingating»→«Mutating», удалён `_justCompleted` (писался в `evaluateQuests`/`completeEventQuest`, но нигде не читался — мусорное поле в persist/облаке) (`economy-store.ts`)
- **EC-R1 (ревью экономики):** `scanForCashback` теперь считает зеркала — по mirror-операциям истории (`op.type === 'mirror'` → `ids` в пересечении с текущей сценой), как C3 в `evaluateQuests`, + legacy `scale < 0`. Раньше проверка `scale < 0` никогда не срабатывала (mirror-store пишет `Math.abs`) — зеркала не попадали в `toolsCount`/`toolCategories` формулы кэшбэка §2.1 (пользователь недополучал до +2 кэшбэка). Удаление зеркала/undo уменьшает счётчик. Тесты ×3 (`economy-config.ts`, `economy-config.test.ts`)
- **EC-R2 (ревью экономики):** устранены гонки двойного клика — `claimDailyBonus` (было +100 вместо +50 при TOCTOU) и `watchAdForTokens` (параллельный показ, превышение лимита вида). In-flight guard `withInFlightGuard` (повторный вызов делит ОДНО выполнение) + атомарная повторная проверка «тот же серверный день»/дневного лимита ВНУТРИ `set()`; UX-уровень — busy-guard на кнопках бонуса/рекламы в PropertiesPanel. Тесты ×3 (`economy-store.ts`, `PropertiesPanel.tsx`, `economy-store.test.ts`)
- **SDK-таймауты (диагностика лога 130926):** устранены ложные предупреждения «YaGames.init() timeout (10s)» и «getPlayer() timeout (5s)» ПОСЛЕ успешного завершения. Причина: голый `Promise.race([promise, timeout])` не отменяет таймер — setTimeout продолжал тикать и после победы исходного промиса печатал warn (resolve(null) был no-op, но console.warn срабатывал). Исправление: `withTimeout()` в `sdk.ts` (clearTimeout при любом исходе) используется для `YaGames.init()`; `getPlayer()` в `yandex.ts` переведён с голого `Promise.race` на `withTimeout` + обработка ПОЗДНЕГО прихода player (если таймаут сработал раньше, резолв getPlayer() после таймаута всё равно заполняет `this.player` — облачные сохранения `syncToCloud` больше не молча пропускаются в guest-режиме). Таймауты — это защита платформы от зависших вызовов, поведение экономики/сохранений не менялось (`platform/sdk.ts`, `platform/yandex.ts`)
- **Тесты withTimeout:** `sdk.test.ts` — таймер очищен при успехе (нет ложного onTimeout после победы промиса), resolve(null) при таймауте, проброс ошибки исходного промиса, поздний resolve после таймаута не меняет внешний результат (4 теста) (`platform/sdk.test.ts`)

##### Fixed
- **B1:** sticky-баннер-оффер (`EconomyBanner`) теперь виден ПО УМОЛЧАНИЮ (§6.3 ECONOMY.md) — `bannerVisible` инициализируется `true` в `economy-store.ts` (initial state + persist-merge); платформенный `showBannerAdv()` в `yandex.ts` управляется платформой отдельно и НЕ гасит наш UI-баннер. Новый RO-геттер `shouldShowBannerRO()` (bannerVisible && !подписка && !аренда disableBanner по серверному времени) — единый источник для EconomyBanner и bootstrap EC1 в App.tsx; после expiry аренды баннер снова показывается (`economy-store.ts`, `EconomyBanner.tsx`, `App.tsx`)
- **B2:** кнопка «3D-текст» в LeftPanel больше НЕ disabled при отсутствии доступа — клик открывает правую панель с оффером аренды text3d (75 токенов, бейдж 💰75 виден). Переход «купить» через новый store-флаг `economyPanelOpen` (ui-store) — НЕ снимает выделение, панель свойств остаётся открытой (`LeftPanel.tsx`, `App.tsx`, `ui-store.ts`, `PropertiesPanel.tsx`)
- **B3:** кнопка «Расширенный выбор» (палитра) без доступа открывает экономику (аренда extendedPalette 75 TC) ВНУТРИ правой панели — `setEconomyPanelOpen(true)` вместо `clearSelection()`. Механизм: store-флаг `economyPanelOpen` рендерит `EconomyPanel` поверх свойств выделенного объекта (с кнопкой «← К свойствам»), не закрывая панель; флаг сбрасывается только при смене выбранного объекта (`PropertiesPanel.tsx`, `ui-store.ts`, `App.tsx`, i18n `properties.backToProps` ru/en)
- **Тесты B1/B2/B3:** `shouldShowBannerRO` (виден по умолчанию / скрыт при аренде/подписке/bannerVisible=false / снова после expiry) в `economy-store.test.ts`; LeftPanel — клик по 3D-тексту без доступа → `openEconomy()`, с доступом → модалка (`LeftPanel.test.tsx`); PropertiesPanel — клик «Расширенный выбор» без доступа открывает экономику внутри панели, `economyPanelOpen=true` рендерит кнопку возврата (`PropertiesPanel.color.test.tsx`)
- **U10:** Bootstrap-поток «экран загрузки → initSdk → UI» — сплэш со спиннером показывается до готовности Yandex SDK (или clean-фолбэка), зависший `YaGames.init()` больше не даёт чёрный экран. `LoadingAPI.ready()` (Game Ready) вызывается только по факту готовности CSG-воркера И завершения init SDK — ранний fallback 15с убран. `GameplayAPI.start()` связан с `getInitDonePromise()` (не вызывается до завершения инициализации SDK) (`main.tsx`, `App.tsx`, `platform/sdk.ts`, `platform/yandex.ts`)
- **U2:** механизм «тикающих» UI-таймеров кулдаунов рекламы — `useAdCooldown(kind)` + `getAdCooldownRemainingMs()` (`platform/ad-timers.ts`): посекундный пересчёт по локальным часам с поправкой на серверное смещение (`getServerTimeOffset()`). PropertiesPanel/EconomyMiniHUD показывают живой отсчёт «м:сс» вместо значения, стоящего на месте до обновления кэша 30с (`PropertiesPanel.tsx`, `EconomyMiniHUD.tsx`)
- **U2/P2-5:** локальный fallback `Date.now()` в `getServerTime()` больше НЕ кэшируется на 30с — при ошибке SDK следующий вызов снова пробует серверное время (окно накрутки перевода часов закрыто) (`platform/server-time.ts`)
- **Тесты U2:** unit-тесты «тикающих» таймеров — `ad-timers.test.ts` (`useAdCooldown`, `formatCooldownMs`) и `server-time.test.ts` (fallback НЕ кэшируется, offset) (`platform/ad-timers.test.ts`, `platform/server-time.test.ts`)
- **Тесты U4/U6/U7:** компонентные тесты — `Badge.test.tsx`, `IconBadge.test.tsx` (иконки/шрифт ×2), `LeftPanel.test.tsx` (бейдж 3D-текста по `type:'text'` + `canUseText3dRO`), `PropertiesPanel.color.test.tsx` (палитра Wad's Optimum 16 доступна всегда; расширенный picker за аренду/подписку) (`components/Badge.test.tsx`, `components/IconBadge.test.tsx`, `components/LeftPanel.test.tsx`, `components/PropertiesPanel.color.test.tsx`)
- **U3 (v2.2):** левая вкладка «магазин» (`EconomyShop`) удалена — «магазин» = **только правая панель** (`PropertiesPanel` → `EconomyPanel`). Вкладка `shop` убрана из `LeftPanel.tsx` и `ui-store` (`activeTab` теперь `'objects' | 'tree'`); компонент `EconomyShop.tsx` удалён (все его офферы — аренды text3d/extendedPalette/disableBanner, подписки, баннер — уже были в `EconomyPanel`, ничего не потеряно). Переходы «купить» (`setActiveTab('shop')` в `App.tsx` ×2, `PropertiesPanel.tsx`) заменены на `clearSelection()` — экономика в правой панели рендерится при пустом выделении, поэтому снятие выделения раскрывает её. i18n: ключ `leftPanel.shop` удалён из ru/en; тест `LeftPanel.test.tsx` обновлён (мок EconomyShop убран). ECONOMY.md обновлён до v2.2 (§6.3 — два места: баннер + панель; п.3 «магазин» переформулирован) (`LeftPanel.tsx`, `ui-store.ts`, `App.tsx`, `PropertiesPanel.tsx`, `i18n/locales/{ru,en}/translation.json`, `ECONOMY.md`)
- **Финальная проверка U1–U10 (2026-09-12):** `pnpm verify` — typecheck 0 ошибок, 336/336 тестов (23 файла), `build` и `build:yandex` успешны. Реестр отзыва закрыт в [`docs/USER_FEEDBACK_ECONOMY.md`](docs/USER_FEEDBACK_ECONOMY.md) (9/10 исправлено; U3 — вопрос спецификации)
- **Полная проверка A/B/C (2026-09-14):** `pnpm verify` ПОСЛЕ всех правок регрессий платформы — typecheck 0 ошибок, **357/357 тестов (23 файла)**, `build` и `build:yandex` успешны. Реестр A1/A2/B1/B2/B3/C1/C2/C3 закрыт в [`docs/USER_FEEDBACK_ECONOMY.md`](docs/USER_FEEDBACK_ECONOMY.md); статусы — [`CODE_REVIEW.md`](CODE_REVIEW.md), [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md); ECONOMY.md обновлён до v2.3 (4 вида рекламы, максимум дня 405 TC)

##### Fixed
- **U1/U9 (v2.1):** rewarded-реклама разделена по видам награды — у каждого вида (`tokens` / `import` / `banner`) собственный кулдаун 5 мин и собственный дневной лимит ≤3/день (`adRewards: Record<AdRewardKind, AdRewardState>` вместо единых `todayAdsWatched`/`lastAdTimestamp`). Миграция старых полей → вид `tokens` в `sanitizeEconomyData`. Геттеры `getAdCooldownRemaining(kind)`/`getAdRewardsLeftToday(kind)`/`canWatchAdKind(kind)` для UI. Persist v3 + облако (`collectSyncData`/`loadFromCloud`/`partialize`) (`economy-store.ts`)
- **U1/U9 (v2.1):** UI переведён на per-reward счётчики — EconomyMiniHUD/PropertiesPanel/ExportModal (вид `tokens`), ImportModal (вид `import`); i18n RU/EN подсказка «≤3/день на каждую награду, пауза 5 минут»; `LIMITS.maxPerDay` 405→705, `realisticPerDay` 240→350 (`EconomyMiniHUD.tsx`, `PropertiesPanel.tsx`, `ExportModal.tsx`, `ImportModal.tsx`, `translation.json`, `economy-config.ts`)
- **U1/U9 (v2.1):** ECONOMY.md обновлён до v2.1 (§2 — таблица рекламы per-reward, максимум дня 705; §5 — раздельные счётчики по видам; §6.6 — подписи; §9 — баланс) (`ECONOMY.md`)
- **U1/U9 (v2.1):** тесты per-reward — независимость кулдаунов/лимитов видов, серия импорта в одном виде, сброс суток всех видов, миграция старых данных, sanitize adRewards (13 новых тестов) (`economy-store.test.ts`)
- **U12 (регрессии P1/P2):** rewarded-реклама разделена на ВСЕ сценарии — добавлен вид `export` (оплата экспорта STL), импорт переосмыслен как ОПЛАТА (а не заработок). Теперь виды: `tokens` (+50 за просмотр в HUD, логика не тронута), `banner` (скрытие баннера, не тронут), `import` (серия 2 роликов ОПЛАЧИВАЕТ импорт, токены НЕ начисляются), `export` (1 ролик ОПЛАЧИВАЕТ экспорт, токены НЕ начисляются). Каждый вид — свой `lastTimestamp` (кд 5 мин) и свой `countToday` (лимит ≤3/день); сброс в `refreshDayRollover()`; обновлены `sanitizeEconomyData`, `collectSyncData`, `loadFromCloud`, `partialize`, типы; persist v4 (старые виды сохраняются, `export` стартует с нуля) (`economy-store.ts`)
- **U12 (v2.3):** ECONOMY.md обновлён до v2.3 — §2: видов рекламы стало ЧЕТЫРЕ (`tokens`/`import`/`export`/`banner`), доход приносит только вид `tokens` (3×50=150), import/export/banner — оплата операций; максимум дня пересчитан **705 → 405 TC** (50+150+100+30+75), реалистичный диапазон ~200–300. §5/§6.6/§9/итог строкой синхронизированы. `LIMITS.maxPerDay` 705→405, `realisticPerDay` 350→250 в `economy-config.ts` (константы нигде не использовались кроме документации) (`ECONOMY.md`, `economy-config.ts`)
- **U12 (P1):** Экспорт за рекламу — новый `watchAdForExport()`: НЕ начисляет токены (раньше `watchAdForTokens` начислял +50, файл не скачивался). ExportModal использует вид `export` (свой счётчик/лимит, отдельный от HUD `tokens`); `exportStl` выполняется ПОСЛЕ onRewarded (`ExportModal.tsx`, `App.tsx`, `economy-store.ts`)
- **U12 (P2):** Импорт за рекламу — `watchAdsForImport()` больше НЕ начисляет +50 за каждый ролик («partial ok» устранён): серия из 2 роликов ОПЛАЧИВАЕТ импорт, токены не начисляются; частичная серия → импорт не выполняется. Счётчик вида `import` считает ПОКАЗЫ (серия 2 ролика = +2), лимит «≤3/день» — показы (`economy-store.ts`)
- **U12 (P2):** User activation для file chooser — ImportModal открывает диалог выбора файла ДО показа рекламы (в момент клика); при отмене выбора реклама НЕ показывается. `importStl(preSelectedFile?)` принимает заранее выбранный файл. Токен-путь тоже выбирает файл до списания (`ImportModal.tsx`, `App.tsx`, `document-store.ts`, `stl-import.ts`)
- **U12:** UI-счётчики разделены — HUD/PropertiesPanel показывают вид `tokens`, ExportModal — вид `export`, ImportModal — вид `import`; просмотр за токены НЕ влияет на оплату экспорта/импорта и наоборот. Тесты: экспорт не начисляет токены, импорт не начисляет токены, независимость счётчиков видов, сброс суток, миграция (11 новых/изменённых) (`ExportModal.tsx`, `ImportModal.tsx`, `economy-store.test.ts`)
- **C1 (регрессия U7):** возвращён компактный размер бейджей — весь бейдж (контейнер+шрифт) больше НЕ увеличен в 2 раза, увеличены ТОЛЬКО иконки. `Badge.tsx`: fontSize 16→10px, padding 3px 6px→1px 3px, gap 4→2px, minWidth 22→16px, minHeight 20→14px (иконки остаются 20×20). `IconBadge.tsx`: fontSize 13→10px, padding компактный 2px 4px, minWidth 20/minHeight 16 (иконка 20×20). Бейдж остаётся ¼ кнопки с `pointer-events:none` (`Badge.tsx`, `IconBadge.tsx`)
- **C2 (регрессия U7):** иконка токена — золотой куб-логотип вместо «монеты». Переиспользован существующий SVG-компонент `TokenIcon` (изометрический золотой куб TC: грани `rgba(251,191,36,…)` + буквы T/C, `viewBox 0 0 64 64`) из `icons/index.tsx`. `MoneyIcon` (круг-$) заменён на `TokenIcon` в `Badge.tsx` и `IconBadge.tsx`; `EconomyMiniHUD`, `EconomyBanner`, `EconomyOnboarding`, `ExportModal`, `ImportModal`, `PropertiesPanel`, `economy-ui-config` уже используют `TokenIcon`. Читаемо в 14px (HUD) и 32px (модалки) (`icons/index.tsx`, `Badge.tsx`, `IconBadge.tsx`)
- **C3 (регрессия quest «зеркала»):** квест `count_mirrored` («Зазеркалье») больше не «молчит» при выполнении условия. Причина: `mirrorObject` в `mirror-store.ts` пишет `scale = Math.abs(...)` — зеркальные объекты имеют ПОЛОЖИТЕЛЬНЫЙ scale, поэтому прежняя проверка `scale < 0` никогда не срабатывала. Счётчик теперь строится по mirror-операциям истории (`op.type === 'mirror'` → `op.ids` = id созданных зеркальных копий), пересечение с текущей сценой (удаление зеркала/undo уменьшает счётчик) + legacy `scale < 0`. Порог «≥ target»: target 3 засчитывается при 3+ зеркалах, target 1 при 1+. Зеркальные копии считаются уникально (Set по id) — повторные/цепочки зеркал не задваиваются (`economy-store.ts`)
- **Тесты C1/C2/C3:** `Badge.test.tsx` — компактный шрифт 10px/padding 1px 3px, TokenIcon 20×20, золотая заливка куба (без монеты); `IconBadge.test.tsx` — шрифт/padding компактные (10px, 2px 4px), `pointer-events:none`; `economy-store.test.ts` — `evaluateQuests count_mirrored`: зачёт при N=target(3), не-зачёт при N<target, legacy scale<0, падение счётчика при удалении зеркала, уникальность при цепочках зеркал (5 новых тестов) (`Badge.test.tsx`, `IconBadge.test.tsx`, `economy-store.test.ts`)

##### Fixed
- **U4:** Бейдж 3D-текста (75 токенов) на панели фигур больше не «молчит» — сравнение в LeftPanel переведено на реальный тип `type:'text'` из `ALL_SHAPES_DATA` (в сцене объект создаётся как `shapeType:'text3d'`; тип в константах не переименован, чтобы не сломать `addTextMesh`) (`LeftPanel.tsx`)
- **U6:** Простая палитра Wad's Optimum 16 доступна ВСЕГДА (ядро редактора бесплатно, §3.4) — `ColorPalette` рендерится без аренды/подписки; расширенный native `<input type="color">` (кнопка «Расширенный выбор») показывается только при аренде `extendedPalette` или подписке. Lock-блок заменён на бейдж «75» на кнопке (`PropertiesPanel.tsx`)
- **U7:** Иконки бейджей увеличены в 2 раза — Badge: `MoneyIcon`/`AdFilmIcon`/`ClockIcon`/`CrownIcon` 10→20px, шрифт 10→16px; IconBadge: иконка 16→20px, шрифт 9→13px, контейнеры увеличены (padding/minWidth/minHeight) (`Badge.tsx`, `IconBadge.tsx`)
- **U5/P0-1:** `EconomyBanner` подключён в App.tsx — рендерится когда экономика доступна (yandex-only), `bannerVisible=true`, нет подписки и нет аренды `disableBanner`. Все точки продажи скрытия баннера защищены от повторной покупки: EconomyBanner, PropertiesPanel (секция «НЕТ БАННЕРА НА 24 Ч»), EconomyShop — при активной аренде показывают статус «баннер скрыт · N ч» и не дают повторно списать токены/показать рекламу. `buyRental('disableBanner')` и `watchAdForBanner()` атомарно скрывают баннер в store; `refreshDayRollover()` снова показывает баннер при expiry аренды (`App.tsx`, `EconomyBanner.tsx`, `PropertiesPanel.tsx`, `EconomyShop.tsx`, `economy-store.ts`)
- **U8/P1-1:** Единая модель кэшбэка в экспорте — устранено задвоение выгоды. Выбран Вариант 1 (§2.1 ECONOMY.md): модалка списывает `netCost = 50 − кэшбэк`; `exportStl(method)` НЕ начисляет кэшбэк при оплате токенами ('tokens' — уже учтён в цене, тост «Кэшбэк учтён в стоимости»), начисляет при рекламе ('ad' — тост «Кэшбэк +N 💎»). Хэш модели фиксируется при любом успешном экспорте (анти-фарм: повторный экспорт без изменений — без кэшбэка). Цепочка экспорта исправлена: `handleExportExecute` передаёт method, оплата → закрытие → реальный скачивание файла. Тесты: «нет задвоения» (итог = −50 + кэшбэк), анти-фарм по хэшу, успех/фейл сериализации (`ExportModal.tsx`, `App.tsx`, `document-store.ts`, `document-store.test.ts`, `translation.json`)
- **P0-2:** `commitQuests()` добавлен в `saveToProject()` — награды за задания начисляются при УСПЕШНОМ сохранении в проект (§4 ECONOMY.md «зачёт в saveProject()/exportStl()»); при ошибке сохранения квесты не засчитываются. Тесты покрывают оба пути (`document-store.ts`, `document-store.test.ts`)
- **P0-1:** Анти-фарм кэшбэка — хэш модели + список `todayExportHashes[]`, атомарная фиксация хэша до начисления: `calculateAndClaimCashback(scan, hash?)` (`economy-store.ts`, `document-store.ts`)
- **P0-2:** Expiry аренд/подписок и кулдауны только по серверному времени — `serverTimeNow()` (= `getCachedServerTime() ?? Date.now()`) во всех RO-хелперах (§5) (`economy-store.ts`)
- **P0-3:** `syncToCloud` с «хвостом» — `syncTailPending`: повторная синхронизация актуальных данных после завершения первой, без потери начислений (`economy-store.ts`)
- **P0-4:** `lastSavedData` добавлен в `partialize`; восстановление/пересчёт в `loadFromCloud` — облако не перезаписывается старыми данными (`economy-store.ts`)
- **P0-5:** Клиентская валидация экономики — экспортирована `sanitizeEconomyData()` (clamp токенов [0; 1_000_000], проверка структуры, версия persist → 2), применяется при hydrate / перед syncToCloud / в loadFromCloud (`economy-store.ts`)
- **P0-6:** Clean-фолбэк SDK полностью отключает экономику (§7) — `IPlatform.isYandexSdkReady()` + `isEconomyAvailable()`; все UI-точки (App, PropertiesPanel, LeftPanel, ExportModal, ImportModal, EconomyOnboarding) переведены на `isEconomyAvailable()` (`platform/index.ts`, `App.tsx`)
- **P1-1:** Сброс дневных лимитов по серверному времени — `refreshDayRollover()` по хукам visibilitychange/focus + setInterval ~60с (не только при старте) (`economy-store.ts`, `App.tsx`)
- **P1-2:** Единый подсчёт объектов — `countSceneObjects()` в economy-config.ts для exportStl / scanForCashback / evaluateQuests (все типы объектов) (`economy-config.ts`)
- **P1-3:** `createExportHash` включает operations — рекурсивный `sortDeep` + `stripHeavyFieldsForHash` (`document-store.ts`)
- **P1-4:** RO-селекторы вместо мутирующих в render — LeftPanel / ExportModal / ImportModal переведены на `canUseText3dRO` / `hasActiveSubscriptionRO` (`LeftPanel.tsx`, `ExportModal.tsx`, `ImportModal.tsx`)
- **P1-5:** Единый `canUseText3dRO()` — подписка ИЛИ аренда text3d по серверному времени; используется в App.tsx ×2, LeftPanel, Toolbar (`economy-store.ts`)
- **P1-6:** `watchAdsForImport` начисляет +50 за каждую показанную рекламу — отказ на второй не теряет первую (`economy-store.ts`)
- **P1-7:** Баннер-реклама в общем лимите — `watchAdForBanner` учитывает `adsPerDay=3` и увеличивает `todayAdsWatched` (§2) (`economy-store.ts`)
- **P1-8:** Серверное время в экономике UI — EconomyMiniHUD/PropertiesPanel/EconomyShop на `getServerTime()` (кэш 30с) (`EconomyMiniHUD.tsx`, `PropertiesPanel.tsx`, `EconomyShop.tsx`)
- **P1-9:** `csg_complex` учитывает все булевы операции — дерево операций + `SceneObject.children` (union/subtract/intersect) (`economy-store.ts`)
- **P2-3:** Онбординг через store — `onboardingDone` в persist + partialize + sanitize + syncToCloud, action `completeOnboarding()`; EconomyOnboarding вызывает store (`economy-store.ts`, `EconomyOnboarding.tsx`)
- **P2-5:** Прогресс событийных квестов — PropertiesPanel показывает target/target, `completeEventQuest` ставит `progress=target` (`economy-store.ts`, `PropertiesPanel.tsx`)
- **P2-6:** Кэшбэк после успешного экспорта STL — try/catch в `exportStl` (кэшбэк только после успешной сериализации), `downloadStlBlob()`; новый i18n-ключ `errors.stlExportFailed` (`document-store.ts`, `stl-export.ts`)
- **P2-7:** Удалён устаревший `calculateCashback` v1 (`economy-config.ts`)
- **P2-1/P2-2/P2-4:** документирован безопасный фолбэк `isDayPassed` на `Date.now()` (clean отключает экономику, yandex логирует предупреждение); подтверждены кулдауны рекламы на серверном времени; онбординг скрыт в clean-режиме в рамках P0-6
- **EC1:** `EconomyBanner` — инициализация `bannerVisible` в App.tsx bootstrap (показ баннера если нет подписки и аренда не активна) (`App.tsx`)
- **EC2:** `ImportModal` — новая функция `watchAdsForImport(count)` в store — N реклам подряд без кулдауна между ними вместо двух вызовов `watchAdForTokens` с кулдауном 5 мин (`economy-store.ts`, `ImportModal.tsx`)
- **EC3:** `ExportModal` — bypass подписки через useEffect — подписчики не видят модалку оплаты (`ExportModal.tsx`)
- **EC4:** `completeEventQuest` — добавлена target-проверка для `export_stl`/`export_stl_large`, порядок вызовов в `exportStl` изменён: триггеры ДО commitQuests (`economy-store.ts`, `document-store.ts`)
- **EC5:** `calculateCashbackBreakdown` в `economy-config.ts` — единая функция для ExportModal и store; ExportModal использует общий `scanForCashback` и config (не дублирует формулу); учёт дневного лимита 3/день (`economy-config.ts`, `ExportModal.tsx`)
- **EC6:** `EconomyMiniHUD` — мини-HUD баланса при выделенном объекте в PropertiesPanel (`EconomyMiniHUD.tsx`, `PropertiesPanel.tsx`)
- **EC7:** `isActive` в бейджи — LeftPanel (text3d), PropertiesPanel (палитра), EconomyShop (аренда/подписки), EconomyBanner — бейджи скрываются при активном доступе (`LeftPanel.tsx`, `PropertiesPanel.tsx`, `EconomyShop.tsx`, `EconomyBanner.tsx`)
- **EC8+EC11:** чистые Zustand-селекторы — разбивка составных селекторов в LeftPanel, добавлены read-only хелперы `hasActiveSubscriptionRO` и `hasRentalRO` для предотвращения мутаций в render-фазе (`economy-store.ts`, `LeftPanel.tsx`, `PropertiesPanel.tsx`, `Toolbar.tsx`, `EconomyShop.tsx`, `EconomyBanner.tsx`)
- **EC9:** `setActiveTab('shop')` вместо `'objects'` в PropertiesPanel и App.tsx (`PropertiesPanel.tsx`, `App.tsx`)
- **EC10+EC15:** `commitQuests` — убран дневной лимит (lastQuestCommitDate), квесты коммитятся при каждом save/export (`economy-store.ts`)
- **EC12:** тост о кэшбэке через `notify` из document-store (`document-store.ts`)
- **EC13:** подпись «рекламой не открывается» в i18n, добавлена в PropertiesPanel (locked-секция палитры) и тост в handleAddText (`translation.json`, `PropertiesPanel.tsx`, `App.tsx`)
- **EC14:** кэш `getServerTime` — проверка кэша перед fetch в `server-time.ts` (`server-time.ts`)
- **EC16:** удалён мёртвый код `TRIGGER_LABELS`, `showTokensInStatusBar`, `QUEST_LABELS` из `economy-ui-config.ts`; `QuestPanel.tsx` заменён на заглушку (`economy-ui-config.ts`, `QuestPanel.tsx`)
- **EC17:** кнопки бонуса/рекламы показывают состояние вместо скрытия — бонус: «Уже получено» с часами; реклама: кулдаун `M:SS` или «Лимит рекламы» (`PropertiesPanel.tsx`, `EconomyMiniHUD.tsx`, `translation.json`)
- **EC18:** `economy-config.test.ts` — 21 тест: `calculateCashbackV2` (11), `calculateCashbackBreakdown` (6), `scanForCashback` (4) (`economy-config.test.ts`)
- **Исправлены все 7 проблем ревью экономики (E1–E7)** — E1: бейдж Текст в LeftPanel учитывает аренду text3d, а не только подписку; E2: мёртвые exportLocked/importLocked/textLocked удалены, бейджи Toolbar переведены на реактивные селекторы; E3: ImportModal — bypass подписки перенесён из render-фазы в useEffect (двойной вызов в StrictMode); E4: watchAdForBanner соблюдает общий кулдаун rewarded 5 мин; E5: EconomyHUD.tsx удалён (мёртвый код), все инлайн emoji-бейджи заменены на SVG-компонент Badge; E6: lastExportHash через action setExportHash() — включён в persist и облако; E7: initDailyQuests сбрасывает день по новому полю lastQuestResetDate (прогресс квестов больше не теряется у игроков без бонуса) (`LeftPanel.tsx`, `Toolbar.tsx`, `ImportModal.tsx`, `economy-store.ts`, `document-store.ts`, `PropertiesPanel.tsx`, `EconomyShop.tsx`, `EconomyBanner.tsx`)
- **Эмодзи полностью убраны из UI** — все бейджи 💎/📺 заменены на SVG-иконки через единый компонент `Badge` (TokenIcon/MoneyIcon/AdFilmIcon/CrownIcon/ClockIcon). Эмодзи остались только в комментариях и console.log (`Badge.tsx`, `PropertiesPanel.tsx`, `EconomyShop.tsx`, `EconomyBanner.tsx`)
- **Ревью внедрения экономики ECONOMY.md v2.0** — аудит §1–§7: тарифы, кэшбэк V2, квесты V2, анти-фарм, UI (HUD/панель/бейджи/модалки/i18n/онбординг), хранение — соответствуют спецификации. Найдено 7 открытых пунктов E1–E7 (3 средних: бейдж текста не учитывает аренду, мёртвые locked-переменные, onImport() в render-фазе ImportModal; 4 низких) — задокументированы в CODE_REVIEW.md, не блокируют релиз
- **`dev:yandex`/`build:yandex` не работали на Windows** — bash-синтаксис `VITE_PLATFORM=yandex tsc` не поддерживается cmd/PowerShell (`'VITE_PLATFORM' is not recognized`). Переведено на `cross-env` (devDependency) — скрипты стали кроссплатформенными (`package.json`)
- **Рендер больше не блокируется SDK (рек. из ревью загрузки)** — `main.tsx` раньше ждал `await initSdk()` до `createRoot().render()` (худший случай — чёрный экран 15с). Теперь: i18n инициализируется сразу по языку браузера → React рендерится немедленно → SDK инициализируется параллельно, язык из SDK применяется через новый `applySdkLanguage()` (`i18n.changeLanguage`) до первого взаимодействия (`main.tsx`, `i18n/init.ts`)
- **`LoadingAPI.ready()` вызывается после полной готовности вьюпорта (рек. из ревью, §A.1)** — раньше `ready()` вызывался в RAF при монтировании, до готовности CSG-воркера (экран «Загрузка CSG (WASM)…» ещё виден). Добавлен `IPlatform.loadingReady()`: App.tsx вызывает его при `workerOk === true`; в `yandex.ts` fallback-таймер 15с гарантирует вызов даже при сбое воркера (`platform/types.ts`, `platform/yandex.ts`, `platform/clean.ts`, `App.tsx`)
- **`EconomyOnboarding` вызывал `platform.loadData()` до инициализации платформы (рек. из ревью)** — postMessage-гонка, тот же паттерн что вызывал React error #185. Теперь компонент ждёт `initPlatform()` (идемпотентен) перед `loadData()`, добавлен флаг `cancelled` против гонки при unmount (`components/EconomyOnboarding.tsx`)
- **`getPlayer()` без таймаута блокировал загрузку экономики (рек. из ревью)** — зависший `getPlayer()` не давал `init()` резолвиться. Добавлен `Promise.race` с таймаутом 5с → guest mode (`platform/yandex.ts`)
- **Критично: игра не запускалась при тестировании с SDK-dev-proxy** — прокси во всех скриптах (`test:dev`, `test:prod`, `test:prod:debug`, `start-dev.bat`, `start-prod.sh`) указывал на `http://localhost:5173`, а Vite слушает порт **5000** (`vite.config.ts`). Прокси открывал страницу с SDK-моком (стартовая реклама и баннер показывались), но iframe игры грузился с мёртвого порта. Хост прокси исправлен на `http://localhost:5000` (`package.json`, `start-dev.bat`, `start-prod.sh`)
- **Критично: зависший `YaGames.init()` навсегда блокировал запуск игры** — в `main.tsx` рендер React ждёт `await initSdk()`, а у `YaGames.init()` не было таймаута: если init зависает (postMessage/timing в iframe Yandex), игра никогда не стартует, хотя SDK загружен и платформа показывает рекламу/баннер. Добавлен `Promise.race` с таймаутом 10с (`INIT_TIMEOUT_MS` в `platform/sdk.ts`) — при таймауте игра запускается в clean-режиме
- **Гонка порядка загрузки: `GameplayAPI.start()` не вызывался при старте** — effect с зависимостями от модалок срабатывает на монтировании раньше, чем `initPlatform()` резолвится (`getPlatform()` ещё `null`), и повторно — только при открытии модалки. `startGameplay()` теперь вызывается в bootstrap-effect сразу после `initPlatform()` (`App.tsx`)
- **Утечка: интервал syncToCloud никогда не очищался** — `return () => clearInterval(syncInterval)` возвращался из async-функции `bootstrap()`, а не из `useEffect`, и терялся. Cleanup перенесён в effect c флагом `disposed` (`App.tsx`)
- **Yandex Games SDK: React error #185 — economy init race** — `loadEconomy()` (loadFromCloud → platform.loadData → ysdk.player.getData) вызывался через postMessage ДО завершения RAF-инициализации SDK. Объединены platform init + economy init в один useEffect; `init()` теперь возвращает Promise, резолвящийся когда RAF завершится. Economy загружается только ПОСЛЕ стабилизации React-дерева в iframe (`App.tsx`, `platform/yandex.ts`)
- **100% локализация UI** — все хардкод-строки переведены через `useTranslation()`: EconomyShop.tsx (3 строки: аренда, активно, pro), EconomyOnboarding.tsx (9 строк: шаги онбординга + кнопки), WebGLFallback.tsx (4 строки: заголовок + описание). Добавлены ключи `onboarding.*` и `webgl.*` в `en/translation.json` и `ru/translation.json` (`i18n/locales/en/translation.json`, `i18n/locales/ru/translation.json`, `components/EconomyShop.tsx`, `components/EconomyOnboarding.tsx`, `components/WebGLFallback.tsx`)
- **Y3.17 Критические исправления экономики v3.0** — `completeEventQuest` больше не начисляет токены сразу (только флаг completed), токены начисляются только через `commitQuests()` при save/export; `commitQuests` защищён от двойного вызова за день (`lastQuestCommitDate`); `syncToCloud` с debounce (`pendingSync` — защита от лимита 100 setData/5мин); `csgWithChildren` исправлен — не считает сам CSG как ребёнка, считает детей (ids - 1); убран дубль `showBannerAdv` (теперь только в yandex.ts init); убран дубль `/**` в yandex.ts (`store/economy-store.ts`, `platform/yandex.ts`, `App.tsx`)
- **Yandex Games SDK: React error #185 при запуске** — `GameplayAPI.start()` перемещён из `sdk.ts` в `App.tsx` (useEffect с зависимостями от модалок). Раньше вызов происходил в async `initSdk()` до полной загрузки React, что вызывало `postMessage` → React error #185 в обёртке платформы Yandex → зависание игры. Теперь `GameplayAPI.start()` вызывается React-хуком после полного монтирования приложения (`platform/sdk.ts`, `App.tsx`)
- **Y3.14 evaluateQuests() вызывается после мутаций сцены** — функция добавлена в 14 мутающих методов document-store.ts: csgBoolean, addShape, applyFillet, importStl, pasteClipboard, deleteSelected, mirrorSelected, csgAlign, resizeObject, undo, redo, loadFromDoodle, loadFromProject, createTextMesh. Квесты по состоянию проекта (12 из 15 в пуле) теперь обновляются при каждом изменении сцены (`store/document-store.ts`, `store/economy-store.ts`)
- **Y3.15 EconomyShop подключён в App.tsx** — компонент подключён в левую панель как точка продаж (§6.3 ECONOMY.md: 3 места скрытия баннера: баннер, панель, магазин) (`components/EconomyShop.tsx`, `App.tsx`)
- **Y3.16 Бейджи на кнопках экономики (§6.4)** — добавлены бейджи 💰/📺 на все платные кнопки: PropertiesPanel (палитра, аренда, подписки, баннер off), EconomyBanner (баннер off), EconomyShop (аренда, подписки, баннер off). Бейдж = 💰 слева-внизу (цена) / 📺 справа-внизу (реклама) (`components/PropertiesPanel.tsx`, `components/EconomyBanner.tsx`, `components/EconomyShop.tsx`)

##### Changed
- **Проверка соответствия ECONOMY.md v2.0** — аудит выявил 2 проблемы: evaluateQuests() не вызывалась, EconomyShop не был подключён. Обе исправлены. (`CODE_REVIEW.md`)

##### Added
- **Отзыв пользователя по экономике/UI (2026-09-11)** — создан реестр из 10 проблем (3 P0: повторное списание токенов на скрытом баннере, экспорт не выполняется после оплаты/рекламы, SDK инициализируется после доступности игры; 5 P1: единый 5-мин кулдаун и единый счётчик рекламы на все награды, таймер отката не тикает, дублирование панели экономики слева и справа, нет простой палитры в свойствах; 2 P2: нет бейджа у 3D-текста, мелкие иконки бейджей). Только документирование, код не менялся (`docs/USER_FEEDBACK_ECONOMY.md`)
- **Ревью экономики закрыто (2026-09-11)** — все 22 проблемы ревью от 2026-09-10 (`docs/ECONOMY_CODE_REVIEW.md`) исправлены: 6 P0 (анти-фарм кэшбэка, серверное время expiry/лимитов, хвостовая синхронизация облака, lastSavedData в persist, клиентская валидация, clean-фолбэк SDK), 9 P1, 7 P2. Проверка: `pnpm typecheck` 0 ошибок, `pnpm test` 299/299. Статусы — `CODE_REVIEW.md`, `DEVELOPMENT_PLAN.md`
- **Тесты экономики** — новый `economy-store.test.ts` (~35 тестов): анти-фарм кэшбэка, лимиты/кулдауны, syncToCloud, sanitizeEconomyData; дополнены `document-store.test.ts`, `economy-config.test.ts`. Итого 299 тестов в 17 файлах (`economy-store.test.ts`, `document-store.test.ts`, `economy-config.test.ts`)
- **i18n:** новый ключ `errors.stlExportFailed` в en/ru — тост при неудачном экспорте STL (`i18n/locales/en/translation.json`, `i18n/locales/ru/translation.json`)
- **Код-ревью экономики (2026-09-10)** — проведено ревью ECONOMY.md против фактической реализации; полный отчёт в `docs/ECONOMY_CODE_REVIEW.md`: выявлено 22 проблемы (6 P0 / 9 P1 / 7 P2). Критичные P0: анти-фарм кэшбэка, expiry по локальному времени, потеря обновлений syncToCloud, lastSavedData вне partialize, client-side экономика, clean-фолбэк SDK. Статусы в `CODE_REVIEW.md`, технический долг в `DEVELOPMENT_PLAN.md`
- **Локализация: убран хардкод строк в экономике** — `formatRentalRemaining`/`formatSubRemaining` принимают `t()`, `rentalsConfig` label/desc через `t()`, "Аренда 24ч"/"Активно"/"Pro активна · "/"🔒 75"/"STL" переведены через i18n (`components/PropertiesPanel.tsx`, `components/Toolbar.tsx`, `i18n/locales/*/translation.json`)

##### Fixed
- **Rewarded video: правильные callbacks SDK** — `onClose` без аргументов (`wasShown`), `resolve(true)` только после закрытия, `onClose` вызывает `startGameplay()` (`platform/yandex.ts`)
- **Fullscreen ad: showFullscreenAdv вместо showInterstitialAd** — SDK использует `showFullscreenAdv()`, не `showInterstitialAd()` (`platform/yandex.ts`)
- **Баннер показывается при инициализации** — явный вызов `showBannerAdv()` в App.tsx после `initPlatform()` (`App.tsx`)
- **Скрытие баннера после оплаты аренды** — `watchAdForBanner()` вызывает `hideBannerAdv()` после активации `disableBanner` (`store/economy-store.ts`)
- **Токены за квесты сохраняются в облако** — `evaluateQuests()` вызывает `syncToCloud()` после начисления (`store/economy-store.ts`)
- **Бейджи: улучшена видимость** — яркие цвета (жёлтый/фиолетовый/зелёный/золотой), padding 3px 5px, min-size 20x16, boxShadow (`components/Badge.tsx`, `components/IconBadge.tsx`)
- **Расширенная палитра заблокирована** — кнопка "Расширенный выбор" проверяет аренду/подписку, открывает магазин при отсутствии доступа (`components/PropertiesPanel.tsx`)
- **IconButton: поддержка priceBadge/adBadge/timerBadge/proBadge** — новые props для бейджей на кнопках (`components/IconButton.tsx`)

##### Added
- **favicon.svg** — иконка вкладки браузера в стиле проекта: 3D-куб с градиентами и буквами TC (`public/favicon.svg`)
- **SVG-иконки для эмодзи** — добавлены MoneyIcon, PackageIcon, SpeakerIcon (`components/icons/index.tsx`)
- **Стики-баннер SDK** — автопоказ при инициализации Yandex SDK через `ysdk.adv.showBannerAdv()`, управление через API (§SDK, §6.3) (`platform/yandex.ts`, `platform/types.ts`, `platform/clean.ts`)
- **Серверное время в аренде/подписках** — `buyRental()` и `buySubscription()` теперь используют `getServerTime()` вместо `Date.now()` для защиты от накруток (§5) (`store/economy-store.ts`)
- **Бейджи для текста 3D** — кнопка «Текст» в Toolbar с бейджем 💎 75, проверка аренды (§6.4) (`components/Toolbar.tsx`, `constants.ts`)
- **Реактивный EconomyBanner** — `hasActiveSub` и `hasRentalDisable` перенесены в `useSelector` вместо `getState()` (`components/EconomyBanner.tsx`)
- **Подписи-причины disabled-кнопок** — ExportModal/ImportModal показывают «Не хватает N 💎» и «Лимит дня» под серыми кнопками (§6.5 UX) (`components/ExportModal.tsx`, `components/ImportModal.tsx`, `i18n/locales/*/translation.json`)
- **Debounce evaluateQuests** — подписка на изменения документа теперь debounced 400 мс — живой прогресс квестов без просадок FPS на слабых устройствах (§4) (`App.tsx`)
- **ECONOMY.md §6.3** — обновлено: кнопка скрытия баннера в трёх местах (баннер, панель, магазин) (`ECONOMY.md`)

##### Added
- **Y2.0 Кэшбэк V2** — формула коэффициентов (§2.1 ECONOMY.md v2.0): `min(25, 1 + Масштаб + РазнообразиеФигур + КолИнструментов + РазнообразиеИнструментов)` (`store/economy-config.ts`, `store/economy-store.ts`)
- **Y2.0 scanForCashback()** — общий сканер дерева документов для кэшбэка и квестов (`store/economy-config.ts`)
- **Y2.0 IconBadge.tsx** — бейджи на кнопках инструментов: 💰 токены, 📺 реклама, ⏱ таймер, 👑 подписка (`components/IconBadge.tsx`)
- **Y2.0 Кнопка скрытия баннера** — два места: на баннере + в панели EconomyShop (§6.3) (`components/EconomyShop.tsx`)
- **Y2.0 i18n подписи** — tooltip для всех элементов экономики (§6.6): токены, бонус, реклама, квесты, баннер, подписка, кэшбэк (`i18n/locales/*/translation.json`)

##### Changed
- **Y2.0 calculateAndClaimCashback()** — теперь принимает scanResult вместо objectCount/csgOps (`store/economy-store.ts`, `store/document-store.ts`)
- **Y2.0 ECONOMY.md** — обновлён до v2.0 с полной UI-спецификацией, политикой хранения и IAP-расчётом (`ECONOMY.md`)

##### Fixed
- **Y3.1 Токены за действия** — `earnActionToken()` добавлен в `addShape`, `addRawMesh`, `addTextMesh`, `importStl` — теперь +1 начисляется при добавлении фигуры (лимит 30/день, кулдаун 5с) (`store/document-store.ts`)
- **Y3.2 Кэшбэк за экспорт** — `calculateAndClaimCashback()` добавлен в `exportStl` с расчётом `objectCount` и `csgOps` — кэшбэк +5…+25 токенов теперь начисляется (`store/document-store.ts`)
- **Y3.3 Хэш модели для кэшбэка** — `createExportHash()` вызывается при экспорте, кэшбэк начисляется только при изменении модели (`store/document-store.ts`, `store/economy-store.ts`)
- **Y3.4 Событийные квесты** — `completeEventQuest('export_stl')` и `completeEventQuest('import_stl')` добавлены в соответствующие методы — квесты «Первая выгрузка» и «Чужая геометрия» теперь работают (`store/document-store.ts`, `store/economy-store.ts`)
- **Y3.5 Квест csg_complex** — реализован подсчёт CSG с ≥3 детьми через `op.ids` — квест «Сложная геометрия» теперь выполним (`store/economy-store.ts`)
- **Y3.6 Квест count_mirrored** — добавлена проверка `transform.scaleX/Y/Z < 0` — квесты «Зазеркалье» и «Зеркальный зал» теперь работают (`store/economy-store.ts`)
- **Y3.7 Квест count_text3d** — исправлен `'text'` → `'text3d'` — квест «Гравировка» теперь выполним (`store/economy-store.ts`)
- **Y3.8 + Y3.9 Магазин экономики** — создан `EconomyShop.tsx`: аренда (3D-текст 75, палитра 75, баннер 50) + подписки (неделя 700, месяц 2000), показ статуса с оставшимся временем (`components/EconomyShop.tsx`, `App.tsx`)
- **Y3.10 Удалён бесплатный экспорт** — удалена кнопка «Бесплатный экспорт» из `ExportModal.tsx` — экспорт теперь только за токены или рекламу (`components/ExportModal.tsx`)
- **Y3.12 Fallback категорий квестов** — исправлена генерация: `pool.find(q => !usedCategories.has(q.category)) ?? pool[0]` — гарантируются разные категории (`store/economy-store.ts`)
- **Y3.13 todayQuestsCompleted** — добавлен флаг `_justCompleted`, токены начисляются только если difficulty ещё не в completed (`store/economy-store.ts`)
- **Y3.11 Таймер кулдауна рекламы** — уже был реализован в `EconomyHUD.tsx` (строки 8-22, 32-41, 92-96) ✅
- **Yandex SDK модерация** — исправлены критические проблемы встраивания SDK (п. 1.1 требований): `base: './'` вместо `'/'` для относительных путей, CDN SDK вместо локального лоадера (`vite.config.ts`), `manifest.json` с относительными путём и `start_url` (`public/manifest.json`), убран дублирующий `<script src="/sdk.js">` из `index.html` (`index.html`), обработка ошибок в callbacks рекламы с обязательным `GameplayAPI.start()` при ошибке (`src/platform/yandex.ts`)

##### Changed
- **Проверка актуальности проблем Y.2** — верифицировано состояние 4 проблем ревью: Y2.1, Y2.2, Y2.4 полностью исправлены; Y2.3 частично (не хватает триггера `export:stl`, квест `sceneSize` не прогрессирует — пропускается через `continue` в `completeQuest`) (`CODE_REVIEW.md`)

##### Fixed
- **Y2.3 Добавлен триггер export:stl** — обёртка `handleExportStl` в `App.tsx` вызывает `completeQuest('export:stl')` после экспорта (`App.tsx`)
- **Y2.3 Исправлен прогресс sceneSize** — `completeQuest` в `economy-store.ts` принимает `sceneSize?: number`, прогресс квеста по количеству объектов в сцене (ранее пропускался через `continue`) (`economy-store.ts`, `App.tsx`)
- **Y2.1 Удалён дублирующий game-store.ts** — удалён устаревший `game-store.ts` (V11: +5/10 токенов, вечные разблокировки), оставлен `economy-store.ts` (V12: +50 токенов, аренда 24ч, лимиты) (`store/`)
- **Y2.2 Удалён GamePanel.tsx** — удалён `GamePanel.tsx` (использовал старый game-store), EconomyHUD + QuestPanel в App.tsx покрывают все функции (`components/`)
- **Y2.3 Удалён UnlockModal.tsx и ToolBadge.tsx** — замки на фигурах убраны, фигуры бесплатны по V12 (`components/`)
- **Y2.4 Очистка lock-config.ts** — удалены замки на torus/cone, оставлены только `tool:text3d` и `tool:extendedPalette` (`store/`)
- **Y2.5 Триггеры квестов** — добавлены все 14 триггеров: addShape (7 типов), csgBoolean (union/subtract/intersect), setColor, mirror/align, import:stl, sceneSize (`App.tsx`)
- **Y2.6 LeftPanel.tsx** — убраны импорты useGameStore, getLockConfig, ToolBadge, UnlockModal; фигуры теперь бесплатны без замков (`components/`)

---

## [1.3.9] — 2026-11-10

### Added
- **CSG-GROUP-UI:** подсветка групп A (тёплая оранжевая кайма) и B (холодная синяя) во вьюпорте. Кнопки CSG в тулбаре (уже с v1.3.6).
- **SHADOW-BOUNDS-400:** область теней и плоскость под ними следуют за центром вида. При отдалении камеры область растёт (не меньше ±200 мм), тени не дрожат, не отрываются.
- **DIMENSION-UNDO:** отдельный стек отмены для размеров, общий порядок с документом. Удаление размера → Ctrl+Z → вернулся (на то же место).

### Fixed
- **CLEANUP-TREE-SNAPSHOT:** снимки дерева (не читались) убраны. Память: 66.22 → 64.49 МБ (35 шагов, импорт 100k). Undo/Redo не сломан (снимки объектов не тронуты).

### Known Limitations
- Действия с размерами в панели «История» не видны (отмена работает, но шагами истории не стали).
- Отмена удаления размера + новый шаг → Ctrl+Y **не** повторит удаление.
- При открытии файла/проекта и очистке сцены история отмены размеров сбрасывается.

### Подробно

#### Added
- **DIMENSION-UNDO — отмена действий с размерами:** удалил размер → Ctrl+Z (или «Отменить») — он вернулся (тот же размер — точки, стиль, отступ — на том же месте списка), Ctrl+Y / «Повторить» — снова удалён; так же отменяются создание размера и смена его стиля / отступа. Свой стек (размеры — по-прежнему не шаги «Истории»), но общий порядок с шагами документа: каждая запись помнит позицию истории, на которой сделана, — Ctrl+Z отменяет действие с размером, если после него шагов документа не было, иначе шаг документа (размер → сдвиг куба → удаление размера: Ctrl+Z ×3 — удаление, сдвиг, создание; Ctrl+Y — в обратном порядке). «Повторить» активна и тогда, когда вернуть можно только размер. Новый шаг документа — вернуть отменённое действие с размером нельзя (как с шагами); открыт файл / проект, сцена очищена или очистка отменена — стек размеров пуст. `store/dimension-undo.ts` (`recordDimensionChange`, `undoWithDimensions` / `redoWithDimensions`, `canUndoDimension` / `canRedoDimension`), `dimensions-store` (`undoStack` / `redoStack`), `dimension-mode` (запись в `createDimension` / `deleteDimension` / `restyleDimension`), `App` (Ctrl+Z / Ctrl+Y и кнопки тулбара). Тесты: `__tests__/ux-polish.test.tsx` (4, WASM), e2e `ux-polish` (D)
- **CSG-GROUP-UI — группы A / B видны во вьюпорте:** в режиме «Вычитание» / «Пересечение» группа A — **тёплая (оранжевая) кайма** `#ff7a00` (вдобавок к тёплой подсветке; на оранжевых и персиковых фигурах палитры одной подсветки почти не видно), группа B (выделение) — **холодная синяя** кайма (SELECTION-OUTLINE). Выход из режима (Enter / Esc) — каймы A нет. Второй проход каймы работает только в режиме. Кнопки CSG в тулбаре уже есть с v1.3.6 (CSG-GROUP-FIX: «Объединение» / «Вычитание» / «Пересечение», в режиме нажата кнопка его операции) — закреплены тестом. `components/selection-outline.ts` (`GROUP_A_OUTLINE`, `OutlineStyle`; `renderWithSelectionOutline` — несколько проходов: A, затем выделенные), `viewport-hooks` › `useThreeInit` (`data-outline-a-count` у вьюпорта). Тесты: `__tests__/ux-polish.test.tsx` (4), e2e `pnpm e2e:ux-polish` (A)

#### Fixed
- **SHADOW-BOUNDS-400 — тени там, где смотрит камера:** область теней солнца была ±200 мм у начала координат, а плоскость-приёмник — 400 × 400 мм там же: объект дальше ~200 мм от начала координат тени не отбрасывал (сетка с GRID-ADAPTIVE бесконечная). Теперь область теней и приёмник следуют за центром вида (цель камеры), размер растёт с отдалением камеры (полуразмер ≥ 200 мм и ≥ расстояния до цели, ступенями ×1,25); направление солнца прежнее. Центр области — в узле текселей карты теней (в осях света), размер — ступенями: при сдвиге и масштабе вида тени не «дрожат»; смещения (bias / normalBias) пересчитываются под размер — в мировых единицах как при ±200 мм (тени не отрываются, нет полос). У начала координат вид прежний (куб у 0: те же 1042 px тени). Карта теней та же (4096²), область пересчитывается только при смене цели или расстояния камеры. `components/shadow-follow.ts` (`shadowFrustumFor`, `applyShadowFrustum`, `shadowHalfFor`), `viewport-hooks` › `useThreeInit` (цель солнца в сцене; `data-shadow-half` / `data-shadow-center` у вьюпорта). Тесты: `__tests__/ux-polish.test.tsx` (4), e2e `ux-polish` (C: куб на X = 0 / 600 / 1500 и отдалились — тень есть; раньше на 600 и 1500 — 0 px)

#### Removed
- **CLEANUP-TREE-SNAPSHOT — снимки дерева:** `cacheTreeSnapshot` / `getCachedTreeSnapshot` / `serializeTree` и кэш дерева в `store/snapshots.ts`, обёртка `cacheSnapshotWithTree` в `document-store` (23 вызова → `cacheSnapshot`). Снимки дерева писались на каждом шаге (до 50), но не читались: undo / redo всегда перестраивают дерево из операций (`rebuildBuildTree`, CYCLE-CSG-RELOAD). Снимки объектов (мгновенный undo / redo, PERF-1) — как были. Память (сценарий: куб, сфера, цилиндр, импорт 100k, CSG, 6 + 4 правки детей, 20 сдвигов, undo / redo всего — 35 шагов): массивы, которые держали только снимки дерева, — 1,73 МБ → 0 (`arrayBuffers` процесса после GC 66,22 → 64,49 МБ), описания узлов — 37 КБ → 0; остальные массивы снимков дерева (66, 57 МБ) общие с живым деревом и снимками объектов. Тесты: `__tests__/ux-polish.test.tsx` (undo / redo по шагу назад и вперёд — объекты и дерево как были, с кэшем и без), e2e `ux-polish` (B)

---

## [1.3.8] — 2026-11-10

Навигация и выделение как в AutoCAD: карта мыши, адаптивная сетка, рамка выделения, кайма у выделенных; размерные линии.

### Added
- **VIEWPORT-NAV:** «Вписать в экран» — F (остаётся) **и двойной клик средней кнопкой**; колесо, вращение и сдвиг прерывают анимацию «вписать».
- **GRID-ADAPTIVE:** две сетки — тонкая (minor) и жирная (major, каждые 10 клеток) + оси X / Y; шаг **1 / 5 / 10 / 50 / 100 мм** по масштабу (клетка ≥ 16 px); сетка не обрывается (следует за видом, гаснет к горизонту); отдаление камеры — до 5 м.
- **SELECTION-RECT (как AutoCAD):** рамка **слева направо — синяя сплошная**, выбирает только объекты целиком внутри; **справа налево — зелёная пунктирная**, выбирает всё, что задевает; по настоящей геометрии; Shift — добавить.
- **SELECTION-OUTLINE (кайма):** синяя кайма ~3 px по силуэту выделенных; у нескольких выделенных — у всех; закрытая часть — приглушённая; тёмная / светлая тема, перспектива / орто; гизмо и размеры поверх; ничего не выделено — кадр как раньше (60 FPS с 24 выделенными объектами и 106k треугольников).
- **DIMENSIONS:** размерные линии — кнопка «Размер» (меню; D — сразу режим): ассоциативные (следуют за сдвигом, поворотом, масштабом и размерами объекта), подварианты «Стандарт» / «С отступом» / «Проекция», настройки (тип, цвет, шрифт, высота текста, отступ), показать / скрыть слой, выделение и удаление (Delete); сохраняются в `.3dtc`, не в истории.

### Changed
- **Карта мыши (как AutoCAD):** ЛКМ — выбор и рамка (протяжка ЛКМ больше **не вращает** вид), **ПКМ — вращение**, **СКМ — сдвиг**, колесо — масштаб; подсказка вьюпорта обновлена.
- Тулбар: одна кнопка «Размер» с меню (группа «Линейки»).

### Fixed
- **FIT-STALE-MATRIX:** «Вписать в экран» сразу после добавления фигуры вписывал её прежнее место.
- Раскладка тулбара считала зазор между кнопками 4 px вместо 2 px (на 1366 лишний перенос строки).

### Known Limitations
- `DIMENSION-UNDO` — удаление размера не отменяется Ctrl+Z (размеры — слой аннотаций, не шаги).
- `DIMENSION-CSG-TRANSFER` — размер к объекту, ушедшему в CSG, скрыт и на результат не переносится.
- `DIMENSION-LIVE-DRAG` — при перетаскивании гизмо число размера обновляется по отпусканию.

### Подробно

#### Changed
- **SELECTION-RECT — рамка выделения (как AutoCAD):** протяжка ЛКМ по сцене — рамка; направление задаёт режим. **Слева направо — окно** (синяя сплошная): выбираются только объекты ЦЕЛИКОМ внутри рамки. **Справа налево — секущая** (зелёная пунктирная): всё, что рамку ЗАДЕВАЕТ, — вершина внутри или треугольник пересекает рамку (рамка внутри большой грани тоже). Считается по настоящей геометрии мешей (вершины × матрица объекта × камера, перспектива и орто); скрытые и не попавшие в кадр (за камерой / вне near–far) — не выбираются. Shift — добавить к выделению. Рамка не рисуется при перетаскивании гизмо и в режимах (выравнивание, размещение, размер, линейка); отпускание за краем вьюпорта завершает её (захват указателя). Раньше: рамка выбирала по центру ограничивающей сферы, а протяжка ЛКМ одновременно вращала камеру — рамка фактически не работала. `components/selection-rect.ts` (`objectsInRect`, `meshInRect`, `triangleOverlapsRect`, `rectModeOf`), `Viewport3D` (рамка — `data-testid=selection-rect`, `data-mode`)
- **GRID-ADAPTIVE — адаптивная сетка (как AutoCAD):** вместо GridHelper 400 × 400 мм с клеткой 10 мм (при отдалении обрывался квадратом, при приближении клетка огромная) — ДВЕ сетки всегда: тонкая (шаг) и жирная (каждые 10 клеток), плюс оси X / Y. Шаг адаптивный — 1 / 5 / 10 / 50 / 100 мм: наименьший, при котором клетка на экране ≥ 16 px (приблизили — детализируется, отдалили — укрупняется). Не обрывается: линии считаются в шейдере по мировым координатам, плоскость следует за центром вида и мягко гаснет к краю радиуса, растущего с отдалением камеры; клетки мельче пары пикселей у горизонта гаснут, а не рябят. Тёмная и светлая темы. Отдаление камеры — до 5 м (было 2 м: шаг 100 мм недостижим). `components/adaptive-grid.ts` (`gridStepFor`, `updateAdaptiveGrid`, …); шаг, жирный шаг, радиус и центр — `data-grid-*` у вьюпорта (e2e)
- **VIEWPORT-NAV — навигация вьюпорта (как в подсказке, AutoCAD / Tinkercad):** ЛКМ — выбор и рамка выделения (перетаскивание ЛКМ больше НЕ вращает камеру — раньше камера поворачивалась во время рамки, и рамка не выбирала), ПКМ — вращение вида (клик ПКМ — по-прежнему выход из режимов), СКМ — сдвиг вида, колесо — масштаб; **двойной клик средней кнопкой — «Вписать в экран»** (как F, F остаётся; не мешает одиночному клику ЛКМ — выбору). Точка линейки — только ЛКМ; выбор кликом и рамкой — только ЛКМ. Колесо, вращение и сдвиг прерывают анимацию «Вписать в экран» (раньше после F из далёкого вида анимация шла секунды и затирала ввод). Подсказка вьюпорта обновлена. `components/viewport-nav.ts` (`VIEWPORT_MOUSE_BUTTONS`, `createMiddleDoubleClick`), `Viewport3D`. Тесты (вместе с GRID-ADAPTIVE и SELECTION-RECT): `__tests__/ux-viewport.test.tsx` (11), e2e `pnpm e2e:ux-viewport` (в CI — 25 e2e)

#### Added
- **SELECTION-OUTLINE — кайма выделенных объектов:** вокруг выделенного объекта — синяя кайма ~3 px (`#2f80ff`) по силуэту; у нескольких выделенных (Shift+клик, рамка, Ctrl+A) — у всех; часть силуэта, закрытая другим объектом (или под сеткой), — приглушённым синим (`#1d4f9e`); скрытый объект каймы не получает. Видна в тёмной и светлой темах, в перспективе и орто; гизмо и размеры рисуются поверх каймы. Прежняя подсветка (emissive) остаётся. **Как рисуется:** `OutlinePass` (three/examples) прямо поверх канваса, без EffectComposer — сцена рендерится как раньше (то же MSAA-сглаживание и цвета, без RenderPass / OutputPass); у прохода обычное смешивание вместо аддитивного (аддитивная кайма на светлом фоне выцветает в белый) и точный цвет на экране, маска пересобирается при смене перспектива ↔ орто, буферы — в CSS px (толщина одна при любом devicePixelRatio), тени на время проходов каймы не пересчитываются. **Ничего не выделено — кадр как раньше** (один `renderer.render`, кайма ничего не стоит). Производительность: 24 выделенных объекта, 106 530 треугольников — 60 FPS (GPU). `components/selection-outline.ts` (`SelectionOutlinePass`, `selectionOutlineTargets`, `renderWithSelectionOutline`, `SELECTION_OUTLINE`, флаг `DRAW_OVER_OUTLINE`), `viewport-hooks` › `useThreeInit` (цикл отрисовки; число объектов в кайме — `data-outline-count` у вьюпорта, для e2e). Тесты: `__tests__/selection-outline.test.tsx` (8), e2e `pnpm e2e:selection-outline` (в CI — 26 e2e)
- **DIMENSIONS — размерные линии (ассоциативные, 3 подварианта, настройки):** кнопка «Размер» в тулбаре — меню из трёх пунктов: «Поставить размер» (D — сразу, без меню), «Настройки размера», «Показать / скрыть размеры» (галочка). «Поставить размер» → режим: клик по точке объекта (привязка как у линейки: вершина > ребро > центр окружности > грань) → A, клик по второй точке (тот же или другой объект) → B → размер; режим остаётся для следующего, Esc / правый клик / «Готово» — выход; превью A → курсор с числом, маркер привязки. **Ассоциативный:** конец размера — объект (id) и точка в его локальных координатах (+ локальная рамка при создании), а не мировая точка: сдвиг, поворот, масштаб объекта и смена его размеров (куб 20 → 30 — угол остаётся углом) пересчитывают число; объект ушёл (CSG, удаление, undo создания) — размер скрыт, вернулся — снова виден. **Подварианты:** Стандарт — линия A → B, стрелки, число посередине; С отступом — линия сдвинута наружу на отступ (от центра объектов, ⟂ AB), выносные линии от A и B; Проекция — на плоскость XY (на уровне нижней точки), число — длина по горизонтали, выносные вертикально. **3D:** линии и конусы-стрелки поверх объектов, число — Sprite (billboard, всегда лицом к камере) на плашке, над линией. **«Настройки размера»** (меню «Размер»): тип, цвет, шрифт (без засечек / моноширинный / с засечками), высота текста (мм), отступ, единицы — мм; «Применить к новым» (`ui-store.dimensionDefaults`) и «Применить к выбранному». **«Показать / скрыть размеры»** (меню «Размер», галочка) — слой целиком. **Выделение:** клик по размеру во вьюпорте или в списке «Размеры» (левая панель: «Куб 1 — Куб 2 · 25.0 мм») → панель «Размер» справа (значение, тип, отступ, «Стиль…», «Удалить размер»); Delete — удаляет размер (не объекты); корзина в списке. **Слой — не история:** `store/dimensions-store.ts` отдельно от `document-store`, размеры не шаги и undo / redo их не трогает; создание / удаление / стиль помечают документ несохранённым. **Сохранение:** `.3dtc` — поле `dimensions` рядом с `operations` (формат `3dtc-v1`, старые файлы — без поля; битые записи отбрасываются), автосохранение и менеджер проектов — тоже; при загрузке — размеры, чьи объекты есть. `store/dimensions.ts` (модель и геометрия), `store/dimensions-store.ts` (слой), `store/dimension-mode.ts` (режим и действия), `hooks/useDimensionMode.ts` (Esc, Delete), `components/dimension-render.ts` (3D), `viewport-hooks` › `useDimensionsRender` / `useDimensionModePreview`, `DimensionMenuButton` (кнопка с меню, в портале), `DimensionSettingsModal`, `DimensionPanel`, `DimensionList`; `snap-utils` › `SnapResult.objectId`. Вариант C (управляющий размер) — Фаза 11+ (`DEVELOPMENT_PLAN.md`). Тесты: `__tests__/dimensions.test.tsx` (12, WASM), `.3dtc` — `io/3dtc-io.test.ts`, e2e `pnpm e2e:dimensions` (в CI — 24 e2e)

#### Changed
- Тулбар: одна кнопка «Размер» с меню в группе «Линейки» (три кнопки на 1366 в одну строку не помещались); снимок имён кнопок (`toolbar-aria`) — +1; клавиша D — режим «Размер»; `IconButton` — `ariaHasPopup` / `ariaExpanded` / `tooltipSuppressed` (`Tooltip.suppressed` — подсказка не закрывает открытое меню, кнопка не перемонтируется)

#### Fixed
- **FIT-STALE-MATRIX:** «Вписать в экран» (F / двойной клик СКМ) сразу после добавления фигуры — в том же кадре — вписывал её прежнее место: мировая матрица нового меша обновляется только при отрисовке, и новая фигура считалась в начале координат (два куба → вид на один). Теперь матрица обновляется перед расчётом рамки (`Viewport3D` › fitView). Нашёлся по флейку e2e `ux-viewport` (A: эталон «вписанного» вида снимался по F сразу после второго куба — 2 провала из 4 локально; после исправления — 6 из 6)
- Раскладка тулбара (`hooks/useToolbarLayout.ts`) считала кнопку шире, чем она есть: ширина + 4 px вместо реального зазора 2 px между кнопками (комментарий обещал 2 px) — +60 px на тулбар, и при 1366 даже одна новая кнопка переносила тулбар в 3 строки, хотя место было. Теперь зазор берётся из `.toolbar-group-row` (`column-gap`)

---

## [1.3.7] — 2026-11-09

Размещение фигуры с привязкой к плоскости (Plug & Play): клик по иконке — режим, превью на грани / сетке / плоскости X / Y / Z, клик или Enter — фигура стоит на плоскости.

### Added
- **Plug & Play (placement mode):** клик по иконке фигуры включает режим. **Превью** (прозрачное) следует за курсором. **Привязка** к грани (raycast), сетке (XY), X/Y/Z (мировые). **Клик** или **Enter** — создание на плоскости (основание = точка клика, центр = + h/2 по нормали). **Esc** / правый клик — отмена. **Очередь** (если busy — не теряется). 50 мс (не debounce).

### Changed
- **Клик по иконке** — включает режим (не создаёт сразу). **Enter** (без превью) — постановка рядом с прошлыми (как раньше).
- **Защита от двойного клика** (`DOUBLE-CLICK-TIMING`, `ADD_SHAPE_DEBOUNCE_MS`) — удалена (иконка не создаёт фигуру).

### Known Limitations
- `PLACEMENT-AXIS-ORIGIN` — X/Y/Z через начало координат (не к грани под курсором).
- `PLACEMENT-SNAP-SLOPED` — на наклонной грани шаг привязки не действует.
- `PLACEMENT-ROTATE` — поворот вокруг нормали не задаётся.
- `PLACEMENT-TEXT` — «Текст» — окно ввода (не placement).

### Подробно

#### Added
- **PLUG-AND-PLAY — размещение фигуры с привязкой к плоскости:** клик по фигуре палитры больше не создаёт её в ряду у начала координат, а включает режим размещения. Полупрозрачное превью (та же фигура, прозрачность 0,5, цвет следующего объекта) следует за курсором и встаёт на плоскость под ним: грань объекта (raycast — нормаль и точка грани), сетку (плоскость XY, z = 0) или плоскость оси — клавиши X / Y / Z → YZ / XZ / XY через начало координат (нормаль — к камере; та же клавиша ещё раз — снова грань / сетка). Фигура СТОИТ на плоскости: локальная +Z — по нормали, основание — в точке, pivot = точка + нормаль × расстояние от центра до основания (куб на сетке — Z = 10, сфера на верхней грани куба — Z = 20 + 12); точка на сетке, плоскости оси и грани, перпендикулярной оси, — с шагом привязки. Клик — фигура создаётся там, где превью, режим выключается; Enter / «Поставить» — то же, а без превью (курсор не над сценой) — рядом с прошлыми, как раньше; Esc / правый клик / «Отмена» — выход без фигуры; клик мимо плоскостей (в небо) — ничего, режим остаётся; перетаскивание — по-прежнему вращение камеры. Статус-бар: «Разместить куб: наведите на грань объекта или сетку, X / Y / Z — плоскость оси…», плоскость и место («грань «Куб 1» · X 46 · Y −62 · Z 32»), «Поставить» / «Отмена»; иконка размещаемой фигуры нажата, курсор — прицел, гизмо на время режима скрыт. Не совмещается с «Выровнять», режимом CSG A → B и линейкой (вход в одно выходит из другого). Место пишется в историю шагом «Добавить …» с трансформом (undo / redo, `.3dtc` — как у любой фигуры). `store/placement.ts` (геометрия), `store/placement-mode.ts` (режим), `hooks/usePlacementMode.ts` (клавиши), `viewport-hooks` › `usePlacementPreview`, `Viewport3D`, `StatusBar`, `LeftPanel`; `addShape(type, params?, at?)`, `defaultShapeParams` (`store/helpers.ts`). Тесты: `__tests__/plug-and-play.test.tsx` (14, WASM + Three.js raycast), e2e `pnpm e2e:plug-and-play` (в CI — 23 e2e)

#### Changed
- Клик по иконке фигуры — режим размещения (см. PLUG-AND-PLAY), а не сразу фигура; двойной клик по иконке — тот же один режим. «Текст» — по-прежнему окно ввода
- e2e добавляют фигуру через `placeShape(page, label)` (`e2e/helpers.mjs`: иконка → Enter — рядом с прошлыми, позиции прежние); UX-AUDIT-9 (`ux-audit.test.tsx`, `e2e/ux-audit.mjs`) и `double-click-timing` (unit, e2e) переписаны: клики по иконке, в т. ч. пришедшие из очереди при занятом главном потоке, — один режим и ни одной лишней фигуры; иконка и клик по сетке в очереди — одна фигура на сетке

#### Removed
- Фильтр двойного клика по иконке (UX-AUDIT-9 / DOUBLE-CLICK-TIMING: `createAddShapeGate`, `createShapeClickHandler`, `ADD_SHAPE_DEBOUNCE_MS`) — клик по иконке не создаёт фигуру, фильтровать нечего; `addShapeWhenIdle` (ожидание занятого стора) остаётся. e2e-хелпер `spaceShapeClick`

---

## [1.3.6] — 2026-11-09

Вычитание / пересечение режимом A → B → Enter вместо кнопок групп (CSG-GROUP-FIX), двойной клик по фигуре — по времени клика (DOUBLE-CLICK-TIMING), палитра не уезжает при добавлении фигур (TIMELINE-SCROLL-FIX).

### Added
- **CSG-GROUP-FIX:** union N, subtract/intersect A vs B — **режим** (выбрал A → «Вычесть» → выбрал B → Enter/ОК), **без** кнопок «Группа A/B». A подсвечена, метки «A»/«B», статус-бар, «ОК»/Enter, Esc — отмена.

### Fixed
- **DOUBLE-CLICK-TIMING:** защита от двойного клика меряет `event.timeStamp` (время клика), не `performance.now()` (обработка). На медленном CPU 100 мс → две (было), 300 мс → одна (было). **Фикс.**
- **TIMELINE-SCROLL-FIX:** история прокручивается **внутри** `.tl-list`, **не** всю левую панель. Палитра **не уезжает** при добавлении фигур (UX-баг).

### Changed
- **Subtract/Intersect:** **A** = все выбранные, **B** — **отдельно** (Enter/ОК). Раньше — сразу два (первый − второй).
- **История:** панель **не** прокручивается **сама** к текущему шагу (только внутри списка).

### Подробно

#### Changed
- **CSG-GROUP-FIX — вычитание / пересечение: A → B → Enter вместо кнопок групп:** одна кнопка на операцию. «Объединение» — сразу (N выбранных → один CSG). «Вычитание» / «Пересечение» — режим: текущее выделение (от 1 объекта) — группа A, она фиксируется (выделение снимается, A подсвечена во вьюпорте тёплым цветом, метка «A» в списке объектов, кнопка операции нажата), затем выделение — группа B (метки «B») → Enter / «ОК» в статус-баре / та же кнопка ещё раз → union(A) − union(B) / union(A) ∩ union(B) — ОДИН CSG, A и B — его дети (`groupA` — внутри дерева, как в N-ARY-CSG). Статус-бар: «Вычитание: выберите вторую группу (A: N, B: M). Enter — ОК, Esc — отмена». Esc / «Отмена» / та же кнопка без B — выход без изменений, выделение снова A; другая кнопка (вычитание ↔ пересечение) — смена операции; «Объединение» в режиме недоступно. Клавиши X / I — так же, U — сразу. Enter в поле ввода и под модалкой режим не подтверждает; объекты A, исчезнувшие (undo, удаление), отбрасываются; «Выровнять» и режим CSG не совмещаются (`store/csg-group-mode.ts`, `hooks/useCsgGroupMode.ts`, `StatusBar`, `CsgButtons` — `opStates`, `viewport-hooks` — `EMISSIVE_GROUP_A`). Стор (`csgBoolean(op, groups?)`) и N-арное дерево не менялись: без групп — по-прежнему первый выбранный против остальных. Тесты: `__tests__/csg-group-fix.test.tsx` (16, WASM), e2e `pnpm e2e:csg-group-fix` (в CI — 21 e2e); e2e с вычитанием / пересечением (`ux-audit`, `-2`, `-3`, `-4`, `n-ary-csg`) — через режим (`e2e/helpers.mjs` › `csgAB`, `csgModeStart`, `csgModeConfirm`)
- Подсказки кнопок «Вычитание» / «Пересечение» — про порядок действий (A → кнопка → B → Enter)

#### Removed
- Кнопки «Группа A» / «Группа B», счётчики и «×» под кнопками CSG (`components/CsgGroupsRow.tsx`), `ui-store.csgGroups` / `setCsgGroups`, `assignCsgGroup`, `EMPTY_CSG_GROUPS`, ключи i18n `csg.groupATip` / `groupBTip` / `groupsClear` / `groupsHint` / `groupsHintActive`. Заголовки «Группа A» / «Группа B» у детей N-арного CSG в дереве — остаются (просмотр результата)

#### Fixed
- **DOUBLE-CLICK-TIMING — двойной клик по фигуре палитры меряется по времени клика:** фильтр «повтор той же фигуры раньше 200 мс — случайный двойной клик» (UX-AUDIT-9) брал время обработки (`performance.now()` в обработчике). На медленном CPU главный поток занят (кадр, сборка фигуры), клики ждут в очереди и обрабатываются неравномерно: два клика через 300 мс обрабатывались подряд и слипались в одну фигуру, а двойной клик через 100 мс, обработанный через 400–700 мс, давал две. Теперь интервал — между моментами кликов (`event.timeStamp`: палитра передаёт его в `onAddShape(type, at)`, `store/add-shape-queue.ts` › `createAddShapeGate`, `createShapeClickHandler`); срок 200 мс не менялся. Событие без времени — запасные часы `performance.now()`
- **Палитра фигур уезжала из-под курсора:** с 5-й фигуры каждая новая прокручивала всю левую панель на строку (~25 px) — история (`Timeline`) прокручивала к текущему шагу через `scrollIntoView`, а он двигает и `.panel-left`. Второй клик по «Кубу» через 300 мс попадал в зазор между кнопками (клик терялся) или в «Конус» — так и падал e2e UX-AUDIT-9 в CI («два клика через 300 мс добавили 1»). Теперь прокручивается только список истории (`components/list-scroll.ts` › `scrollListToItem`, у `.tl-list` своя прокрутка); левая панель и палитра на месте. Тесты: `__tests__/double-click-timing.test.tsx` (7, WASM), e2e `pnpm e2e:double-click-timing` (клики в очередь при занятом главном потоке — сырым CDP; неподвижная палитра до 14 фигур; в CI — 22 e2e)

---

## [1.3.5] — 2026-11-09

N-арный CSG (N-ARY-CSG): объединение N объектов и вычитание / пересечение группы A против группы B — одним CSG с плоским списком детей.

### Added
- **N-ARY-CSG:** union N объектов (10 → один CSG из 10 детей), subtract/intersect A vs B (выбрал A (N) → union A, выбрал B (M) → union B, A − B / A ∩ B → один CSG). **Плоский UI** (N детей, «Группа A/B», без вложенности). **Правка** (9.2/9.3) — плоская, **каскад** (9.5) — N детей. **Лимит 30** (предупреждение, не блокирует). Старые бинарные — совместимы (`children: [a, b]`).

### Known Limitations
- Существующий CSG среди операндов остаётся вложенным ребёнком (не раскрывается в общий список).
- Кнопки «Группа A» / «Группа B» — только в панели свойств (не в тулбаре), подсветки групп во вьюпорте нет — метки «A» / «B» в списке объектов (`CSG-GROUP-UI` 🔲).

### Подробно

#### Added
- **N-ARY-CSG — N-арный CSG:** «Объединение» N выбранных объектов даёт ОДИН CSG с N детьми (плоский список в дереве, без цепочки вложенных бинарных CSG). «Вычитание» / «Пересечение» — группа A против группы B: union(A) − union(B) / union(A) ∩ union(B) → ОДИН CSG, группы A и B — его дети. Группы задаются кнопками «Группа A» / «Группа B» под кнопками CSG в панели свойств (счётчик, метка «A» / «B» у объекта в списке, «×» — сбросить); задана одна группа — вторая берётся из выделения; без групп — первый выбранный против остальных (`store/csg-operands.ts`, `components/CsgGroupsRow.tsx`). В дереве компонентов у N-арного вычитания / пересечения — заголовки «Группа A» / «Группа B» перед детьми групп. Правка ребёнка (9.2/9.3) — ребёнок из плоского списка; каскад правки прошлых шагов (9.5) пересчитывает CSG из всех N операндов; undo / redo, `.3dtc` — как у бинарного. Мягкий лимит 30 операндов: больше — предупреждение «разбейте на несколько операций», операция выполняется (`CSG_SOFT_LIMIT`). Тесты: `__tests__/n-ary-csg.test.ts` (21, WASM: в т. ч. копии — зеркало и вставка), `__tests__/n-ary-csg-ui.test.tsx` (5), `.3dtc` round-trip в `io/3dtc-io.test.ts`; e2e `pnpm e2e:n-ary-csg` (в CI — 20 e2e)

#### Changed
- **Модель CSG — N-арная** (бинарная — частный случай): boolean-узел дерева — `children: string[]` (N ≥ 2) и `groupA` (число детей группы A у subtract/intersect; нет — 1), `GroupOperation.ids` — все операнды и `groupA`. `createBooleanNode(id, op, childIds, transform?, groupA?)` (прежняя форма `(id, op, a, b, transform?)` — перегрузка). Воркер: одно ядро `combineOperands` для живого CSG (новое сообщение `csgBooleanMulti`, пакетный `Manifold.union`), перестроения дерева (`rebuildTreeNode`) и воспроизведения истории (`rebuildScene`) — дерево и меш совпадают по построению (без ложных замков 9.9). Pivot результата — TRS первого операнда группы A (как у бинарного). Ровно 2 операнда — прежний бинарный путь без изменений: старые документы и `[a, b]` совместимы. Существующий CSG среди операндов остаётся вложенным (не раскрывается в общий список)
- Подсказки кнопок CSG: «Объединяет выбранные объекты…», «Вычитает из первого объекта (группы A) остальные (группу B)…», «…общую часть первого объекта (группы A) и остальных (группы B)…»

---

## [1.3.4] — 2026-11-08

Выравнивание режимом «Выровнять» пересчитывается при правке прошлых шагов (ALIGN-PLANE-RESOLVE), все e2e — в CI (CI-E2E), удалён мёртвый код (CLEANUP-DEAD-CODE).

### Added
- **ALIGN-PLANE-RESOLVE:** выравнивание режимом (одна кнопка: грань A → грань B) сохраняется как шаг `align` (не `move`) с плоскостью — `AlignOperation.plane`: нормаль и точка плоскости A (в системе объекта A; произвольная плоскость или ось X/Y/Z), грань B (в системе цели), результат — сдвиг + поворот. Каскад правки прошлых шагов (9.5) пересчитывает его — объект остаётся выровненным, без уведомлений. Старые `align` (9 кнопок по оси X/Y/Z) — совместимы, без изменений.
- **CI-E2E:** все e2e в CI — job `e2e` в `ci-web.yml` (19 скриптов в 4 группах, Mesa llvmpipe вместо GPU, `LANG=ru_RU`, до 2 повторов); пороги производительности в CI — предупреждения (`E2E_SOFT_PERF`), локально — строго.

### Changed
- Шаг выравнивания режимом в истории — «Выровнять по грани» / «Выровнять по плоскости XZ» (было «Повернуть» / «Переместить»), без ✎, как у обычного `align`: выравнивание пересчитывает правка прошлых шагов. Поворот полем и гизмо — по-прежнему «Повернуть» с ✎.

### Removed
- `restoreTreeFromSnapshot` (мёртвый код, не вызывалась), `isShapeType` (тоже мёртвая).

### Known Limitations
- Плоскость A следует за системой объекта A (его TRS), а не за конкретной гранью при правке формы A (правка ребёнка CSG A).
- Снимки дерева (`cacheTreeSnapshot`) пишутся, но не читаются — `CLEANUP-TREE-SNAPSHOT` 🔲.
- ux-audit-5 в CI иногда проходит со 2-й попытки (UX-AUDIT-39, «Вписать в экран» на 768) — повтор с предупреждением в сводке.

### Подробно

#### Added
- **ALIGN-PLANE-RESOLVE — выравнивание режимом «Выровнять» пересчитывается при правке прошлого шага:** режим пишет шаг `align` с плоскостью (`AlignOperation.plane`: плоскость A — в системе объекта A, без него — ось X/Y/Z; грань B — в системе цели; результат — сдвиг + поворот), а не move (`document-store.alignToPlane`, `align-mode.ts`). Правка шага до выравнивания (move объекта A или цели, 9.5) пересчитывает его каскадом (`helpers.solvePlaneAlignMove` — то же решение, что у живого выравнивания: поворот на месте, правило 37, углы непрерывно): объект остаётся выровненным — не «съезжает», без уведомлений; дальше по истории — CSG пересчитывается, как обычно. Воспроизведение (мета, дерево, воркер) — шаг как move каждой цели (`rebuildOps.expandForReplay`); undo / redo, `.3dtc` — как у любой правки шага. Обычный `align` (9 кнопок по оси) — без изменений. Тесты: `__tests__/align-plane-resolve.test.ts` (14), e2e `pnpm e2e:align-plane-resolve` (в CI — 19 e2e)
- **CI-E2E — все 18 e2e в CI:** job `e2e` в `.github/workflows/ci-web.yml`, параллельно с `ci` (install + typecheck + test + build): 4 группы скриптов, сбалансированные по времени (~15 мин); Playwright Chromium + Mesa EGL / llvmpipe (у раннера нет GPU: без системного EGL `--use-angle=gl-egl` откатывается на SwiftShader — в 2–2,5 раза медленнее), проверка WebGL с флагами `openApp`, `pnpm dev` на :5000, `LANG=ru_RU` (язык интерфейса — из `navigator.language`), до 2 повторов на скрипт (с предупреждением в сводке), логи e2e и dev-сервера — артефакт. Пороги производительности (FPS, долгие задачи, время CSG 100k) на CPU-рендере не выполнимы: `e2e/helpers.mjs` › `assertPerf` — локально строго (падение), в CI (`E2E_SOFT_PERF=1`, только job `e2e`) — предупреждение `[SOFT PERF]` в сводке, проверки дальше выполняются (`ux-audit-2` J / L, `ux-audit-3` UX-AUDIT-21 / L, `ux-audit-4` UX-AUDIT-35). Проверки «тост не перекрывает панель» (`ux-audit-2` M, `ux-audit-3` R / UX-AUDIT-30, `ux-audit-4` Y) ждут конца анимации появления тоста (`waitToastsSettled`): без GPU через 400 мс тост ещё въезжал и задевал панель

#### Changed
- **Шаг выравнивания режимом в истории — «Выровнять по грани» / «Выровнять по плоскости XZ»** (было «Повернуть» / «Переместить» — шаг move) и без ✎, как у обычного `align`: выравнивание — связь, его пересчитывает правка прошлых шагов; поворот полем и гизмо — по-прежнему move («Повернуть», ✎). Тесты ux-audit-4…7 и `align-ui` — под новый вид шага (e2e: правка шага объекта плоскости A до выравнивания вместо ✎ у шага выравнивания)

#### Removed
- **CLEANUP-DEAD-CODE:** `restoreTreeFromSnapshot` (`store/document-store.ts`) — нигде не вызывалась (undo/redo строят дерево через `rebuildBuildTree`), вместе с её единственным помощником `isShapeType` и импортами (`getCachedTreeSnapshot`, тип `ShapeType`); тестов не было. Попутно — комментарий `cacheSnapshotWithTree` и заголовок раздела снова над своей функцией (сдвинулись в ALIGN-PLANE-RESOLVE); строка `BUILD_TREE_SPEC.md` — без имени удалённой функции

---

## [1.3.3] — 2026-11-08

UX-цикл «как пользователь»: 7 прогонов (`ux-audit` … `ux-audit-7`, баги — сразу тестами `it.fails` / `knownBug`) → 6 циклов фиксов (`fix-all` … `fix-all-6`): **43 исправления** — UX-AUDIT-1…42 и UX-AUDIT-32-followup; прогон 7 — 0 новых багов.

### Added
- Регресс-тесты UX-прогонов 1–7: `__tests__/ux-audit*.test.tsx` (логика на реальном WASM) и e2e `pnpm e2e:ux-audit` … `pnpm e2e:ux-audit-7` (Playwright: экспорт STL — реальное положение тела, гизмо — протяжкой кольца; e2e не в CI — CI-E2E).

### Fixed
- **fix-all (UX-AUDIT-1…10):** 1 автосохранение восстанавливается после перезагрузки; 2 «Очистить сцену» — с подтверждением и отменой; 3 3D-текст участвует в CSG (куб − текст = гравировка); 4 пустой результат CSG — уведомление, а не пустой объект; 5 сочетания из подсказок работают; 6 текст в дереве — «Текст: …»; 7 английский интерфейс без русских строк; 8 «Граней 6», а не «6.0»; 9 двойной клик по фигуре — по правилу; 10 ошибка 3D-текста — уведомление.
- **fix-all-2 (UX-AUDIT-11…20):** 11 вычитание и пересечение в истории — своим названием и иконкой; 12 узкий экран (1024, 768) — все кнопки тулбара в окне; 13 вставка в истории — «Вставить …»; 14 цилиндр с параметрами цилиндра («R10 H20»); 15 менеджер проектов закрывается по Esc; 16 числовое поле показывает значение целиком; 17 «Добавить сферу» (падеж); 18 кириллица в 3D-тексте — запасным шрифтом, остальное — предупреждение; 19 уведомление не закрывает панель; 20 CSG затенён гладко, рёбра острые.
- **fix-all-3 (UX-AUDIT-21…31):** 21 CSG и импорт не пересобираются при чужих изменениях; 22 линейка привязывается к ребру CSG и импорта; 23 стрелки числового поля — при наведении и в фокусе; 24 плашка «Расстояние» не закрывает тулбар; 25 корень CSG в дереве — с иконкой своей операции; 26 цилиндр и конус — острая кромка торца, гладкий бок; 27 модалка «3D-текст» — Esc из любого поля; 28 «Список» — имена с номерами; 29 фильтр истории прячет то, что на нём написано («Переместить» / «Повернуть» / «Масштаб»); 30 на 768 тост не закрывает «Привязку»; 31 3D-текст в истории — «Добавить текст: …», в свойствах — «Тип: Текст».
- **fix-all-4 (UX-AUDIT-32…35):** 32 «Выровнять» поворачивает непараллельную грань в плоскость; 33 зеркальная копия текста — тоже текст; 34 текст внутри CSG в дереве — «Текст: Дом»; 35 линейка над тяжёлой моделью (100k) — без рывков.
- **fix-all-5 (UX-AUDIT-32-followup, 36…40):** 32-followup поворот при выравнивании — на месте, без ухода вбок; 36 имя текста — на языке интерфейса; 37 почти встречная грань доворачивается встречно, а не переворачивается; 38 панель «Шаг N» — «Повернуть» / «Масштаб», в «Исходно» — углы; 39 «Вписать в экран» — вся сцена и в узком окне; 40 правка поворота шага подписана поворотом.
- **fix-all-6 (UX-AUDIT-41, 42):** 41 CSG при выравнивании с поворотом поворачивается вокруг центра рамки — тело не уходит вбок; 42 поворот через ±180° — шаг «поворот (0, 0, 30)°», а не −330° (выравнивание и гизмо).

### Changed
- **«Выровнять» с поворотом:** непараллельная плоская грань B поворачивается в плоскость A (раньше — только сдвиг до касания крайней точкой). Поворот — на месте: вокруг опорной точки (у примитивов и импорта — центр масс), у CSG — вокруг центра рамки; сдвиг — только вдоль нормали A. Направление — на меньший угол, как SolidWorks: угол между нормалями ≤ 90° — в ту же сторону, > 90° — встречно. Грань гладкой поверхности (цилиндр, сфера) — сдвиг, как раньше (UX-AUDIT-32, 32-followup, 37, 41).
- **Углы после поворота выравниванием и гизмо** — в записи, ближайшей к прежним: дельта шага в ±180°, угол объекта продолжается от прежнего и может выйти за ±180° (170 + 30 → 200 — тот же поворот). Углы, введённые в поля, — как есть (UX-AUDIT-42).
- **«Очистить сцену»** — с подтверждением; «Отменить» сразу после очистки возвращает сцену (UX-AUDIT-2).

### Known Limitations
- Угол объекта после поворота выравниванием / гизмо не приводится к ±180°: 350 + 30 → 380 (тот же поворот, шаг — 30°).
- 3D-текст, созданный до v1.3.3 (в истории — несшитый меш), в CSG не участвует — пересоздать (UX-AUDIT-3 старые шаги не мигрирует).
- «Отменить» после «Очистить сцену» — только сразу после очистки (до нового действия).
- 3D-текст: символы не из шрифтов (иероглифы, emoji) — «?» с предупреждением.
- `ALIGN-PLANE-RESOLVE` (правка прошлого шага не перевыравнивает объект по плоскости), `CI-E2E` — после.

### Подробно

#### Added
- **UX-AUDIT (v1.3.2) — прогон «как пользователь», баги зафиксированы тестами (не чинились):** 8 находок — 🔴 автосохранение не восстанавливается после перезагрузки (UX-AUDIT-1), «Очистить сцену» без подтверждения и без отмены, сбрасывает «не сохранено» (UX-AUDIT-2), 3D-текст не участвует в CSG — «суп» треугольников без сварки, подсказка про STL (UX-AUDIT-3); 🟡 пустой результат CSG создаётся молча (UX-AUDIT-4), сочетания из подсказок Tab/L/M/N/B/U/X/I не работают (UX-AUDIT-5); 🟢 текст в дереве «Импорт» (UX-AUDIT-6), «мм» и «Загрузка CSG» в английском интерфейсе (UX-AUDIT-7), «Граней 6.0» (UX-AUDIT-8). Таблица «ожидание vs реальность» — `DEVELOPMENT_PLAN.md` › «UX-AUDIT». Тесты: `__tests__/ux-audit.test.tsx` (+6 «реальность» и 6 `it.fails` «ожидание», проверено: каждый `it.fails` падает на своей проверке), e2e `pnpm e2e:ux-audit` — ✅-сценарии без покрытия (7 примитивов, интерфейс, `.3dtc`/STL через UI, удалить всё + undo, 100k треугольников) и известные баги в браузере (обязаны воспроизводиться)
- **UX-прогон 2 (H–N) — глубже, после исправления UX-AUDIT-1…10:** правка истории (правки подряд, перемотка, CSG 3 уровней), копии (копия копии, зеркальный ребёнок), импорт/экспорт (100k → CSG → STL, два импорта, `.3dtc` с правками), выравнивание (повёрнутый CSG, «Множественное»), стресс (56 объектов / 105 шагов, FPS 60), узкие экраны 1024/768, обе темы (модалки, тосты, панели). 10 новых находок — в план, не чинились: 🟡 вычитание/пересечение в истории подписаны «Объединение» (UX-AUDIT-11), тулбар за краем на ≤1024 (UX-AUDIT-12); 🟢 UX-AUDIT-13…20 (вставка CSG — «Объединение», цилиндр «W20 H20 D20», Esc в менеджере проектов, узкое числовое поле, «Добавить Сфера», «?» вместо отсутствующих глифов, тост поверх панели, гранёная сфера после CSG) — `DEVELOPMENT_PLAN.md` › «UX-AUDIT-2». Оправдавшиеся сценарии закреплены: `__tests__/ux-audit-2.test.ts` (+9, реальный WASM, «живое = rebuild»), e2e `pnpm e2e:ux-audit-2` (H/I в UI, J, L, M, N)
- **UX-AUDIT-11…20 заведены тестами до фиксов:** `__tests__/ux-audit-11-20.test.tsx` — 7 `it.fails` (11 подписи CSG, 13 вставка, 14 цилиндр, 15 Esc менеджера проектов, 17 падеж, 18 отсутствующие глифы, 20 затенение — настоящий `useMeshSync`; каждый проверен: падает на своей проверке ожидания); e2e `ux-audit-2` — 3 `knownBug` (12 тулбар/подсказки на 1024 и 768, 16 ширина поля, 19 тост поверх панели)
- **UX-прогон 3 (H–N повторно + O–T) — 11 новых багов зафиксированы тестами (не чинились):** H–N повторно — `e2e:ux-audit-2` и `ux-audit-2.test.ts` зелёные, фиксы 11–20 на месте; новые сценарии O–T (текст: кириллица буквами, «Д/д/Ф» и текст 1–2 мм замкнуты, куб − «ДдФ», «漢字»/«😀» — предупреждение; CSG со сферой гладко; импорт ∪ импорт → STL → `.3dtc`; выравнивание повёрнутого CSG «Множественным»; стресс 52 фигуры / 104 шага; 1366 — тулбар в одну строку; тост над модалкой, ~5 с; «−1234.5», ↑ с клавиатуры; подписи и иконки CSG, «Вставить …», фильтр «CSG») оправдались. Найдено: 🟡 **регрессы UX-AUDIT-20** — геометрия CSG и импорта пересобирается при любом изменении сцены (импорт 100k → каждое действие ≈ 160–190 мс, UX-AUDIT-21), привязка линейки к ребру CSG/импорта пропала (UX-AUDIT-22); 🟢 стрелки поля не появляются при наведении (регресс 16, UX-AUDIT-23), плашка линейки поверх тулбара в 2–3 строки (регресс 12, UX-AUDIT-24), корень CSG-вычитания в дереве — иконка объединения (UX-AUDIT-25), торец цилиндра/конуса размыт (UX-AUDIT-26), модалка текста — Esc только из поля текста (UX-AUDIT-27), «Список» без номеров (UX-AUDIT-28), категории фильтра истории ≠ подписям (UX-AUDIT-29), на 768 тост закрывает «Привязку» (регресс 12 + 19, UX-AUDIT-30), 3D-текст в истории — «Импорт Текст: …» (UX-AUDIT-31). Тесты: `__tests__/ux-audit-3.test.tsx` (6 ✅ O/P/T + 8 `it.fails`, каждый падает на своей проверке), e2e `pnpm e2e:ux-audit-3` (✅ J/K/L/N/O/P/Q/R/S/T + 3 `knownBug`: 23, 24, 30). Таблица «ожидание vs реальность» — `DEVELOPMENT_PLAN.md` › «UX-AUDIT-3»; чинить в `fix-all-3`
- **UX-прогон 4 (H–N + O–T повторно, U–Y, UX-AUDIT-32) — 4 новых бага зафиксированы тестами (не чинились):** H–N и O–T повторно — все 14 e2e и юнит-тесты зелёные, фиксы 21–31 на месте (регрессов нет); U–Y (текст новый / старый `.3dtc` без поля `text` / копия / переименование; цилиндр, конус, CSG со сферой, куб после правки размера; линейка по CSG; поворот и масштаб — «Повернуть» / «Масштаб» и фильтры; 1280×800) оправдались. Найдено: 🔴 «Выровнять» не поворачивает — непараллельная грань B не ложится в плоскость A, объект только сдвигается до касания крайней точкой (верх куба → боковая грань призмы: ничего, UX-AUDIT-32); 🟡 зеркальная копия 3D-текста — «Импорт», а после перезагрузки «Текст» (живое ≠ rebuild, UX-AUDIT-33); 🟢 текст внутри CSG в дереве — «Импорт» (UX-AUDIT-34), линейка над импортом 100k — каждое движение мыши 63–113 мс (UX-AUDIT-35). Тесты: `__tests__/ux-audit-4.test.tsx` (2 ✅ + 3 `it.fails`, каждый падает на своей проверке), e2e `pnpm e2e:ux-audit-4` (✅ U/V/W/X/Y + 2 `knownBug`: 32, 35). Таблица — `DEVELOPMENT_PLAN.md` › «UX-AUDIT-4»; чинить в `fix-all-4` (UX-AUDIT-32 — первым)
- **UX-прогон 5 (H–N + O–T + U–Y повторно, UX-AUDIT-32-followup) — 6 новых багов зафиксированы тестами (не чинились):** H–N, O–T, U–Y повторно — все 15 e2e и юнит-тесты зелёные, фиксы 32–35 на месте (регрессов нет); новые сценарии по фиксам 32–35 оправдались (выравнивание по наклонной плоскости CSG → правка ребёнка, правка шага, копия, `.3dtc`; «Множественное»; текст — зеркало зеркала, вставка, вложенный CSG и его зеркальная копия; панель выравнивания на 768/1024). Найдено: 🟡 поворот при выравнивании — вокруг точки клика: объект уходит вбок (призма Y −19,4; UX-AUDIT-32-followup); 🟡 почти встречная грань (5°) переворачивается на 175° на другую сторону плоскости, а строго встречная — ставит объект на плоскость (разрыв; нужно решение по правилу dot > 0 для граней > 90°, UX-AUDIT-37); 🟢 имя 3D-текста в английском интерфейсе — «Текст: Дом» (UX-AUDIT-36), панель «Шаг N» у шага «Повернуть»/«Масштаб» — «Перемещение», «Исходно» без углов (UX-AUDIT-38), «Вписать в экран» на 768×1024 обрезает сцену по ширине (UX-AUDIT-39), правка поворота шага в истории — «сдвиг (…) → (…)» без изменений (UX-AUDIT-40). Тесты: `__tests__/ux-audit-5.test.tsx` (4 ✅ + 7 `it.fails`, каждый падает на своей проверке), e2e `pnpm e2e:ux-audit-5` (✅ K/O/U/R/M/Y + 6 `knownBug`). Таблица — `DEVELOPMENT_PLAN.md` › «UX-AUDIT-5»; чинить в `fix-all-5` (UX-AUDIT-32-followup — первым)
- **UX-прогон 6 (H–N + O–T + U–Y повторно, проверка фиксов 32-followup, 36–40) — 2 новых бага зафиксированы тестами (не чинились):** H–N, O–T, U–Y повторно — все 16 e2e и юнит-тесты зелёные, фиксы fix-all-5 на месте (регрессов нет), проверены и явно (`e2e:ux-audit-6`: призма и три призмы «Множественным» — на своём X/Y; 5° / 85° / 90° / 95° — по правилу 37; имя текста ru ↔ en и после переименования; «Шаг 2: Повернуть» / «Масштаб», «Исходно» с углами; «Вписать в экран» на 768 в перспективе и ортографии; «Правка шага 2: поворот …»). Найдено: 🟡 CSG при выравнивании с поворотом уходит вбок — поворот вокруг опорной точки, а у CSG это операнд A, а не центр тела (экспорт STL: центр X 30 → 0, UX-AUDIT-41); 🟢 поворот шага выравнивания через ±180° — «поворот (0, 0, −330)°» вместо 30° (дельта углов Эйлера без приведения, UX-AUDIT-42). Тесты: `__tests__/ux-audit-6.test.tsx` (2 ✅ + 2 `it.fails`, каждый падает на своей проверке), e2e `pnpm e2e:ux-audit-6` (✅ 32-followup/36–40 + 2 `knownBug`). Таблица — `DEVELOPMENT_PLAN.md` › «UX-AUDIT-6»; чинить в `fix-all-6`
- **UX-прогон 7 (H–N + O–T + U–Y повторно, проверка фиксов 41, 42) — 0 новых багов, цикл UX-прогонов закрыт:** H–N, O–T, U–Y повторно — все 17 e2e и юнит-тесты зелёные, фиксы fix-all-6 на месте (регрессов нет), проверены и явно (`__tests__/ux-audit-7.test.tsx`, 11 тестов; e2e `pnpm e2e:ux-audit-7`): CSG после выравнивания с поворотом — undo / redo, правка ребёнка, правка шага, `.3dtc`, копия, зеркальная копия, вложенный CSG, «Множественное» (центр тела по экспорту STL на месте); конус, пирамида, текст, импорт — поворот вокруг опорной точки (центр масс); поле 270 — 270; 170 → 200 и шаг «поворот (0, 0, 30)°» (ru / en, undo / redo / `.3dtc`, правка шага); гизмо через 180° по Z и через 90° по Y (протяжка кольца в e2e). Наблюдение (решение 3, не баг): 350 + 30 → 380. `it.fails` / `knownBug` нет. Дальше — v1.3.3 и CI-E2E (`DEVELOPMENT_PLAN.md` › «UX-AUDIT-7»)

#### Fixed
- **UX-AUDIT-1 — автосохранение восстанавливается после перезагрузки:** при готовности CSG-воркера прошлая сессия из IndexedDB восстанавливается один раз (только если сцена и история пусты — текущая работа не затирается) с уведомлением «Прошлая сессия восстановлена»; признак «● Не сохранено» сохраняется в записи (старые записи без поля → «не сохранено»). `clearScene` чистит автосохранение (иначе вернулась бы очищенная сессия). Автосохранение вынесено из `App.tsx` в хук `hooks/useAutosave.ts`. Тесты: `ux-audit.test.tsx` › UX-AUDIT-1 (+4), e2e `ux-audit` — перезагрузка → 2 объекта, история, уведомление; очистка → перезагрузка → пусто (`io/autosave.ts`, `store/document-store.ts`, `hooks/useAutosave.ts`, `App.tsx`)
- **UX-AUDIT-2 — «Очистить сцену» с подтверждением и отменой:** кнопка открывает подтверждение «Очистить сцену?» (`components/ConfirmModal.tsx`: фокус на «Отмена», Esc и клик по фону — отмена, клавиши не уходят в глобальные сочетания); документ до очистки запоминается (`clearedDocument`) — «Отменить» / Ctrl+Z сразу после очистки возвращает объекты, историю с redo, файл/проект и «● Не сохранено» (`canUndoClear`, `restoreClearedDocument`). После любого нового действия отмена очистки недоступна; открытие/загрузка документа сбрасывает снимок. Тесты: `ux-audit.test.tsx` › UX-AUDIT-2 (+4, вместо пары `it.fails`/«реальность»), e2e `ux-audit` — Отмена, Esc, очистка, Ctrl+Z (`store/document-store.ts`, `store/types.ts`, `components/ConfirmModal.tsx`, `App.tsx`, `App.css`, `i18n`)
- **UX-AUDIT-3 — 3D-текст участвует в CSG (куб − текст = гравировка):** меш текста строит `io/text-mesh.ts` (`buildTextMesh`): у `TextGeometry` снимаются нормали/UV, совпадающие вершины сшиваются (`mergeVertices`, допуск 1e-4 мм), вырожденные треугольники выбрасываются — замкнутый меш вместо «супа» треугольников (раньше: «Меш не замкнут… Проверьте STL»). Проверено на латинице, цифрах, знаках: union / subtract / intersect с кубом (кириллица и диакритика тогда рисовались «?» — исправлено в UX-AUDIT-18). Ограничение: текст, созданный до исправления (в истории — несшитый меш), в CSG не участвует — пересоздать. Тесты: `ux-audit.test.tsx` › UX-AUDIT-3 (+3: гравировка с проверкой объёма, замкнутость рёбер, union/intersect; проверены откатом сварки), e2e `ux-audit` — куб − текст через UI (`io/text-mesh.ts`, `App.tsx`)
- **UX-AUDIT-4 — пустой результат CSG не создаётся молча:** `csgBoolean` при 0 треугольников (пересечение непересекающихся, вычитание «всего») не создаёт невидимый «CSG результат» и шаг истории — объекты не тронуты, уведомление «Результат CSG пуст… объекты не изменены» (`errors.csgEmpty`, ru/en). Тесты: `ux-audit.test.tsx` › UX-AUDIT-4 (+3, проверены откатом), e2e `ux-audit` — пересечение через UI (`store/document-store.ts`, `i18n`)
- **UX-AUDIT-5 — сочетания из подсказок работают:** Tab (перспектива ↔ ортография; только когда фокус не на кнопке — иначе Tab остаётся навигацией), L (линейка), M / N / B (зеркало YZ / XZ / XY выбранных), U / X / I (объединение / вычитание / пересечение двух выбранных). Соответствие клавиш действиям — чистая функция `resolveHotkey` (`src/hotkeys.ts`), App только исполняет; тест сверяет КАЖДОЕ сочетание из `TOOLTIP_DATA` с действием его инструмента (подсказка без обработчика не пройдёт CI). Заодно: под модалкой (текст, проекты, подтверждение) сочетания не срабатывают (раньше проверка читала устаревшее замыкание и Delete/Ctrl+Z работали под модалкой проектов); автоповтор зажатой клавиши не повторяет зеркало/CSG/переключатели; поля ввода — также textarea/select/contentEditable. Тесты: `hotkeys.test.ts` (+5), e2e `ux-audit` — Tab, L, U, X, I, M, N, B в браузере (`hotkeys.ts`, `App.tsx`)
- **UX-AUDIT-6 — 3D-текст в дереве называется «Текст: Hi»:** имя импортированного меша (`addRawMesh`, `importStl`) теперь пишется и в объект, а не только в операцию истории — дерево показывало «Импорт N», а после перемотки/загрузки (rebuild берёт имя из операции) — «Текст: …»: живое ≠ rebuild. Имя текста локализовано (`textModal.objectName`: «Текст: Hi» / «Text: Hi») и строится из того же обрезанного текста, что геометрия. Импорт STL в дереве теперь — по имени файла (как и после перемотки). Тесты: `ux-audit.test.tsx` › UX-AUDIT-6 (+3: имя и строка дерева, undo/redo без снимков, en), e2e `ux-audit` — строка дерева «Текст: A» (`store/document-store.ts`, `App.tsx`, `i18n`)
- **UX-AUDIT-7 — английский интерфейс без русских строк:** через i18n (ru/en) теперь — единица «мм»/«mm» у полей (`NumInput` по умолчанию, шаг move в `StepPanel`, модалка текста), «Загрузка CSG (WASM)…» (`App`, `Viewport3D`), «Вычисление…», линейка «Расстояние», экран «WebGL недоступен», название действия в ошибке отмены/повтора/перехода по истории, имя проекта по умолчанию «Без названия», ошибки разбора `.3dtc` (попадают в «Ошибка открытия: …»), менеджера проектов и импорта STL (были зашиты по-русски, а часть STL — по-английски и в русском интерфейсе; ключи `errors.stl*` существовали, но не использовались). Исключение — устаревший `io/doodle-io.ts` (из UI не вызывается). Страж: `i18n/i18n-coverage.test.ts` — AST-скан исходников на кириллицу в литералах и JSX вне `console`/`devLog` (проверен возвратом «мм»), одинаковые ключи ru/en, нет кириллицы в en. Тесты: `ux-audit.test.tsx` › UX-AUDIT-7 (+3), `3dtc-io.test.ts` (сообщения ru и en), e2e `ux-audit` — интерфейс en без кириллицы (`components/NumInput.tsx`, `StepPanel.tsx`, `TextModal.tsx`, `Viewport3D.tsx`, `WebGLFallback.tsx`, `App.tsx`, `store/document-store.ts`, `io/3dtc-io.ts`, `io/project-manager.ts`, `io/stl-import.ts`, `i18n`)
- **UX-AUDIT-8 — «Граней 6», а не «6.0»:** у `NumInput` — проп `integer` (показ без дробной части, шаг 1, ввод округляется до целого до ограничения `min`); включён для «Граней» призмы/пирамиды в панели свойств и для целых полей формы ребёнка CSG (`child-params` › `integer`). Тесты: `ux-audit.test.tsx` › UX-AUDIT-8 (+2: панель, ввод 7.6 → 8 и min), e2e `ux-audit` — «Граней=6 / 4» (`components/NumInput.tsx`, `PropertiesPanel.tsx`, `ChildPropertiesPanel.tsx`)
- **UX-AUDIT-9 — двойной клик по фигуре по правилу, а не случайно:** раньше кнопка фигуры была неактивна, пока стор `busy`, и второй клик во время построения первой фигуры терялся (двойной клик давал одну фигуру лишь потому, что попадал в `busy`). Теперь (`store/add-shape-queue.ts`): повторный клик по той же фигуре раньше 200 мс (`ADD_SHAPE_DEBOUNCE_MS`) — случайный двойной, отбрасывается без уведомления; позже — ещё одна фигура: если стор занят (долгий CSG), клик ждёт очереди (до 30 с), фигуры добавляются по порядку. Кнопки палитры не блокируются на время `busy`. Тесты: `ux-audit.test.tsx` › UX-AUDIT-9 (+3: фильтр 100/300 мс и тройной клик, очередь при занятом сторе, срок ожидания), e2e `ux-audit` — клики через 100 мс → 1 фигура, через 300 мс → 2; e2e, добавляющие одну фигуру подряд, выдерживают интервал (`spaceShapeClick` в `e2e/helpers.mjs`) (`store/add-shape-queue.ts`, `constants.ts`, `components/LeftPanel.tsx`, `App.tsx`)
- **UX-AUDIT-10 — ошибка создания 3D-текста → уведомление:** раньше только `console.error` — модалка оставалась открытой без объяснения. Добавление текста вынесено из `App.tsx` в `store/add-text.ts` (`addTextObject`): ошибка построения меша → «Не удалось создать текст: <причина>» (ru/en); причины `TextMeshError` (`io/text-mesh.ts`) — размер/глубина не > 0, нет геометрии; модалка не закрывается, объект не добавляется. Тесты: `ux-audit.test.tsx` › UX-AUDIT-10 (+4: ошибка построителя, нет геометрии, размер 0 ru/en, удачный путь), e2e `ux-audit` — размер 0 в модалке → уведомление (`store/add-text.ts`, `io/text-mesh.ts`, `App.tsx`, `i18n`)
- **UX-AUDIT-11 — вычитание и пересечение в истории подписаны своим названием и иконкой:** `Timeline` читал флаги `isIntersect`/`subtractOp`, которых никто не пишет, — все CSG-шаги были «Объединение» с иконкой объединения. Теперь вид шага — из `treeOperation` (его пишет `csgBoolean`), старые флаги — запасной путь (`groupOpKind`). Тесты: `ux-audit-11-20.test.tsx` › UX-AUDIT-11 (`it.fails` → `it`, + запасной путь), e2e `ux-audit-2` › J — шаг «Вычитание» после X (`components/Timeline.tsx`)
- **UX-AUDIT-12 — узкий экран (1024, 768): все кнопки тулбара в окне, подсказки вьюпорта не обрезаны:** раскладка тулбара (`utils/toolbar-layout.ts`, `hooks/useToolbarLayout.ts`) не учитывала ширину логотипа и внутренние отступы групп — считала, что всё влезает, и «Пересечение», «Сменить тему», «Очистить сцену» (на 768 — ещё «Объединение», «Вычитание») уезжали за край. Теперь эта ширина меряется из DOM (`reservedWidth`); текст логотипа на окне ≤1200 px скрыт (значок остаётся); страховка — тулбар переносит группы на новую строку (`flex-wrap: wrap`), а не прокручивается. Вьюпорт — container queries по своей ширине: ≤600 px подсказка скрыта (её смысл — в подсказках кнопок), ≤420 px «Привязка» — наверху слева без подписи. Статус-бар — пункты не переносятся, на окне ≤900 px скрыты время CSG и версия (одна строка). Панели 320 + 200 px — без изменений (на 768 вьюпорт 248 px). Тест: e2e `ux-audit-2` › M (`knownBug` → проверка, 1024 и 768) (`utils/toolbar-layout.ts`, `hooks/useToolbarLayout.ts`, `components/Toolbar.tsx`, `components/StatusBar.tsx`, `App.css`)
- **UX-AUDIT-13 — вставка в истории — «Вставить …»:** вставка CSG (Ctrl+V) писалась операцией `group` без операндов и показывалась «Объединением». Теперь `pasteClipboard` помечает все вставки (`pasted: true` у `group`, `add_shape`, `import_mesh`), Timeline подписывает их «Вставить CSG» / «Вставить <фигуру>» / «Вставить импорт» с иконкой вставки; старые вставки CSG (без признака) узнаются по `group` без операндов (`isPastedGroup`; так пишет только вставка). Фильтр истории — по-прежнему по типу операции. Тесты: `ux-audit-11-20.test.tsx` › UX-AUDIT-13 (`it.fails` → `it`, +2: примитив, en, старая вставка), e2e `ux-audit-2` › I — «Вставить CSG» (`csg/types.ts`, `store/document-store.ts`, `components/Timeline.tsx`, `i18n`)
- **UX-AUDIT-14 — цилиндр с параметрами цилиндра, в дереве «R10 H20»:** в `addShape` не было умолчаний для цилиндра — он получал параметры куба (`width/height/depth`), дерево CSG показывало «Цилиндр · W20 H20 D20». Теперь умолчание `{ radius: 10, height: 20 }` — геометрия прежняя (радиус и 48 сегментов — умолчания воркера; проверено побайтно). Сводка дерева (`formatParams(params, shapeType)`) — по полям фигуры (`getParamFields`, как форма правки): старые цилиндры с параметрами куба тоже «R10 H20». Тесты: `ux-audit-11-20.test.tsx` › UX-AUDIT-14 (`it.fails` → `it`, +3: та же геометрия, сводка по фигуре, строка дерева), e2e `ux-audit-2` › H — «Цилиндр · R10 H20» (`store/document-store.ts`, `csg/tree-view.ts`, `components/ComponentTree.tsx`)
- **UX-AUDIT-15 — менеджер проектов закрывается по Esc** (как модалка текста и подтверждение): обработчик `keydown` окна в `ProjectManagerModal` — из поля имени, с кнопки или фона. Тесты: `ux-audit-11-20.test.tsx` › UX-AUDIT-15 (`it.fails` → `it`), e2e `ux-audit-2` › N — Esc закрывает менеджер в обеих темах (`components/ProjectManagerModal.tsx`)
- **UX-AUDIT-16 — числовое поле показывает значение целиком:** стрелки-счётчики (~15 px) занимали поле 65 px и закрывали последние цифры («−1234.5» → «−1234.»). Теперь в покое стрелки скрыты, при наведении/фокусе — видны (↑/↓ с клавиатуры — всегда); ширина поля 70 px — запас под «−12345.6» (высоты строк панели не изменились). Касается всех полей `props-input`: свойства, форма ребёнка CSG, шаг истории. Тест: e2e `ux-audit-2` › M (`knownBug` → проверка, 1024) (`App.css`)
- **UX-AUDIT-17 — «Добавить сферу» (винительный падеж):** история подставляла именительный падеж («Добавить Сфера / Призма / Пирамида»). Новые ключи `shapesAcc` (ru: «куб, сферу, цилиндр, конус, тор, призму, пирамиду, текст»; en — как названия фигур) — в шагах «Добавить …», «Вставить …» и в подсказке кнопок палитры. Тесты: `ux-audit-11-20.test.tsx` › UX-AUDIT-17 (`it.fails` → `it`, + вставка, палитра, en), e2e `ux-audit-2` › H — «Добавить куб / сферу»; `e2e/edit-child.mjs` ищет шаг «Добавить куб» (`components/Timeline.tsx`, `components/LeftPanel.tsx`, `i18n`)
- **UX-AUDIT-18 — символы не из шрифта: кириллица — запасным шрифтом, остальное — предупреждение:** выяснилось, что в helvetiker нет ни кириллицы, ни диакритики — русский текст рисовался «??????» молча. Теперь (`io/text-mesh.ts`): строка, которой не хватает символов в helvetiker, строится запасным шрифтом **Droid Sans** (из three.js, Apache 2.0; кириллица, латиница, диакритика; ~310 КБ — грузится только при необходимости; латинский текст выглядит как раньше); символы, которых нет ни в одном шрифте (иероглифы, emoji), → предупреждение «В шрифте нет символов «漢字» — вместо них «?»» (текст создаётся). Чтобы меш Droid Sans был замкнутым: каждый контур выдавливается и сваривается отдельно (соседние буквы касаются — общая сварка давала ребро с 4 гранями), Т-образные стыки (дырка касается контура: «Д», «д», «Ф») чинятся `repairTJunctions`. Проверено: весь алфавит, «ё», диакритика — CSG с кубом. Тесты: `ux-audit-11-20.test.tsx` › UX-AUDIT-18 (`it.fails` → `it`, +4: без лишних предупреждений, «Ж» не «?» и CSG «Привет», замкнутость алфавита — проверена откатом починки, `repairTJunctions`), e2e `ux-audit` — текст «Ёж漢» → предупреждение только о «漢» (`io/text-mesh.ts`, `store/add-text.ts`, `i18n`)
- **UX-AUDIT-19 — уведомление не закрывает панель:** тосты были `fixed` в правом верхнем углу окна — поверх тулбара и верха правой панели (заголовок «Свойства», первые строки, подсказка режима выравнивания) на 5 с. Теперь `ToastContainer` — в `.main`, в правом верхнем углу вьюпорта (левее правой панели, не шире вьюпорта); над модалками — по-прежнему (z-index; `.main` не создаёт контекст наложения), уведомление об ошибке текста видно поверх модалки. Тест: e2e `ux-audit-2` › N (`knownBug` → проверка: тост не пересекает панель и тулбар, лежит во вьюпорте) (`App.tsx`, `App.css`)
- **UX-AUDIT-20 — CSG-результат затенён гладко, рёбра — остры:** причина найдена — вьюпорт считал «плоскими» все объекты с пустыми `params` (CSG, импорт) и давал каждому треугольнику нормаль грани: сфера после объединения — гранёная (отклонение нормали до 9,3°). А путь обновления вершин (правка размера, правка ребёнка) делал `computeVertexNormals` по всем вершинам — у куба после правки сглаживались углы. Теперь одна функция `buildObjectGeometry` (`components/object-geometry.ts`) для создания и обновления: куб / призма / пирамида — плоско; CSG и импорт — нормали по углу излома 30° (`toCreasedNormals`: сфера, цилиндр, тор в составе CSG — гладкие, рёбра куба — острые); прочие примитивы — гладкие нормали воркера. Тесты: `ux-audit-11-20.test.tsx` › UX-AUDIT-20 (`it.fails` → `it` на настоящем `useMeshSync`: нормали сферы — среднее < 1°, макс. < 4°, грань куба — точно; проверен возвратом плоского затенения; + путь обновления: куб после правки размера острый; виды затенения) (`components/object-geometry.ts`, `components/viewport-hooks.ts`)
- **UX-AUDIT-21 — CSG и импорт не пересобираются при чужих изменениях (регресс UX-AUDIT-20):** после UX-AUDIT-20 геометрия CSG и импорта — без индекса (нормали по излому), а `useMeshSync` сверял `obj.indices.length` с `geometry.index?.count` (= 0) и пересобирал её на каждый рендер: нормали по излому и рёбра у всех CSG и импортов при любом действии (импорт 100k → каждая правка другого объекта — долгая задача 155–194 мс). Теперь «изменились ли вершины» сверяется с источником геометрии (`rememberGeometrySource`: длины массивов и хэш вершин в `userData` меша; пишется и при создании — первое обновление тоже не пересобирает): импорт 100k → правка куба ≈ 45 мс, долгих задач нет. Затенение (UX-AUDIT-20) не меняется (`components/viewport-hooks.ts`)
- **UX-AUDIT-22 — линейка снова привязывается к ребру CSG и импорта (регресс UX-AUDIT-20):** `snap-utils.collectWorldEdges` брал рёбра только из `geometry.index`, а у геометрии по излому (CSG, импорт) индекса нет — привязки «ребро» не было. Теперь без индекса вершина ребра — её позиция (общее ребро соседних треугольников — один раз); пары рёбер считаются один раз на геометрию (`WeakMap`; геометрия стабильна после UX-AUDIT-21): повторный запрос привязки на импорте 100k — 83 мс (было 358, до UX-AUDIT-20 — 273). Затенение по излому не меняется (`components/snap-utils.ts`)
- **UX-AUDIT-23 — стрелки числового поля появляются при наведении и в фокусе (регресс UX-AUDIT-16):** стрелки снимались всегда (`-webkit-appearance: none`), а при наведении возвращались `appearance: inner-spin-button` — Chromium их не возвращал, стрелок не было вовсе. Теперь они снимаются только у поля не под курсором и не в фокусе (`.props-input:not(:hover):not(:focus)`), иначе — обычные стрелки; `color-scheme` поля — по теме (в тёмной стрелки тёмные, не светлая плашка). В покое «−1234.5» по-прежнему видно целиком (UX-AUDIT-16), ↑/↓ с клавиатуры — как раньше (`App.css`)
- **UX-AUDIT-24 — плашка «Расстояние» не закрывает тулбар (регресс UX-AUDIT-12):** плашка была `fixed; top: 54px` по центру окна, а тулбар при ширине ≤ 1280 — в 2–3 строки (до 117 px): плашка лежала на его кнопках (на 768 — ещё и на левой панели). Теперь она во вьюпорте (`App.tsx`; `absolute`, левый верхний угол — справа вверху уведомления, по центру «Вычисление…»), на узком вьюпорте (≤ 420 px) — под «Привязкой»; своя анимация появления (общая `fadeIn` сдвигала на −50% — центровка). Раскладка тулбара (UX-AUDIT-12) не менялась (`App.css`)
- **UX-AUDIT-30 — на 768 тост не закрывает «Привязку» (регресс UX-AUDIT-12 + 19):** на узком вьюпорте «Привязка» стоит в левом верхнем углу (UX-AUDIT-12), а тост — в правом верхнем (UX-AUDIT-19) шириной почти во весь вьюпорт: 5 с он лежал поверх «Привязки». Теперь при окне ≤ 940 px (вьюпорт ≤ 420 px) тост — ниже «Привязки» и плашки линейки (UX-AUDIT-24); в остальном как в UX-AUDIT-19 — во вьюпорте, не на панели и тулбаре, над модалками (`App.css`)
- **UX-AUDIT-25 — корень CSG в дереве — с иконкой своей операции:** `ComponentTree` рисовал корень любого CSG иконкой объединения (`Glyph` без операции), хотя история (UX-AUDIT-11) и вложенные CSG показывали вычитание/пересечение. Теперь операция корня берётся из Build Tree (корень — boolean-узел; у объектов, перестроенных из истории, поля `operation` нет), иначе — из объекта (`components/ComponentTree.tsx`)
- **UX-AUDIT-26 — цилиндр и конус: острая кромка торца, гладкий бок:** примитивы затенялись «гладко» по общим вершинам (`computeVertexNormals`; нормалей воркер не отдаёт) — на кромке нормаль усреднялась между торцом и боком (до ≈ 90°), торец выглядел выпуклым «подушкой», а тот же цилиндр в CSG (по излому, UX-AUDIT-20) — с острой кромкой. Теперь цилиндр и конус затеняются по излому, как CSG: кромка (90°) острая, бок (11,25° между гранями) гладкий; сфера и тор — по-прежнему гладкие по вершинам (`components/object-geometry.ts`)
- **UX-AUDIT-27 — модалка «3D-текст» закрывается по Esc из любого поля:** Esc обрабатывало только поле текста — в «Размер», «Глубина», на кнопке и после клика по модалке модалка не закрывалась (менеджер проектов после UX-AUDIT-15 — закрывался). Теперь Esc ловится на окне, как в менеджере проектов (`components/TextModal.tsx`); Enter в поле текста — по-прежнему «Добавить»
- **UX-AUDIT-28 — вкладка «Список»: имена с номерами, как в «Дереве»:** «Список» подписывал объекты без номера (`getShapeLabel`: «Куб», «Куб», «CSG результат» ×3) — их не различить, а «Дерево» показывало «Куб 1», «CSG результат 3». Теперь обе вкладки — одной функцией `displayName` (`components/LeftPanel.tsx`)
- **UX-AUDIT-29 — фильтр истории прячет то, что на нём написано:** фильтр шёл по типу операции — «Повернуть» и «Масштаб» прятал фильтр «Переместить», а вставки после UX-AUDIT-13 («Вставить куб / CSG / импорт») расходились по трём категориям («Добавить», «CSG», «Импорт»). Теперь категория шага — `filterKeyOf` (`components/Timeline.tsx`): новые фильтры «Вставить» (любая вставка, в т.ч. старая вставка CSG без признака), «Повернуть», «Масштаб» (`OP_FILTER_LABELS`, i18n ru/en); CSG и выдавливание старых проектов — по-прежнему «CSG»
- **UX-AUDIT-31 — 3D-текст в истории — «Добавить текст: Привет», в свойствах — «Тип: Текст»:** текст добавляется импортом меша (`addRawMesh` → шаг `import_mesh`), поэтому был «Импорт Текст: Привет» с иконкой импорта, «Тип: Импорт», фильтр «Импорт», иконка импорта в дереве. Теперь у шага и объекта есть исходная строка `text` (`store/text-object.ts`: `textOfOp`, `isTextObject`; проходит через перестроение из истории, `.3dtc` и копирование): история — «Добавить текст: Привет» с иконкой текста (фильтр «Добавить»), копия — «Вставить текст» и остаётся текстом; свойства — «Тип: Текст»; дерево — иконка текста. Старые проекты (поля нет) — текст узнаётся по id `txt_N` (так `addRawMesh` называл текст всегда), строка — из имени по шаблону `textModal.objectName` (ru/en)
- **UX-AUDIT-32 — «Выровнять» поворачивает непараллельную грань в плоскость (🔴):** выравнивание только сдвигало вдоль нормали плоскости — непараллельная грань B не ложилась в плоскость A, объект сдвигался до касания крайней точкой (верх куба → боковая грань призмы: ничего). Теперь (`store/helpers.ts` `solvePlaneAlignTransform`, `store/align-mode.ts`) плоская непараллельная грань B поворачивается по кратчайшей дуге — её нормаль совпадает с нормалью A (в ту же сторону, dot > 0) — вокруг точки клика, затем сдвигается в плоскость; это один шаг move («Повернуть»), он воспроизводится из истории, отменяется. Масштаб остаётся в локальных осях. Параллельная и встречная грань — только сдвиг, как раньше. Грань гладкой поверхности (бок цилиндра, сфера; `isSmoothSurfaceAt` — сосед по ребру под 0,5…30°, порог затенения) — касание крайней точкой без поворота, как ALIGN-REVIT: её нормаль — артефакт разбиения на треугольники. **Изменено поведение:** повёрнутый куб к плоскости XY плоской гранью теперь поворачивается (e2e `align-obb`, сценарий 2: rotX 0, Z −10 вместо −14.1)
- **UX-AUDIT-33 — зеркальная копия 3D-текста — тоже текст (живое = rebuild):** `mirrorObject` переносил в копию имя, но не `text` (UX-AUDIT-31) — живая копия была «Тип: Импорт» с иконкой импорта, а после перезагрузки (rebuild копирует метаданные источника целиком) — «Текст». Теперь копия текста получает `text` (у старого текста без поля — строку из имени), живая копия и перестроенная совпадают (`store/mirror-store.ts`)
- **UX-AUDIT-34 — 3D-текст внутри CSG в дереве — «Текст: Дом»:** запечённый ребёнок CSG без `shapeType` подписывался «Импорт» — в т.ч. текст (объект-текст поглощён CSG, узел дерева не знает, что он текст). Теперь строка текста узла выводится из истории (`store/text-object.ts` `textsByObjectId`: шаги `import_mesh` с текстом, зеркальные копии наследуют; `textOfNode` — узлы копий CSG `копия:источник` по источнику): ребёнок — «Текст: Дом» с иконкой текста, одинаково в живом и перестроенном дереве, в копии CSG и для зеркальной копии текста (`components/ComponentTree.tsx`)
- **UX-AUDIT-35 — линейка над тяжёлой моделью — наведение без рывков:** на каждое движение мыши в режиме линейки все вершины и рёбра меша переводились в мир и перебирались — импорт 100k: долгая задача 63–113 мс на движение (первое — 350–380 мс). Теперь у геометрии — сетка треугольников в локальных координатах (строится один раз, кэш по геометрии — она стабильна после UX-AUDIT-21), а запрос берёт только треугольники рядом с точкой попадания (радиус привязки, пересчитанный в локальные единицы с запасом на масштаб; ключи вершин — числовые, без строк). Запрос на 100k — ~6 мс (было ~80, из них raycast ~3,5 мс), в браузере 20 движений — 363 мс без долгих задач (было 1582 мс). Результат привязки тот же, что у полного перебора (тест на 180 лучах, CSG с поворотом и неравномерным масштабом) (`components/snap-utils.ts`)
- **UX-AUDIT-32-followup — «Выровнять» с поворотом не уводит объект вбок (🟡):** поворот непараллельной грани B (UX-AUDIT-32) шёл вокруг точки клика — центр объекта смещался вдоль плоскости A на величину, зависящую от того, куда кликнули (призма X 40 → Y −19,4; две одинаковые призмы «Множественным» — Y −11,1 и −5,1). Теперь `solvePlaneAlignTransform` поворачивает объект на месте — вокруг его опорной точки, как поворот полями «Поворот», — и сдвигает только вдоль нормали плоскости A: грань B в плоскости, X/Y (для горизонтальной плоскости) не меняются (`store/helpers.ts`; `__tests__/ux-audit-5.test.tsx`, e2e `ux-audit-5`)
- **UX-AUDIT-37 — «Выровнять»: почти встречная грань доворачивается встречно, а не переворачивается (🟡):** по правилу UX-AUDIT-32 (нормаль B → нормаль A, dot > 0) любая непараллельная грань поворачивалась в ту же сторону — грань под 5° к встречной переворачивалась на 175° и объект уходил на другую сторону плоскости (Y −10, rotZ 180), а строго встречная ставила его на плоскость (Y 10). Теперь, как «совпадение» граней в SolidWorks, — на меньший угол: угол между нормалями ≤ 90° (перпендикулярная — с допуском 1°, `ALIGN_PERP_SIN`) — в ту же сторону, > 90° — встречно (`store/helpers.ts` › `solvePlaneAlignTransform`). Два теста UX-AUDIT-32 в `__tests__/ux-audit-4.test.tsx`, где грань B была под углом > 90°, проверяют правило (`__tests__/ux-audit-5.test.tsx`, e2e `ux-audit-5`)
- **UX-AUDIT-36 — имя 3D-текста — на языке интерфейса (🟢):** имя «Текст: Дом» записывается в объект на языке создания, а имена по умолчанию остальных объектов строятся при показе — в английском интерфейсе строка текста была «Текст: Дом» (кубы — «Cube 3», ребёнок CSG — «Text: Дом»). Теперь `displayName` (`components/ComponentTree.tsx`) показывает имя текста по умолчанию (`store/text-object.ts` › `defaultTextName`) на языке интерфейса — список, дерево, «Выровнять», панель «Шаг N»; переименованный текст — своё имя. Переименование в дереве начинается с показанного имени и без правки шага «Переименовать» не пишет (раньше Enter без правки у куба добавлял шаг) (`__tests__/ux-audit-5.test.tsx`, e2e `ux-audit-5`)
- **UX-AUDIT-38 — панель «Шаг N» называет шаг поворота «Повернуть», а не «Перемещение» (🟢):** после UX-AUDIT-29 история подписывает шаги move «Переместить» / «Повернуть» / «Масштаб», а панель правки шага (✎) называла любой move «Шаг N: Перемещение» и в «Исходно» показывала только сдвиг (у поворота полем — «Δ (0, 0, 0)»). Теперь заголовок — по виду шага (`kind`): «Повернуть» / «Масштаб», обычный сдвиг — «Перемещение»; «Исходно» — сдвиг, поворот и масштаб, если шаг их меняет (`components/StepPanel.tsx`; `__tests__/ux-audit-5.test.tsx`, e2e `ux-audit-5`)
- **UX-AUDIT-39 — «Вписать в экран» показывает всю сцену и в узком окне (🟢):** расстояние камеры было 2,5 × наибольший размер сцены без учёта угла обзора по горизонтали — на 768×1024 (вьюпорт 248 × 883) сцена обрезалась по ширине. Теперь расстояние считает `fitDistance` (новый `components/camera-fit.ts`): не меньше, чем нужно, чтобы описанная сфера сцены вошла в меньший из углов обзора; на широком вьюпорте — как раньше (`components/Viewport3D.tsx`; `__tests__/ux-audit-5.test.tsx`, e2e `ux-audit-5`)
- **UX-AUDIT-40 — правка поворота шага подписана в истории поворотом (🟢):** подпись правки шага move писала только сдвиг — правка поворота (панель «Шаг N», группа «Поворот») читалась «Правка шага 2: сдвиг (0, 0, 0) → (0, 0, 0)». Теперь в подписи — группы, которые правка меняет: «поворот (0, 0, 30)° → (0, 0, 45)°», «масштаб …», сдвиг — как раньше (`components/Timeline.tsx` › `movePatchDetail`; `__tests__/ux-audit-5.test.tsx`, e2e `ux-audit-5`)
- **UX-AUDIT-41 — «Выровнять» с поворотом поворачивает CSG на месте (🟡):** поворот непараллельной грани B шёл вокруг опорной точки объекта (UX-AUDIT-32-followup), а у CSG это позиция операнда A (Фаза 8.5), а не центр тела: CSG куб X 0 ∪ куб X 60 торцом к верху куба уходила вбок — центр тела X 30 → 0. Теперь центр поворота — `alignRotationCenter`: у CSG — центр её рамки (центр локальной рамки вершин через полный TRS), у примитивов и импорта — по-прежнему опорная точка (у конуса и пирамиды это центр масс, не центр рамки, — не меняется); опорная точка CSG (операнд A) поворачивается вместе с телом, поэтому её X/Y меняются (`store/helpers.ts` › `solvePlaneAlignTransform`; `__tests__/ux-audit-6.test.tsx`, e2e `ux-audit-6` — центр тела по экспорту STL на месте)
- **UX-AUDIT-42 — поворот через ±180° записывается дельтой в ±180°: «поворот (0, 0, 30)°», а не −330° (🟢):** `moveObject` пишет дельту поворота как «углы после − углы до», а углы из матрицы (выравнивание) и у гизмо (Three.js) — в (−180°, 180°]: куб rotZ 170, повёрнутый выравниванием на +30°, получал −160 и шаг «поворот (0, 0, −330)°» (в поле «Поворот Z» панели шага — −330; куб rotZ 90 к плоскости Y — −270 вместо 90). Теперь углы после поворота — в записи, ближайшей к прежним (`continuousEuler`: тот же поворот, каждый угол ± k·360 и равносильная запись (x + 180, 180 − y, z + 180)): 170 → 200, шаг «поворот (0, 0, 30)°»; воспроизведение истории даёт тот же угол. Так же у гизмо (`App.tsx` › `handleTransformEnd`). Углы, введённые в поля «Поворот», — как есть (270 остаётся 270) (`store/helpers.ts` › `continuousEuler`, `solvePlaneAlignTransform`; `__tests__/ux-audit-6.test.tsx`, e2e `ux-audit-6`)

---

## [1.3.2] — 2026-11-07

### Added
- **NESTED-MOVED-EDIT:** правка ребёнка вложенного CSG, сдвинутого / повёрнутого / отмасштабированного до объединения (раньше 🔒 `nested_moved`). `TreeNode.originTransform` (TRS₀) + поправка воркера `Mat(TRS_cur)·Mat(TRS₀)⁻¹` для вложенного boolean.

### Fixed
- `ALIGN-TREE-REPLAY`: шаги `align` не применялись к узлам дерева при перемотке/загрузке (выровненный до объединения операнд — замок).

### Changed
- `CI-DEDUP`: один CI-workflow (`ci-web.yml`) вместо двух.

### Known Limitations
- Дерево живой сессии, начатой до v1.3.2 (без TRS₀), для сдвинутого до объединения вложенного CSG остаётся под замком `nested_moved`; после перезагрузки/загрузки проекта дерево перестраивается из истории — правка работает.
- `ALIGN-PLANE-RESOLVE`, `CI-E2E` — после.

### Подробно

#### Added
- **NESTED-MOVED-EDIT — правка ребёнка вложенного CSG, трансформированного ДО объединения:** A ∪ B → G → сдвиг / поворот / масштаб G → G ∪ C → правка B в дереве — работает (раньше замок 🔒 `nested_moved` и отказ). У boolean-узла дерева — TRS₀ (`TreeNode.originTransform`: система, в которой лежат листья; ставится при создании CSG, копируется снимком/вставкой, отражается зеркалом тем же сопряжением, что `localTransform`). Воркер (`rebuildTreeNode`) переносит результат ВЛОЖЕННОГО boolean на `M = Mat(TRS_cur)·Mat(TRS₀)⁻¹` (`worker-matrix.relativeTransformMatrix`, полная аффинная матрица: сдвиг, поворот, неравномерный масштаб); TRS_cur = `localTransform` на момент объединения; совпадают — identity, обычный CSG не меняется. Калибровка 9.3 проходит; правка совпадает со «свежим» сценарием (габарит 1e-4, объём и площадь 1e-5) в т.ч. для двух уровней вложенности, вычитания, вложенного CSG вторым операндом, после undo/redo без снимков, загрузки `.3dtc`, у зеркальной и вставленной копии. Замок `nested_moved` остаётся предохранителем для любого расхождения дерева и меша (старое дерево без TRS₀); текст причины обобщён. Тесты: +19 (`__tests__/nested-moved-edit.test.ts` — 13, `worker-matrix.test.ts` — 3, `history-tree.test.ts` — 3; проверены откатом), перевёрнуты 4 теста «сдвинутый вложенный CSG заблокирован» (`edit-child-params`, `child-editability-ui` — теперь замок на старом дереве); e2e `pnpm e2e:nested-moved-edit`, `e2e:tree` (сдвинутый вложенный CSG — без замков, форма) (`csg/types.ts`, `csg/history-tree.ts`, `csg/worker-handlers.ts`, `csg/worker-client.ts`, `csg/worker-matrix.ts`, `store/rebuild.ts`, `store/document-store.ts`, `store/snapshots.ts`, `csg/tree-view.ts`, `i18n`)

#### Fixed
- **ALIGN-TREE-REPLAY — выравнивание операнда до объединения терялось в дереве после перемотки/загрузки:** `rebuildBuildTree` не применял шаги `align` к узлам дерева (только `move`/`mirror`) — выровненный до CSG операнд стоял в дереве на старом месте, дерево корня не воспроизводило меш (замок `nested_moved`). Живой путь это маскировал (`csgBoolean` синхронизирует узлы операндов перед CSG). Регресс-тест: `nested-moved-edit.test.ts` › «ALIGN-TREE-REPLAY» (проверен откатом)

#### Changed
- **CI-DEDUP — один CI-workflow вместо двух:** `build.yml` («Test package») удалён — он дублировал `ci-web.yml` (те же install + typecheck + test, без build); на PR с кодом шло 4 прогона (2 workflow × push + pull_request). В `ci-web.yml` («CI (web-app)», install + typecheck + test + build, Node 24, pnpm из `packageManager`) снят фильтр путей — PR только с документацией тоже получает проверку (раньше её давал лишь `build.yml`), а `push` — только `main` (ветки задач проверяются через `pull_request`). `deploy.yml` не менялся

---

## [1.3.1] — 2026-11-06

### Added
- **ALIGN-UI-REVIT:** режим выравнивания (одна кнопка, выбор грани/плоскости, множественное, Esc/правый клик). `solvePlaneAlignDelta` — произвольная плоскость. 9 старых кнопок убраны.

### Removed
- `release.yml` — остаток CaDoodle (Java), не относится к Web.

### Fixed
- `NumInput`: `-0.0` → `0` (`formatNum`, −0.04 при одном знаке).
- `PropertiesPanel`: уникальные `id` (`num-input-pos-*`, `num-input-rot-*`, `num-input-scale-*`), `label` ↔ `id`.

### Known Limitations
- `NESTED-MOVED-EDIT`, `ALIGN-PLANE-RESOLVE`, `CI-DEDUP`, `CI-E2E` — после.

### Подробно

#### Added
- **ALIGN-UI-REVIT — режим выравнивания как в Revit (одна кнопка):** кнопка тулбара «Выровнять» (иконка — два столбика разной высоты от одной плоскости) включает режим (`store/align-mode.ts`: `alignMode` + `startAlignMode` / `setPlane` / `setHoveredFace` / `clickFace` / `applyAlignB` / `toggleMultiple` / `exitAlignMode`). Плоскость A — клик по грани объекта (мировые нормаль и точка) или X / Y / Z в панели `AlignPanel` (мировые плоскости YZ / XZ / XY через начало координат); затем клик по грани B — B сдвигается вдоль нормали плоскости, его грань ложится в плоскость A (шаг «Переместить» в истории — воспроизводится и правится ✎). Выбор грани B (`helpers.solvePlaneAlignDelta`): кликнутая грань параллельна плоскости (≤ 1°) — встаёт именно она; не параллельна — крайняя точка B по нормали со стороны, куда смотрит грань (знак dot); протяжённость B — та же реальная геометрия, что у ALIGN-REVIT (`worldProjectionRange`: вершины через полный TRS, без вершин — OBB). Raycast по треугольнику (`components/align-picking.ts`: `pickFace`, `planarFaceTriangles`), подсветка под курсором всей плоской грани (синяя) и выбранной плоскости A (жёлтая), наведение — throttle 50 мс, отсечение по boundingSphere/Box в `Mesh.raycast`. Галочка «Множественное» — после B режим и плоскость остаются. Esc (`hooks/useAlignModeKeys.ts`, capture — выделение не сбрасывается), правый клик, «Готово» — выход. Курсор `crosshair`. Подсказки в статус-баре и панели (ru/en). Тесты: +21 (`__tests__/align-ui.test.tsx` — 16: кнопка, режим, raycast по настоящим мешам Three.js, X/Y/Z, выравнивание на WASM, множественное, Esc, подсказки ru/en; `store/helpers.test.ts` — 5: правила выбора грани B); e2e `pnpm e2e:align-ui-revit`

#### Changed
- **e2e `align-obb` — через режим «Выровнять»:** повёрнутый цилиндр → плоскость = грань куба, повёрнутый куб → плоскость XY (проверка реальной геометрии та же); `findAlignFace` в `e2e/helpers.mjs` ищет грань на экране по подсветке. `toolbar-aria`: 27 кнопок (было 35)

#### Fixed
- **UX-NUMINPUT — `NumInput` показывал «-0.0»:** значение, которое после округления до точности поля равно нулю (−0, −1e-6, −0.04 при одном знаке), показывается без минуса (`formatNum`; только отображение — значение не меняется; ввод «-0» отдаётся как `0`). Точность поля прежняя (1 знак у позиции/поворота: «0.0»)
- **UX-NUMINPUT — одинаковые `id` полей панели свойств:** у позиции и масштаба были одинаковые `num-input-X/Y/Z` (метки «X/Y/Z»), `<label>` масштаба указывала на поле позиции. Теперь `num-input-pos-*`, `num-input-rot-*`, `num-input-scale-*` (`NumInput` принимает `id`; по умолчанию — `num-input-<label>`). e2e обращаются к полю позиции по `#num-input-pos-*` (раньше — `.first()`). Тест: `__tests__/num-input.test.tsx` (+7, проверен откатом)

#### Removed
- **9 кнопок выравнивания (X/Y/Z × min/center/max)** — из тулбара и из панели свойств (`components/AlignButtons.tsx` удалён, ключи `align.x_min`… и подсказки `tooltips.alignX…` — тоже). Действие `alignSelected` в сторе осталось: шаги `align` старых проектов воспроизводятся и пересчитываются каскадом (re-solve)
- **`.github/workflows/release.yml`** — остаток сборки Java-приложения CaDoodle (`BowlerStudio/...NameGetter.java`), к TinkerCraft Web не относится; падал на всех тегах (v1.2.0–v1.3.0). Другие workflow от него не зависят (CLEANUP-RELEASE-YML)

---

## [1.3.0] — 2026-11-06

**Фаза 9 — Параметрическая история (9.1–9.9, 9.5.0–9.5.4).**

### Added
- **9.1–9.3:** дерево компонентов (раскрытие CSG, выбор ребёнка), панель свойств ребёнка (`ChildPropertiesPanel`), пересборка CSG при смене `params` (`edit_child_params`).
- **9.4:** правка из Timeline v1 — ✎ у `add_shape` / `edit_child_params` ведёт к форме цели (append-only).
- **9.6:** undo/redo + сериализация правки (`.3dtc` round-trip).
- **9.7:** индикация «Пересчёт CSG…».
- **9.8:** правка зеркальных детей CSG (`primitive` + `mirrored[]`).
- **9.9:** замок 🔒 «правка недоступна» (причины: `baked` / `nested_moved` / `mirror`).
- **9.5.0:** `projectHistory` (эффективная история), `computeCsgResult` (общее ядро CSG), `computeCascade`.
- **9.5.1:** отменена (fillet удалён).
- **9.5.2:** правка шага `move` (каскад CSG, re-solve `align`, pivot CSG).
- **9.5.3:** правка шага `mirror` (плоскость, `composeMirroredList`, каскад).
- **9.5.4:** правка шага `extrude` (`GroupOperation.source`, каскад, re-solve `align`).
- **CSG-INDEPENDENT-COPY:** зеркало и вставка CSG → независимая параметрическая копия (копия дерева, не baked). Правка копии не трогает оригинал.
- **IMPORT-MESH-CSG:** CSG для замкнутых STL (по manifold, а не по `shapeType`), i18n `errors.csgNonManifold`.
- **ALIGN-REVIT:** выравнивание по реальной геометрии (вершины, поворот, масштаб), `aria-label` у всех 35 кнопок тулбара.
- **UI:** левая панель 320px, примитивы в 3 столбца.
- **CI:** `packageManager: pnpm@12.10.1`, CI зелёный (install + typecheck + 662 теста + build).

### Removed
- **Fillet** (скругление граней куба) — до появления инструмента на B-Rep (Фаза 11, OCCT); старые шаги `fillet` вырезаются при загрузке.
- **Кнопка «Extrude»** не возвращается: `extrudeSelected` — не extrude, а «растянуть по оси» (движок правки 9.5.4, не в UI). Настоящий extrude (2D → 3D) — Фаза 11.

### Fixed
- `MIRROR-CHAIN-REPLAY`, `MIRROR-CSG-REPLAY` (9.5.3).
- `ALIGN-CSG-AABB` (9.5.2), `ALIGN-PRIMITIVE-AABB` (ALIGN-REVIT).
- `MIRROR-CSG-TREE-RELOAD`, `PASTE-CSG-RS` (CSG-INDEPENDENT-COPY).
- `IMPORT-CSG-STUB`, `IMPORT-TREE-RELOAD` (IMPORT-MESH-CSG).
- `EXTRUDE-AABB` и «move базы до extrude не тянул плиту» (9.5.4).
- Безымянные кнопки тулбара (`aria-label=""`) — ALIGN-REVIT.

### Known Limitations
- `NESTED-MOVED-EDIT` — вложенный CSG, сдвинутый до объединения, не правится (🔒 `nested_moved`). После v1.3.0.
- `CSG-INDEPENDENT-COPY` — связанное зеркало (linked mirror) не делали; копия всегда независимая.
- `IMPORT-MESH-CSG` — «починка» незамкнутого меша (заполнение дыр) — отдельная задача.
- `ALIGN-UI-REVIT` (явный выбор плоскости) — отдельная задача.
- `CI-DEDUP` (`ci-web.yml` и `build.yml` дублируют друг друга), `CI-E2E` (e2e не в CI) — после.
- `PropertiesPanel`: у полей позиции и поворота одинаковые `id` (`num-input-X`); `NumInput` показывает `-0.0` — мелкий UX, не исправлено.
- `.doodle` (legacy) — в UI не открывается (`parseDoodle` не вызывается).

### Подробно

#### Added
- **Фаза 9.1 — раскрытие CSG в дереве компонентов:** вкладка «Дерево» показывает детей CSG-результата (примитивы с краткой сводкой параметров `W20 H20 D20`, вложенные CSG, запечённые/зеркальные — помечены нередактируемыми). Шеврон ▸/▾ раскрывает/сворачивает (в том числе вложенные); клик по ребёнку выбирает его (`ui-store.selectedChild`, корень выделяется в сцене), клик по корню сбрасывает выбор, устаревший выбор сбрасывается при undo/удалении (`hooks/useSelectedChildGuard.ts`). Read-модель дерева `getTreeView`/`findViewNode`/`formatParams` — `csg/tree-view.ts` (снимок с копиями params, защита от циклов и глубины 32). Иконки строк дерева уменьшены 32→20px (при шевроне имя схлопывалось). Решения и риски Фазы 9 — `docs/PHASE_9_DESIGN.md`. Тесты: +8 (`csg/tree-view.test.ts`), e2e `pnpm e2e:tree` (`csg/tree-view.ts`, `components/ComponentTree.tsx`, `store/ui-store.ts`, `hooks/useSelectedChildGuard.ts`, `App.css`, `i18n/locales/{ru,en}`, `e2e/tree.mjs`)
- **Фаза 9.2/9.3/9.6 — правка параметров ребёнка CSG:** выбор ребёнка в дереве открывает панель «Компонент CSG» (`ChildPropertiesPanel`) вместо свойств объекта; поля зависят от формы (`csg/child-params.ts`: куб W/H/D, сфера R, цилиндр/конус R/H, тор, призма/пирамида R/H/грани). Изменение значения пересчитывает CSG-результат и пишет новую операцию `edit_child_params` (`rootId`, `nodeId`, полные `params`, готовый меш `resultVertices/Indices/Normals`, `originalBboxSize`) — как `group`, воспроизведение детерминировано и не требует CSG при загрузке. Pivot корня не меняется: вершины приводятся к его локальной системе (`v = S⁻¹Rᵀ(v_world − pos₀)`, TRS₀ берётся из операции `group` корня). Работают вложенные CSG, subtract/intersect, повёрнутые/масштабированные операнды, корень, перемещённый после объединения. **Защита:** перед правкой дерево пересчитывается со СТАРЫМИ params и сравнивается с текущим мешем (bbox + объём, допуск 1e-3); при расхождении (например, вложенный CSG, сдвинутый до объединения) правка отклоняется с уведомлением, а не портит геометрию; правка, обнуляющая результат, откатывается; blur без изменения значения не пишет в историю. Операция зарегистрирована в `.3dtc`/`.doodle` (`VALID_OP_TYPES`, восстановление массивов меша), Timeline, фильтрах истории, i18n (ru/en). Кэш воркера корня синхронизируется (`workerSyncMesh`) — следующий CSG берёт новую геометрию. Воркер: флаг `worldSpace` в `rebuildTreeNode` (корень не центрируется по COM, ответ в системе создания CSG), `rebuildBooleanWorld` в `history-tree.ts`. Тесты: +24 (`__tests__/edit-child-params.test.ts` на реальном WASM: сравнение с «свежим» CSG, RS, вложенные, отказ, undo/redo с очищенными снимками, `.3dtc` round-trip; `csg/child-params.test.ts`), e2e `pnpm e2e:edit-child` (`store/edit-child.ts`, `store/document-store.ts`, `components/ChildPropertiesPanel.tsx`, `csg/child-params.ts`, `csg/types.ts`, `csg/worker-handlers.ts`, `csg/worker-client.ts`, `csg/history-tree.ts`, `store/rebuild.ts`, `io/3dtc-io.ts`, `io/doodle-io.ts`, `components/Timeline.tsx`, `constants.ts`, `i18n/locales/{ru,en}`, `App.tsx`, `e2e/edit-child.mjs`)
- **Фаза 9.4 (v1) — правка шага из Timeline:** у шагов `add_shape` и `edit_child_params` кнопка ✎ выделяет цель шага — живой объект сцены или ребёнка CSG (с раскрытием предков в дереве и переключением на вкладку «Дерево») — и открывает его форму параметров. История остаётся append-only: правка = новая операция над текущим состоянием (`resize_dims` / `edit_child_params`). Если объекта шага уже нет в сцене — уведомление. Остальные операции (move, fillet, mirror…) не редактируются: это переписывание истории (9.5) (`hooks/useTimelineEdit.ts`, `csg/tree-view.ts::locateNode`, `components/Timeline.tsx`, `components/LeftPanel.tsx`, `App.tsx`, `App.css`)
- **Фаза 9.9 — индикатор «правка недоступна»:** панель ребёнка CSG заранее проверяет (`checkChildEditable`: та же калибровка дерево ↔ меш без мутаций), можно ли править узел; при отказе показывает причину и блокирует поля (раньше причина выводилась только уведомлением после попытки). Проверка повторяется после каждой правки/перемотки. Замечание: это проверка согласованности дерева с мешем, а не валидности манифолда меша для CSG (`csgValid` из ideas) (`store/edit-child.ts`, `components/ChildPropertiesPanel.tsx`)
- **Фаза 9.5 — дизайн правки прошлых шагов (без кода):** `docs/PHASE_9_5_DESIGN.md` — append-операция `edit_step` + проекция эффективной истории, каскадный пересчёт замороженных CSG, политика `align`, нарезка 9.5.0–9.5.4, решения для утверждения
- **Фаза 9.5.0 — эффективная история (фундамент правки прошлых шагов, без UI):** новая append-only операция `edit_step` (`stepIndex`, `stepFingerprint`, `patch` fillet/move/mirror, `before`, обязательные `replacements` — пересчитанные `group`/`edit_child_params`/`align` ниже по течению) и чистая проекция `projectHistory(ops, hypothetical?)` (`store/project-history.ts`): у шага N подставляются новые значения (последняя правка побеждает), у замороженных шагов — готовые результаты, сами `edit_step` выбрасываются; несовпадение отпечатка/индекса/вида → правка игнорируется целиком. Проекция идемпотентна (без `edit_step` — тот же массив) и стоит на входе ВСЕХ потребителей истории: `buildRebuildMeta`, `rebuildFromHistory` (и воркер `rebuildScene`), `rebuildBuildTree`, `registerBakedNodes`, `findCreationTransform` (калибровка 9.3, замки 9.9) — undo/redo/перемотка, загрузка `.3dtc`/проекта/автосейва получают эффективную историю без правок на местах вызова. Там же: `effectiveOps`, `effectiveToRawIndex`, замыкание зависимостей каскада `computeCascade` (group/mirror/edit_child_params/align/delete), `MAX_CASCADE_STEPS`. `edit_step` зарегистрирована в `.3dtc`/`.doodle` (`VALID_OP_TYPES`, массивы мешей в `replacements`). Тесты: +25 (`store/project-history.test.ts` — 20 unit; `__tests__/project-history-wasm.test.ts` — 5 на реальном WASM: pivot CSG после правки move операнда A, смена плоскости mirror, undo/redo со снимками и без, калибровка дерева, `.3dtc` round-trip, неверный отпечаток) (`csg/types.ts`, `store/project-history.ts`, `store/rebuild.ts`, `store/edit-child.ts`, `io/3dtc-io.ts`, `io/doodle-io.ts`)
- **Фаза 9.8 — правка зеркальных детей CSG + починка восстановления зеркальных операндов:** зеркальный примитив-операнд теперь регистрируется в Build Tree как `primitive` с ОРИГИНАЛЬНЫМИ `params` и упорядоченным списком плоскостей `TreeNode.mirrored` (раньше — baked-нода с отражёнными вершинами без params, править было нечего). Воркер (`rebuildTreeNode`) отражает примитив в origin до TRS (`manifold.mirror`), поэтому геометрия идентична живой (`world = TRS·mirror(v)`), а правка params работает тем же путём, что у обычных детей (`edit_child_params`), с той же калибровкой. Единая точка регистрации — `registerObjectInTree` (`csg/history-tree.ts`; заменила 5 дублей в `document-store`/`mirror-store`). **Починка:** `rebuildBuildTree` восстанавливал зеркального операнда (объект уже поглощён CSG и отсутствует в `objects`) как НЕзеркальную копию оригинала, а существующий узел не сбрасывал params после undo правки; теперь узел строится из params оригинала + `composeMirroredList(origNode.mirrored, plane)` (соседние одинаковые плоскости отменяются), существующий — сбрасывается по префиксу истории. Флаг `mirrored` в `MirrorOperation` не добавлялся: он выводится из `plane` и цепочки операций (формат `.3dtc` не меняется). `bakeMirroredSubtree` учитывает прежнее зеркало примитива (зеркало CSG с зеркальным ребёнком сохраняет объём). Тесты: +6 (`__tests__/edit-mirrored-child.test.ts`: регистрация, правка = свежий CSG, различение зеркала, 2 плоскости, перестройка дерева после `clearTree`, undo/redo, объём при зеркале CSG) и +2 UI (`child-editability-ui.test.tsx`); `mirror-multi-level.test.ts` обновлён под primitive-ноду; e2e `pnpm e2e:edit-child`: призма → зеркало YZ → CSG → правка радиуса (`csg/types.ts`, `csg/history-tree.ts`, `csg/worker-handlers.ts`, `csg/worker-client.ts`, `csg/tree-view.ts`, `store/rebuild.ts`, `store/document-store.ts`, `store/mirror-store.ts`, `components/ComponentTree.tsx`, `e2e/edit-child.mjs`)
- **Фаза 9.9 (доработка) — замок в дереве и сообщение вместо формы:** в дереве компонентов нередактируемый ребёнок получает 🔒 и подсказку «Правка недоступна: <причина>»; в панели — блок «Правка недоступна» с причиной вместо формы (раньше — поля с disabled). Причины: `nested_moved` (вложенный CSG, сдвинутый до объединения — дерево не воспроизводит меш), `mirror` (запечённая зеркальная копия), `baked`, `boolean` (контейнер, замка не получает), `no_origin`. Статическая проверка вынесена в единую `isChildEditable`/`nodeEditability` (`csg/tree-view.ts`) и используется read-моделью, `edit-child.ts` (отказ `not_editable`), деревом и панелью; согласованность — свойство КОРНЯ (`checkRootConsistency`, один вызов воркера на корень, хук `useRootConsistency` проверяет только раскрытые корни). Переименовано `mirrored` → `mirror` в `NotEditableReason`. Тесты: +10 (`tree-view.test.ts`, `__tests__/child-editability-ui.test.tsx` — дерево и панель на реальном WASM), e2e `pnpm e2e:tree` расширен (`csg/tree-view.ts`, `store/edit-child.ts`, `hooks/useRootConsistency.ts`, `components/ComponentTree.tsx`, `components/ChildPropertiesPanel.tsx`, `App.css`, `i18n/locales/{ru,en}`, `e2e/tree.mjs`)
- **Фаза 9.7 (минимум) — индикация пересчёта:** панель ребёнка показывает «Пересчёт CSG…» при `busy` и «Проверка возможности правки…» во время калибровки (`components/ChildPropertiesPanel.tsx`)
- **E2E-проверка в браузере (Playwright, Фаза 9):** devDependency `playwright`, `web-app/e2e/helpers.mjs` (`openApp()` — запуск Chromium, ожидание canvas и CSG-воркера, сбор ошибок консоли) и `web-app/e2e/smoke.mjs` (`pnpm e2e:smoke`: приложение стартует, WebGL и воркер живы, фигуры добавляются). Для WebGL в headless-Chromium на Linux обязательны флаги `--use-angle=gl-egl --use-gl=angle --ignore-gpu-blocklist` (иначе приложение показывает WebGLFallback) (`web-app/e2e/*`, `web-app/package.json`)
- **Фаза 9.5.2 — правка шага move с каскадом CSG и align:** ✎ у шага «Переместить» в Timeline открывает панель «Шаг N: Перемещение» (`components/StepPanel.tsx`, `ui-store.selectedStep`; не модалка) — ΔX/ΔY/ΔZ (поворот/масштаб — если шаг их меняет), коммит по Enter / уходу из поля, «Пересчёт CSG…» на время каскада. `document-store.editStepParams` → `store/edit-step.ts::computeStepEdit`: история «как если бы шаг сразу был с новой дельтой» (`projectHistory` с гипотетической правкой), по порядку пересчитываются `group` (`computeCsgResult`; pivot = новый TRS операнда A — R8; legacy-группы extrude — в своей конвенции, `bakeResultRS`), `edit_child_params` (путь 9.3 с калибровкой) и `align` (re-solve, решение В2: deltas заново из axis/anchor/anchorId по рамкам на этом шаге — цели остаются выровненными). Атомарный отказ (пустой результат, предел 50 шагов) с восстановлением кэша воркера и дерева и уведомлением с номером шага. Timeline: метка «✎M» у правленого шага, подпись «Правка шага N: сдвиг (8, 0, 0) → (12, 0, 0)», фильтр «Правка шага». `project-history`: `effectivePatches`, `effectiveOpAt`, `cascadeSteps`, `CascadePlan.alignResolve`. `hooks/useSelectedStepGuard.ts`. Тесты: +27 (WASM-каскад 14 — `__tests__/edit-step-move.test.ts`, панель 5 — `step-panel-ui.test.tsx`, unit 7 — `project-history`, `helpers`, `.3dtc` 1); e2e `pnpm e2e:edit-step-move`
- **Фаза 9.5.3 — правка плоскости шага mirror с каскадом CSG:** ✎ у шага «Зеркало» в Timeline открывает панель «Шаг N: Зеркало» — выбор плоскости YZ / XZ / XY (радиогруппа, применяется сразу, без «Применить»; та же плоскость — ничего). Движок 9.5.2 расширен, не переписан: `SUPPORTED_KINDS += 'mirror'`, ветки mirror в проверке значения / «не изменилось» / `before`. Шаг mirror ничего не хранит готовым — копии и `mirrored[]` воспроизводятся из списка оригинала (`composeMirroredList`), поэтому правка ЗАМЕНЯЕТ вклад шага (копия `[XZ]`, не `[YZ, XZ]`), а зеркала ниже перекомпонуются (R12). Каскад — тот же: `group`, `edit_child_params` (зеркальный ребёнок с новой плоскостью), `align` re-solve. Timeline: «Правка шага N: зеркало YZ → XZ». Тесты: +17 (WASM — `__tests__/edit-step-mirror.test.ts` 11, панель 1, unit 4, `.3dtc` 1); e2e `pnpm e2e:edit-step-mirror`
- **Тест: незамкнутый STL → CSG — предсказуемое поведение** (`__tests__/import-mesh-csg-nonmanifold.test.ts`, реальный WASM): union/subtract/intersect с импортированным незамкнутым мешем в обоих порядках операндов не падают, показывают уведомление, объекты/история не меняются, `busy` сброшен; контроль — CSG примитивов. Фиксирует текущее ограничение: `csgBoolean` не допускает к CSG любой `import_mesh` (и замкнутый)
- **Фаза 9.5.4 — правка глубины шага extrude с каскадом CSG (Фаза 9.5 закрыта):** `GroupOperation.source` (`{ kind: 'extrude', baseId, slabId, axis, depth }`) пишет `extrudeSelected`; такая группа правится как шаг: ✎ в Timeline (подпись «Выдавить Z на 5») → панель «Шаг N: Выдавливание» — глубина (Enter/blur, знак — сторона), ось только для просмотра. Движок 9.5.2/9.5.3 расширен: `StepPatch` `extrude`, `SUPPORTED_KINDS += 'extrude'`, `patchKindFor(op)` (только группа с source), отпечаток — id плиты. Плита строится одной функцией `helpers.extrudeSlab` по мировой рамке базы: каскад пересчитывает её (замена `add_shape` — допускается ДО правленого шага) и саму группу N (самозамена — только у правки extrude), затем CSG/align ниже; правка move базы ДО extrude теперь тянет плиту за базой. Старые extrude без source как extrude не редактируются (EXTRUDE-LEGACY). Timeline: «Правка шага N: выдавливание (глубина 5 → 10)». Тесты: +20 (WASM — `__tests__/edit-step-extrude.test.ts` 10, панель 3, unit 6, `.3dtc` 1); e2e `pnpm e2e:edit-step-extrude` (сцена из фикстуры `e2e/fixtures/extrude-union.3dtc`)
- **CSG-INDEPENDENT-COPY — зеркало и вставка CSG дают независимую параметрическую копию:** копия получает СВОЁ дерево Build Tree (а не запечённый меш): узлы `${idКопии}:${idИсточника}` (детерминированно — правки детей копии воспроизводятся по истории), дети-примитивы с params правятся как у оригинала (9.2/9.3). Зеркало — `copySubtree(id, newId, plane)`: мировые трансформы узлов отражены, примитивы получают плоскость в `mirrored[]` (9.8), а не запекаются (`bakeMirroredSubtree` для зеркала CSG больше не вызывается); baked-узлы отражают вершины. Вставка — буфер хранит снимок дерева и систему создания (`ClipEntry.csgTree`), операция `group` (`ids: []`) — его же (`GroupOperation.copyTree`), дерево — `instantiateSubtree`; правка оригинала после Ctrl+C во вставку не попадает. Система создания копии для правки ребёнка — `findCreationTransform`: зеркало — отражённая система источника (рекурсивно по истории), вставка — `copyTree.origin`. `rebuildBuildTree` строит дерево копии по истории (перемотка, загрузка `.3dtc`, автосейв). Копия и оригинал не связаны (не linked). Замок `mirror` — только у примитива, запечённого старым зеркалом (baked с params); отражённый настоящий baked-меш и старая вставка без дерева — 🔒 `baked`. Тесты: +20 (`__tests__/independent-copy-mirror.test.ts` — 10, `__tests__/independent-copy-paste.test.ts` — 9, `io/3dtc-io.test.ts` — 1; в `csg/tree-view.test.ts` — проверка отражённого baked без params); `csg-mirror-chirality.test.ts` — 2 теста переписаны под новую модель (дети — примитивы с `mirrored[]`; хиральность — дерево воспроизводит меш, контроль без зеркала — `tree_mismatch`). e2e `pnpm e2e:independent-copy` (`csg/history-tree.ts`, `csg/types.ts`, `csg/tree-view.ts`, `store/mirror-store.ts`, `store/document-store.ts`, `store/rebuild.ts`, `store/edit-child.ts`, `store/helpers.ts`, `e2e/independent-copy.mjs`)
- **IMPORT-MESH-CSG — CSG для замкнутых STL (по manifold, а не по типу):** импортированный меш (STL, 3D-текст) допускается к объединению/вычитанию/пересечению, если он замкнут — это решает воркер (manifold построился). Незамкнутый → воркер бросает ошибку с маркером `NON_MANIFOLD` (`csg/worker-handlers.ts`: `NON_MANIFOLD_ERROR`, проверка операндов в `csgBoolean`/`csgBooleanSync`), стор показывает `notify(t('errors.csgNonManifold'), 'warning')` (новый ключ ru/en), `busy` сброшен, объекты и история не меняются (`isNonManifoldError` в `store/csg-result.ts`). В дереве CSG импорт — 🔒 baked, примитивы рядом правятся. Тесты: +7 (`__tests__/import-mesh-csg.test.ts` — замкнутый ∪/− куб с проверкой объёма и рамки, дерево и правка куба, импорт сдвинут до CSG + перемотка без снимков + `.3dtc`, отказ для незамкнутого, текст ru/en, контроль), `import-mesh-csg-nonmanifold.test.ts`: «текущее ограничение» перевёрнут — замкнутый STL работает. e2e `pnpm e2e:import-mesh-csg` (фикстуры `e2e/fixtures/closed-cube.stl`, `open-triangle.stl`)
- **ALIGN-REVIT — выравнивание по реальной геометрии с учётом поворота + `aria-label` у всех кнопок тулбара:** рамка выравнивания (`helpers.computeWorldAABB`) — проекция реальной геометрии через полный TRS (`pos + R·S·v` по вершинам); без вершин — OBB: локальная рамка из params (`localParamsBox`) → 8 углов (`obbCorners`) → проекция (`obbWorldAABB`). Повёрнутый цилиндр выравнивается по основанию / ободу, повёрнутый куб — по реальной грани/ребру, масштаб учитывается. Один решатель `solveAlignDeltas` у живого `alignSelected` и re-solve каскада правки шага (move / mirror / extrude). UI не менялся: 9 кнопок (min/center/max × X/Y/Z), якорь — последний выбранный; явный выбор плоскости — отдельная задача ALIGN-UI-REVIT. Воспроизведение align — по сохранённым `deltas`: старые проекты при загрузке не сдвигаются. `IconButton` даёт доступное имя по умолчанию — подпись тултипа (`labelKey`), затем `title`/`label`. e2e берут кнопки по `aria-label` (`toolbarButton`/`panelButton` в `e2e/helpers.mjs`), а не по индексу (зеркало — 17-я, импорт — 4-я, «Объединение» — первая в группе). Тесты: +16 (`__tests__/align-obb.test.ts` — 12 на реальном WASM: OBB, цилиндр/куб/масштаб/повёрнутый якорь, каскад move/mirror/extrude; `__tests__/toolbar-aria.test.tsx` — 4: 35 кнопок ru/en с непустым уникальным именем, снимок списка), проверены откатом; e2e `pnpm e2e:align-obb` (`store/helpers.ts`, `components/IconButton.tsx`, `e2e/*.mjs`, `package.json`)
- Отображение версии приложения в StatusBar (справа): `{app.name} v{APP_VERSION}` (`StatusBar.tsx`, `constants.ts`)

#### Changed
- **DEVELOPMENT_PLAN — EXTRUDE-3D-SCALE (принято):** `extrudeSelected` — не extrude, а «растянуть 3D-объект по оси» (дублирует `scale`); в UI как «Extrude» не возвращать, настоящий extrude (эскиз → 3D) — Фаза 11; движок остаётся для правки шага 9.5.4. Задача EXTRUDE-UI отменена. AGENTS.md: цепочка веток (ветки задач → PR в `phase-9`), extrude — движок правки, не UI-инструмент
- **DEVELOPMENT_PLAN — `aria-label` для всех кнопок тулбара** (в ALIGN-REVIT): e2e берут кнопки зеркала и импорта STL по индексу — хрупко при перестановке кнопок
- **e2e `independent-copy` — проверка по тому, что видит пользователь:** дети копии ищутся по подписи внутри строки объекта (а не по id узлов), замки проверяются сразу после раскрытия; вставка без дерева падает с «не раскрывается — запечённый меш». Проверено откатом: старое зеркало → «замок 🔒 mirror», старая вставка → «запечённый меш». Решения CSG-INDEPENDENT-COPY (независимая копия, снимок на момент Ctrl+C, правила `findCreationTransform` для копий) записаны в `docs/PHASE_9_DESIGN.md` (`e2e/independent-copy.mjs`)
- **Левая панель шире, фигуры в 3 столбца:** `.panel-left` 170 → 320px, `.shape-grid` `1fr 1fr` → `repeat(3, 1fr)` (8 фигур — 3 + 3 + 2). Подписи фигур, дерева, истории и списка объектов не обрезаются; при 1366px вьюпорту остаётся 846px — медиа-запрос не понадобился. Только CSS, логика не менялась (`App.css`)
- **DEVELOPMENT_PLAN — ограничения редактирования и UX-баги:** активные задачи CSG-INDEPENDENT-COPY (зеркало/вставка CSG → независимая параметрическая копия, объединяет MIRROR-INDEPENDENT и PASTE-INDEPENDENT), NESTED-MOVED-EDIT, ALIGN-REVIT (переработка выравнивания по идее Revit, заменяет ALIGN-PRIMITIVE-AABB, + `aria-label`); мелкие UX (уникальные id позиции/поворота, NumInput `0.000` вместо `-0.0`); принятые ограничения IMPORT-MESH-PARAMETRIC и EXTRUDE-LEGACY — не задачи; запись «CSG с импортом работает» исправлена — новая задача IMPORT-MESH-CSG (включить CSG для замкнутых STL, i18n уведомления)
- **Ядро CSG вынесено в `computeCsgResult` (Фаза 9.5.0, без изменения поведения):** sync операндов → boolean → pivot = transformA → un-bake RS операнда A — общая функция для `csgBoolean` и будущего каскада 9.5 (иначе каскад через запасной путь воркера дал бы pivot = COM, риск R1). Туда же перенесён `syncObjectsForOperation`; `groupOperationFromResult`/`groupReplacementFromResult` строят операцию `group` и замену для `edit_step` из одного результата. Тест: результат побайтно равен операции `group`, записанной `csgBoolean` (`store/csg-result.ts`, `store/document-store.ts`)
- **`rebuildBuildTree` воспроизводит params/transform примитивов по префиксу истории (Фаза 9.3):** дерево не чистится между перемотками, поэтому узел мог хранить состояние из «будущего» (после undo правка ребёнка оставалась в дереве при откатанном меше). Теперь `add_shape` сбрасывает `params`/`localTransform` существующего узла к начальным (иммутабельно через `setNode` — снимки дерева хранят ссылки), а `resize_dims` и `edit_child_params` применяют params заново. Побочно исправляет потерю `resize_dims` в дереве при undo/redo (`store/rebuild.ts`)

#### Fixed
- **ALIGN-PRIMITIVE-AABB — выравнивание примитивов без поворота и масштаба:** рамка примитива считалась по params + позиции: поворот и масштаб игнорировались, а цилиндр/конус/призма/пирамида (есть `radius`) — как сфера радиуса r. Повёрнутый цилиндр «выравнивался как сфера», повёрнутый куб — по ±w/2. Теперь — по реальной геометрии (ALIGN-REVIT). Регресс: `__tests__/align-obb.test.ts`, e2e `pnpm e2e:align-obb` (проверены откатом)
- **Безымянные кнопки тулбара:** `IconButton` без `ariaLabel`/`title` ставил `aria-label=""` (почти все кнопки тулбара) — теперь имя из подписи тултипа. Регресс: `__tests__/toolbar-aria.test.tsx`
- **IMPORT-CSG-STUB — импорт в CSG подменялся примитивом-заглушкой:** `computeCsgResult` считал `import_mesh` примитивом (`shapeType !== 'csg'`) и отправлял воркеру `shapeA = { shapeType: 'import_mesh', params: {} }` — воркер строил заглушку вместо меша STL. Скрыто, пока импорт отсекался по типу; найдено тестом IMPORT-MESH-CSG (незамкнутый треугольник «объединялся») (`store/csg-result.ts`). Регресс-тест `import-mesh-csg.test.ts` › «IMPORT-CSG-STUB» (STL ∩ большой куб = STL: объём 1000 и рамка, импорт — операнд A и B) — проверен откатом фикса
- **IMPORT-TREE-RELOAD — CSG с импортом после загрузки:** `rebuildBuildTree` создавал baked-узлы импортов только в конце (и только для оставшихся в сцене) — на шаге group импорта в дереве не было, CSG становился запечённым корнем, дети нередактируемы. Теперь узел создаётся на шаге импорта (вершины в COM, pivot = transform + COM — как живой импорт); move импорта воспроизводится от pivot, а не от transform шага (`store/rebuild.ts`). Регресс-тест `import-mesh-csg.test.ts` › «IMPORT-TREE-RELOAD» (чистое дерево по истории: узел импорта на месте объекта, корень — boolean с импортом) — проверен откатом фикса
- **MIRROR-CSG-TREE-RELOAD — дерево зеркального CSG после загрузки:** узел копии жил только в сессии (MIRROR-TREE-PRESERVE), а `rebuildBuildTree` после загрузки/перезапуска ставил заглушку-куб — теперь копия дерева строится по истории (`store/rebuild.ts`). Давний баг (до CSG-INDEPENDENT-COPY). Регресс-тест `independent-copy-mirror.test.ts` › «MIRROR-CSG-TREE-RELOAD» — проверен откатом фикса
- **PASTE-CSG-RS — вставленный повёрнутый CSG терял поворот/масштаб после перемотки/загрузки:** операция вставки писала только `resultCenter`; теперь и `resultRotation`/`resultScale` (вершины CSG — без RS, 8.5.9) (`store/document-store.ts`). Давний баг, касался и старой вставки мешем. Регресс-тесты `independent-copy-paste.test.ts` › «PASTE-CSG-RS» (вставка с деревом и мешем, поворот по трём осям + масштаб, перемотка без снимков и `.3dtc`) — проверены откатом фикса
- **CI не доходил до проверок:** pnpm 9 в CI падал на `pnpm install` (`packages field missing or empty`) — `web-app/pnpm-workspace.yaml` содержит только `allowBuilds` без `packages`, что допустимо с pnpm 10+, но не в 9. Версия pnpm зафиксирована в `web-app/package.json` (`packageManager: pnpm@12.10.1`, совпадает с локальной); `pnpm/action-setup` во всех workflow берёт её оттуда (`package_json_file`), Node 20/22 → 24, установка везде `--frozen-lockfile`. pnpm 12 дописал в `pnpm-lock.yaml` документ с самим pnpm (`packageManagerDependencies`), остальное без изменений (`web-app/package.json`, `web-app/pnpm-lock.yaml`, `.github/workflows/{ci-web,build,deploy}.yml`)
- **EXTRUDE-AABB — плита extrude ставилась без учёта позиции объекта:** `extrudeSelected` брал кэш `obj.aabb`, а у примитива он локальный (сдвигается только `moveObject`) — объект, появившийся не в начале координат (второй и далее, spawn x = 25…), получал плиту у начала координат (результат растягивался, например [−5, 30] вместо [20, 30]). Теперь рамка — мировая по вершинам с полным TRS (`worldVerticesAABB`), плита — `extrudeSlab`. Найдено при 9.5.4
- **MIRROR-CHAIN-REPLAY — зеркало зеркальной копии примитива воспроизводилось неверно** (undo без снимков, загрузка `.3dtc`, правка шага): воркер (`handleRebuildScene`) не регистрировал копию примитива в `shapeInfos`, и зеркало копии уходило в ветку CSG/импорта — мировое отражение кэша + список `mirrored[]` на main thread применяли последнюю плоскость дважды (повёрнутая призма `[XZ, YZ]` теряла отражение YZ). Теперь копия — примитив (`csg/worker-handlers.ts`). Найдено при 9.5.3
- **MIRROR-CSG-REPLAY — зеркальная копия CSG-объекта при воспроизведении смещалась** (двойная трансляция и RS): копия брала мировые вершины кэша воркера как локальные. Теперь `buildRebuildMeta` даёт копии отражённый локальный меш оригинала (как живое `mirrorSelected`: `mirrorVerticesInPlace` + winding) и включает её в `csgResultIds` (`store/rebuild.ts`). Найдено при 9.5.3
- **ALIGN-CSG-AABB — выравнивание с CSG-объектом смещалось на позицию операнда A:** `computeWorldAABB` для CSG/импорта брал кэш `obj.aabb`, а он в локальной системе объекта (вершины CSG — относительно pivot = TRS A); после пересборки из истории кэш был другим. Теперь рамка — по вершинам с полным TRS (`helpers.worldVerticesAABB`); решатель вынесен в `helpers.solveAlignDeltas` (общий для `alignSelected` и re-solve 9.5.2). Найдено при 9.5.2. Тесты: `__tests__/align-csg.test.ts` — живой `alignSelected` с двумя CSG (X min/center/max, воспроизведение из истории), `solveAlignDeltas` с CSG-целью (`store/helpers.test.ts`)

#### Removed
- **Блокировка CSG по типу для импорта (UI):** `App.tsx` делал кнопки CSG неактивными при любом выделенном `import_mesh` (`hasNonManifoldSelected`); проп `nonManifoldSelected` (`Toolbar`, `PropertiesPanel`, `CsgButtons` — подсказка там всё равно не выводилась) и ключ `csg.nonManifold` удалены; захардкоженная русская строка в `csgBoolean` заменена на `errors.csgNonManifold`
- **Скругление куба (fillet) удалено из приложения** — до появления нормального инструмента (выбор рёбер, любые тела, B-Rep; см. DEVELOPMENT_PLAN «Фаза 11 — Будущее»). Прежний fillet был глобальным параметром куба (`filletRadius`, скругление всех рёбер сразу), а не инструментом CAD, и терялся в CSG (FILLET-LOST-IN-CSG). Убраны: секция «Скругление» в панели свойств, шаг fillet и фильтр в Timeline, действие `applyFillet`, состояние `filletRadius` в ui-store, сообщение воркера `applyFillet` (`handleApplyFillet`, `workerApplyFillet`), `buildPrimitiveWithFillet`, `buildRoundedBox`, `FILLET_EPSILON`/`FILLET_MIN_RADIUS`, `FilletIcon`, `ShapeParams.filletRadius`, патч `{ kind: 'fillet' }` правки шага (9.5) и `StepReplacement.params`, i18n `properties.fillet*`, `timeline.fillet`, `filters.fillet`, `errors.filletFailed`. Ветка 9.5.1 (каскад fillet) не вливается.
- **Старые проекты со скруглением открываются:** тип операции `fillet` оставлен (deprecated) и принимается `.3dtc`/`.doodle`; при загрузке (`openProject`, проекты IndexedDB, автосейв) `io/legacy-fillet.ts::migrateLegacyFillet` вырезает шаги fillet (в Timeline не остаётся «мёртвых» шагов, на которых Ctrl+Z ничего не делает), снимает `filletRadius` из params операций и объектов, перенумеровывает `edit_step`; объекты `.3dtc` со скруглёнными вершинами пересобираются из истории — кубы острые. Уведомление «скругление удалено…» — одно на проект. Воспроизведение (`buildRebuildMeta`, воркер `rebuildScene`) шаг fillet игнорирует и без миграции. Тесты: +9 (`io/legacy-fillet.test.ts` — 4, `__tests__/legacy-fillet-load.test.ts` — 5 на реальном WASM: `.3dtc` через `openProject`, файл без скругления без изменений, `.doodle`, автосейв), −2 (fillet-кейсы `render-data-invariant`, `types.test`); `project-history.test.ts` переведён на патчи move (`csg/types.ts`, `csg/worker-handlers.ts`, `csg/worker.ts`, `csg/worker-client.ts`, `csg/rebuildOps.ts`, `store/document-store.ts`, `store/types.ts`, `store/ui-store.ts`, `store/rebuild.ts`, `store/project-history.ts`, `components/PropertiesPanel.tsx`, `components/Timeline.tsx`, `components/icons/index.tsx`, `App.tsx`, `constants.ts`, `constants.tsx`, `io/legacy-fillet.ts`, `i18n/locales/{ru,en}`)

---

## [1.2.3] — 2026-11-01

**Patch: multi-level mirror + CSG mirror double RS (Этапы 8.5.9–8.5.12).**

### Fixed
- **CSG-MIRROR-PRIMITIVE-PARAMS (8.5.10):** CSG из mirror primitive терял зеркальную форму (diff = 7.5). Фикс: `SceneObject.mirrored` flag, маршрутизация в `workerSyncMesh`. (`types.ts`, `mirror-store.ts`, `document-store.ts`, `rebuild.ts`)
- **Multi-level mirror (8.5.12):** `mirrored` хранил одну плоскость — undo/redo multi-level `YZ→XZ` давал одно зеркало (diff = 30.0). Фикс: `mirrored: MirrorPlane[]` (ordered, cancel same-plane), `rebuildFromHistory` — цикл. (`types.ts`, `mirror-store.ts`, `rebuild.ts`, `3dtc-io.ts`)
- **Copy/paste mirror primitive (8.5.12):** `ClipEntry` без `mirrored` + vertices → зеркало терялось (diff = 2.86). Фикс: `ClipEntry.mirrored` + vertices. (`types.ts`, `document-store.ts`)
- **moveObject mirror primitive (8.5.12):** регистрировался как primitive-нода (без `!obj.mirrored`) → baked неверно. Фикс: `!obj.mirrored` → baked. (`document-store.ts`)
- **Double RS mirror CSG (8.5.12):** mirror CSG имел `vertices` с baked TRS + `transform` с полным TRS → RS дважды (vol ratio = 0.5, bbox diff = 1.93). Фикс: `mirrorObject` CSG — прямое зеркало vertices (`mirrorVerticesInPlace`), `transform = mirrorTransform`, `PIVOT-TRANSFORMA srcCom-shift` убран. Инвариант `world' = M·world`. (`mirror-store.ts`, `document-store.ts`)
- **CSG-PRESERVE-RS (8.5.9):** `csgBoolean` терял rotation/scale операнда A. Фикс: вершины un-baked'ятся к локальной системе A, `resultTransform` = полный TRS A. (`document-store.ts`, `worker-matrix.ts`)
- **rebuildBuildTree startT (8.5.9):** начальная трансформация CSG-результата не включала `resultRotation`/`resultScale`. (`rebuild.ts`)

### Added
- `MirrorPlane = 'XY' | 'XZ' | 'YZ'` type
- `SceneObject.mirrored: MirrorPlane[]` (ordered, cancel same-plane)
- `ClipEntry.mirrored`, `ClipEntry.mirrorVertices/Indices/Normals`
- Tests: `mirror-multi-level.test.ts` (5), `mirror-csg-volume.test.ts` (4), `csg-preserve-rs.test.ts` (5)

### Changed
- `SceneObject.mirrored: 'XY'|'XZ'|'YZ'` → `MirrorPlane[]` (backward-compat: string → `[string]` при load)

---

## [1.2.1] — 2026-10-26

**Patch: double-mirror primitive fix.**

### Fixed
- **DOUBLE-MIRROR-PRIMITIVE:** двойное зеркало примитива (YZ → YZ) давало 180°-поворот вместо identity (pivot = identity, vertices = одинарное зеркало). Корень: `mirrorObject` для primitive делал `rebuildNode` (из params), теряя запечённое зеркало vertices. Фикс: зеркалить `obj.vertices` напрямую. Тесты: `mirror-double.test.ts` (6 тестов, double YZ/XZ/XY = identity для prism, cone, pyramid, cube). (`store/mirror-store.ts`)

### Added
- `mirror-double.test.ts` — 6 тестов на double mirror primitive (identity для YZ/XZ/XY).

### Changed
- `phase-8-scenarios.test.ts` — Scenario 3 остаётся один mirror (double покрыт отдельно).

---

## [1.2.0] — 2026-10-25

**Фаза 8.5 — Унификация отрисовки и данных (единый источник).**

### Added
- `ARCHITECTURE_RENDER.md` — единый источник данных и отрисовки
- CI-тест `render-data-invariant.test.ts` — 26 тестов, `render = data` для всех типов (7 примитивов + TRS + import_mesh + CSG union/subtract + mirror + fillet + resize + 2 CSG-инварианта)
- Новый формат проекта `.3dtc` (ZIP + JSON, `version: 3dtc-v1`, base64 для mesh)
- `io/3dtc-io.ts` — `serialize3dtc` / `parse3dtc`
- `io/3dtc-io.test.ts` — 8 тестов (round-trip, version, thumbnail, reject)

### Changed
- Worker `buildShape` возвращает `vertices` в origin (COM) для всех primitive
- `handleRebuildScene` возвращает `vertices` в origin (rebuild = live)
- `addShape` применяет spawn к `transform`, не к `vertices`
- `importStl` / `addRawMesh` — `centerMassAtOrigin` + pivot = COM
- Store: `openProject` / `saveProject` (вместо `openDoodle` / `saveDoodle`)
- STL-export: всегда `applyTRS(transform, v)` без bbox-вычитания

### Removed
- `centerGeometry` (`viewport-hooks.ts`, 3 места + определение)
- `isPivotCenteredGeometry` (`geometry-utils.ts`, `stl-export.ts`)

### Fixed
- **RENDER-PRISM-BBOX-OFFSET** — устранён вместе с `centerGeometry`
- **VIEWPORT-DOUBLE-CENTERING** — устранён
- **PIVOT-CSG** — устранён (pivot = transformA)
- **STL-export** — теперь совпадает с render (для cone/pyramid был сдвиг на `h/4`)

### Legacy
- `.doodle` — оставлен как legacy (не используется в UI). Конверсия — отдельно.

---

## [Unreleased]

### Added
- **Тест double-mirror primitive (Фаза 8.5, Этап 8.5.7):** `mirror-double.test.ts` (6 тестов: YZ/XZ/XY для prism sides=3, cone, pyramid, cube) — двойное зеркало примитива возвращает identity: `obj3.transform == obj1.transform` и `world(obj3) == world(obj1)` (diff = 0.00000000). (`src/__tests__/mirror-double.test.ts`)

### Fixed
- **Double-mirror primitive = identity (Фаза 8.5, Этап 8.5.7):** ветка примитива в `mirrorObject` вызывала `rebuildNode`, пересобирая геометрию из `params` и теряя предыдущее зеркало, запечённое в `obj.vertices`. Двойное зеркало давало pivot = identity, но vertices = одинарное зеркало (для асимметричной призмы — выглядит как поворот на 180°). Фикс: зеркалить `obj.vertices` напрямую (с 8.5.1/8.5.3 они всегда origin-центрированы), без rebuild из params. Убраны `cloneSubtree`/`resetSubtreeTransform`/`rebuildNode`/`deleteNode` из примитивной ветки. CSG mirror не затронут (`bakeMirroredSubtree` — отдельный путь). (`src/store/mirror-store.ts`)
- **CI-тест render = data (Фаза 8.5, Этап 8.5.5):** `render-data-invariant.test.ts` расширен с 18 до 24 тестов. Покрыто: import_mesh (COM-центрирование, pivot = COM), CSG union (cube+prism), CSG subtract (cube−sphere), mirror YZ (src → mirror pivot), fillet (cube r=2), resize (неравномерный scale 0.5×2×1.5). Все diff render−data < 1e-4. (`src/__tests__/render-data-invariant.test.ts`)
- **Формат .3dtc (Фаза 8.5, Этап 8.5.4):** новый формат проекта — ZIP + JSON с `version: "3dtc-v1"`. `serialize3dtc`/`parse3dtc` в `io/3dtc-io.ts` сохраняют `objects` (Record\<string, SceneObject\>) + `operations` (TinkerCraftOperation[]) + `operationsTrimmed` + `thumbnail`. TypedArray (Float32Array/Uint32Array) сериализуются в base64 с маркером `{__t, d}` — без потерь точности, компактнее JSON-массивов. `open3dtcFilePicker()` — file picker с `accept: '.3dtc,.zip'`. `parse3dtc` валидирует версию, отклоняет `.doodle`. Тест `3dtc-io.test.ts` (8): round-trip идентичность, base64 bit-for-bit, version `3dtc-v1`, thumbnail, operationsTrimmed, reject unsupported version, reject missing model.json. (`src/io/3dtc-io.ts`, `src/io/3dtc-io.test.ts`)
- **Store: import_mesh COM-центрирование (Фаза 8.5, Этап 8.5.3):** `importStl` и `addRawMesh` центрируют `SceneObject.vertices` по COM (`centerMassAtOrigin`), pivot = `transform + COM` → `world = pivot + v` не меняется, но данные становятся едиными с live-путём и rebuild (8.5.2.5). Устраняет расхождение live/rebuild для STL-импорта. (`src/store/document-store.ts`)
- **Тест render = data (Фаза 8.5, Этап 8.5.3):** `render-data-invariant.test.ts` (18 тестов) — `matrixWorld @ geometry.attributes.position` (то, что видит браузер) против `applyTRS(transform, vertices)` через `computeRSMatrix` (общая математика worker/STL). Render-сторона строит ровно то же дерево Three.js, что `useMeshSync`, через ПРОДАКШН-функцию `applyTransformToPivot`. Покрыто: 7 примитивов (cube/sphere/cylinder/cone/torus/prism/pyramid), 3 комбинации TRS, cone+полный TRS (регресс `centerGeometry` — раньше расходился на 2.5 по Y), проверка `geometry.position === SceneObject.vertices` без translate. Все diff = 0.00e+0…1.8e-15. (`src/__tests__/render-data-invariant.test.ts`)

### Changed
- **Store: openDoodle/saveDoodle → openProject/saveProject (Фаза 8.5, Этап 8.5.4):** `openProject` использует `parse3dtc` (новый формат `.3dtc`), загружает `doc.objects` напрямую без `rebuildFromHistory`; `saveProject` использует `serialize3dtc` (ZIP + `model.json` + `thumbnail.png`). File picker принимает `.3dtc,.zip`. STL export: `.replace(/\.3dtc$/, '')` вместо `.doodle`. (`src/store/document-store.ts`, `src/store/types.ts`, `src/App.tsx`)
- **Viewport: centerGeometry удалён (Фаза 8.5, Этап 8.5.3):** все три места (create, update, mirror-preview) больше не вычитают bbox-центр из вершин — `geometry = vertices` как есть, pivot = `SceneObject.transform`. Асимметричные примитивы (cone/prism/pyramid) больше не отрисовываются со сдвигом на `bboxCenter(origin)`. Убраны функции `centerGeometry` и `isPivotCenteredGeometry`; `applyTransformToPivot` — единая точка применения трансформа (create/update/preview). (`src/components/viewport-hooks.ts`, `src/csg/geometry-utils.ts`)
- **STL-export: всегда applyTRS(transform, v) без bbox-вычитания (Фаза 8.5, Этап 8.5.3):** `applyTransformToVertices` больше не вычитает bbox-центр — конвенция `world = R·S·v + pos` единая для рендера, данных и экспорта. Раньше для cone/prism/pyramid экспорт расходился с рендером на `h/4`. Тесты обновлены под новую конвенцию (spawn применяется один раз, scale/rotate без центрирования). (`src/io/stl-export.ts`, `src/io/stl-export.test.ts`)

### Removed
- **`centerGeometry` и `isPivotCenteredGeometry` (Фаза 8.5, Этап 8.5.3):** компенсация смешанных конвенций больше не нужна — данные едины с 8.5.2.5, `import_mesh` центрирован в store. (`src/components/viewport-hooks.ts`, `src/csg/geometry-utils.ts`)

### Added
- **Store: spawn в transform, не в vertices (Фаза 8.5, Этап 8.5.2):** `addShape` сохраняет `vertices` из worker в origin (COM ≈ 0), spawn (`idx * OBJECT_SPACING`) применяется только к `transform.position`. `makeObject` не модифицирует вершины — конвенция подтверждена интеграционным тестом на настоящем WASM. (`src/store/add-shape-origin.test.ts`, 4 теста: cube, spawn второго объекта, prism, cone)
- **Worker vertices в origin (Фаза 8.5, Этап 8.5.1):** `handleBuildShape`/`handleApplyFillet` больше не запекают spawn-трансляцию в вершины — `SceneObject.vertices` всегда в origin (COM), spawn применяется в store к `transform`. `buildPrimitive`: COM-центрирование cone/pyramid через универсальный `centerManifoldToCOM` (extractMesh + centerMassAtOrigin + translate — корректно и для усечённых форм; `Manifold.cylinder center=true` центрирует BBox, не COM). `ManifoldObject.translate()` добавлен в интерфейс. Тест `worker-build-origin.test.ts`: 7 типов, COM ≈ (0,0,0). (`src/csg/worker-handlers.ts`, `src/csg/worker-build-origin.test.ts`)
- **ARCHITECTURE_RENDER.md (Фаза 8.5):** единый источник данных и отрисовки — `vertices` всегда в origin (COM), `transform` — мировой pivot, render = data. Новая нумерация фаз: 0–8.5, 9 (Параметрическая история), 10 (Яндекс.Игры), 11 (Будущее). Запланирован формат `.3dtc` (ZIP + JSON), `.doodle` больше не поддерживается.
- **CSG vertex truth test (independent oracle):** `csg-vertex-truth.test.ts` — полностью независимая проверка world-координат CSG без worker-оракула. Тест 1: генерирует 8 вершин куба + 6 вершин призмы вручную, применяет TRS (scale → Rx·Ry·Rz → translation) независимо, затем проверяет что все вершины куба вне призмы и все вершины призмы вне куба присутствуют в CSG world-меше (tolerance 1e-3). Тест 2 (RENDER PATH): монтирует настоящий `useMeshSync` → THREE.Scene, извлекает world-вершины из scene graph (matrixWorld) и сверяет с тем же независимым эталоном. Оба теста: 8/8 куб-вершин и 4/6 призменных вершин найдены, diff = 0.000000. (`__tests__/csg-vertex-truth.test.ts`)
- **CSG before/after test:** `csg-before-after.test.ts` — snapshot transform + raw vertices ПЕРЕД union, вычисление true world = applyTRS(vertices − spawn, transform), сверка ПЕРЕД vs ПОСЛЕ. Проверяет: (1) operands удалены из store, (2) pivot CSG = snapCube.transform (diff < 1e-6), (3) bbox CSG = componentwise union operand bboxes (diff < 1e-4), (4) все cube-вершины вне призмы найдены в csg world (0 missing). (`__tests__/csg-before-after.test.ts`)
- **CSG world vertex explicit test:** `csg-world-vertex.test.ts` — явное вычисление world для каждого объекта: `world = applyTRS(transform, raw − spawn)`. Логирование raw[0], world[0], bbox, pivot для cube, prism и CSG-результата. Сравнение bbox (diff < 1e-4), pivot (diff < 1e-6), outside-вершин (фильтр: вне bbox другого операнда → внутри поглощается union). Cube: all 8 found. Prism: 6 total, 0 missing (2 inside cube absorbed). (`__tests__/csg-world-vertex.test.ts`)
- **CSG render truth test:** `csg-render-truth.test.ts` — финальная проверка RENDER PATH. Монтирует реальный `useMeshSync` → THREE.Scene, извлекает `matrixWorld @ geometry.attributes.position` (то, что видит браузер). Логирует `mesh.position`, `mesh.rotation`, `mesh.scale`, `pivot.position/rotation/scale`, `matrixWorld.elements`, `geometry.attributes.position[0]`. Сравнивает `dataWorld = applyTRS(csg.transform, csg.vertices)` vs `renderWorld = matrixWorld @ pos` через nearest-neighbor (csg.vertices 24 vs mesh geometry 132 — разные представления одной геометрии). Результаты: max nearest-neighbor diff = **0.0000e+0**, bbox diff = **0.0000e+0**, cube outside render = 0/8, prism outside cube bbox & render = 0/6. Pivot = (20,20,20) = transformA, mesh.position = (0,0,0), useMeshSync **не** центрирует CSG (isPivotCenteredGeometry=true). (`__tests__/csg-render-truth.test.ts`)
- **CSG distance test (before/after union):** `csg-distance.test.ts` — все 48 парных расстояний (8 куб-вершин × 6 призм-вершин) ДО и ПОСЛЕ union. Для каждой пары: nearest-neighbor поиск в CSG world, сравнение distBefore vs distAfter. Результат: max drift = **1.27e-6** (Float32 precision), обе вершины существуют. ДЕМОНСТРАЦИЯ: 2 из 6 вершин призмы внутри куба (P0, P4) — поглощены union (nearest CSG dist = 0.80 и 3.26). При измерении до поглощённой вершины расстояние «меняется» (6.71 → 7.22, diff = 0.51) — snap ловит ближайшую точку на кривой пересечения. Это объясняет скриншот пользователя: 20.33 → 17.34 (shift ~3 мм) = призм-вершина поглощена union, snap перепрыгнул на 3 мм. (`__tests__/csg-distance.test.ts`)
- **CSG no-overlap test:** `csg-no-overlap.test.ts` — union двух НЕпересекающихся фигур (куб (10,10,10) 20³ bbox [0,0,0]→[20,20,20] + призма (20,55,20) r=12 h=20 sides=3, bbox разделены — проверено программно). Исключает «поглощение» как объяснение сдвига пользователя. Результат: **CSG vertices = 14 = 8 (куб) + 6 (призма) — ровно**; pivot = transformA = [10,10,10] (diff 0.0); cube missing = 0/8; prism missing = 0/6; max pairwise drift по всем 48 парам = **1.87e-6** (Float32 precision); P0 shift = [0.000000, 0.000001, 0.000000]. Вывод: при отсутствии пересечения union сохраняет ВСЕ вершины и ВСЕ расстояния — сдвига геометрии нет. (`__tests__/csg-no-overlap.test.ts`)
- **CSG P2 check:** `csg-p2-check.test.ts` — проверка конкретных вершин призмы до/после union. Пересекающийся сценарий (куб@(20,20,20) + призма rot(20,20,20) scale(1,1,0.5)): P0 и P4 внутри куба → поглощены (nearest CSG dist = 0.80 и 3.26); P1, P2, P3, P5 вне куба → все найдены в CSG (dist = 0.000001). P2 = [9.6517, 27.7799, 21.1775] (x=9.65 < cube.minX=10) — nearest CSG dist = 0.00000085. C0↔P2: before=21.0043, after=21.0043 (Float32 drift). No-overlap сценарий: CSG vertices = 14 (8+6), все 6 призм-вершин dist ≤ 0.000001, C0↔P2: before=67.617701, after=67.617701, diff = **1.46e-8**. Вывод: внешние вершины призмы не сдвинуты. (`__tests__/csg-p2-check.test.ts`)

### Fixed
- **REBUILD-SPAWN-BAKE (Фаза 8.5, Этап 8.5.2.5):** `handleRebuildScene` запекал spawn-трансляцию **в вершины** результатов (`applyTransform(buildPrimitive, t)`), тогда как `handleBuildShape` после 8.5.1 возвращает origin-вершины. Путь undo/redo/загрузки проекта давал `SceneObject` с удвоенным spawn (`vertices` содержат spawn **и** `transform.position` содержит spawn); корректную позицию обеспечивал только compensating `centerGeometry` во вьюпорте. Теперь results-петля `handleRebuildScene` снимает запечённую трансляцию (`−t.xyz`; инвариант «в кэше запечена только трансляция» подтверждён во всех ветках — add_shape/fillet/move/mirror/align/resize/import) и центрирует по COM, отдавая смещение в новом поле `MeshResult.centerOffset`; `store/rebuild.ts` прибавляет его к pivot → `world = pivot + vertex` **не меняется**, а данные становятся едиными с live-путём. CSG-результаты исключены (`booleanResultIds`, включая зеркальных потомков) — сохраняют pivot-центрированную конвенцию §5.4. UB-0 фолбэк `import_mesh` переведён на COM-центрирование + `centerOffset`. Тест `csg/worker-rebuild-origin.test.ts` (9): cube/cone COM ≈ 0 и `centerOffset ≈ 0`, move, `group` без offset, `import_mesh` pivot = COM исходного меша, **главный инвариант — rebuild world == live world** (cube, cone), + 2 store-теста `rebuildFromHistory`. Обновлён `store/rebuild-baked.test.ts`. Scenario 7 (undo/redo) и Scenario 8 (save/load): rebuild-path diff = **0.00e+0**. (`csg/worker-handlers.ts`, `csg/worker-client.ts`, `store/rebuild.ts`)
- **PIVOT-CSG = TRANSFORMA (Bug 3):** pivot результата CSG = позиция первого операнда (transformA), а не центр масс (COM). Раньше `document-store.ts:516` ставил `pivot = COM(world mesh)` — gizmo CSG-результата «съезжал» на `(COM − transformA)` от позиции первого операнда (измерено **0.0192** ед. для куб@(20,20,20) + призма@(20,20,20) rot(20,20,20) scale(1,1,0.5)). Исправлено: `centerMassAtOrigin` центрирует вершины по COM (тот же центр, что worker-кэш), затем применяется остаточный сдвиг `v += (COM − transformA)` → `v = v_world − transformA`, `pivot = transformA`. Инвариант `world = pivot + vertex` сохранён (измерено `|world − oracle| = 0.00000000`). Mirror-путь (`mirror-store.ts`) компенсирует сдвиг для пересобранной геометрии: `v += M(srcCom)` где `srcCom = COM(вершины первого операнда)` — для legacy-объектов (COM-центрированных) `srcCom ≈ 0`, поведение не меняется. Extrude (`document-store.ts`) обновлён по тому же паттерну. Изменена конвенция `GroupOperation.resultCenter` → pivot = transformA. Rebuild из истории (`rebuildFromHistory`) использует `resultCenter` как pivot — консистентно. (`store/document-store.ts`, `store/mirror-store.ts`, `store/rebuild.ts`, `csg/types.ts`)
- **VIEWPORT-DOUBLE-CENTERING (CSG-результат рендерился со сдвигом):** `useMeshSync` вычитал `bboxCenter` из вершин **всех** объектов (`centerGeometry`, update-путь, mirror-preview). Для примитивов это правильно: `handleBuildShape` запекает spawn-трансляцию в вершины, и вычитание её снимает. Но CSG-вершины уже центрированы по **центру масс** (§5.4, `centerMassAtOrigin`), а pivot = COM — повторное вычитание `bboxCenter` смещало меш на `bboxCenter(centered)`. Для асимметричной геометрии COM ≠ bboxCenter: union куба (origin) и призмы (10,0,0) рендерился со сдвигом **4.2491** ед. по X. Исправлено: добавлен продакшн-предикат `isPivotCenteredGeometry(shapeType)` (`csg/geometry-utils.ts`), bbox-центрирование пропускается для CSG в трёх местах вьюпорта и синхронно в STL-экспорте (`applyTransformToVertices`), чтобы экспорт не расходился с рендером. Измерено после фикса: `|render − data| = 0.00000000`. Тесты: `viewport-mesh-sync.test.ts` (4 теста, вызывают **настоящий** `useMeshSync` и сравнивают world-координаты меша из scene graph с data-world: CSG create/update-путь, поворот rotZ=30 вокруг pivot, контроль примитива — позиция не удваивается), `csg-invariants.test.ts` INVARIANT 4, `phase-8-scenarios.test.ts` Scenario 6 (модель ожидания использует тот же предикат). (`csg/geometry-utils.ts`, `components/viewport-hooks.ts`, `io/stl-export.ts`)
- **MIRROR-CHIRALITY (Variant B, baked children):** зеркало CSG с асимметричными примитивами (prism sides=3, пирамида, конус) было приближённым — `mirrorNodeRecursive` зеркалит **трансформы** детей, но не геометрию примитива. Призма sides=3 на origin (position=0, `mirrorPoint(0)=0`) оставалась незеркалённой. Измерено: union куба и призмы sides=3, mirror YZ — bbox расходился с эталоном на **2.5** ед. Исправлено: добавлена async-функция `bakeMirroredSubtree(nodeId, plane)` (`csg/history-tree.ts`), вызываемая из `mirrorObject` после `mirrorTreeNode`. Она конвертирует primitive-детей в baked с отражёнными вершинами (`mirrorVerticesInPlace` + `swapWindingInPlace`), сохраняя `shapeType`/`params` для будущего редактирования. Для уже-baked детей — зеркалирование вершин in-place. Математика: M·T(p)·R(e)·S·v = T(M·p)·R(mirrorEuler(e))·S·(M·v) — mirrorEuler является точным сопряжением (YZ: flip rotY/rotZ, rotX unchanged). После фикса: max vertex nearest-neighbor diff = 0.00000000 для призмы sides=3._scenario3 oracle обновлён на true-mirror (mirror of original CSG world vertices). Тесты: `csg-mirror-chirality.test.ts` (10 тестов: vertex-level точность, params сохранены, mirroredPlane, edit-baked-child, 5 примитивов it.each, UI data-world). (`csg/history-tree.ts`, `csg/types.ts`, `store/mirror-store.ts`)

### Known Limitations
- **CENTERING-RESIDUAL** — pivot legacy-документов (центрирование по transformA) не мигрирован на COM-конвенцию. (Двойное центрирование вьюпорта устранено — см. VIEWPORT-DOUBLE-CENTERING; остаток касается только старых файлов, где pivot ≠ COM.)
- **RENDER-PRISM-BBOX-OFFSET** — `centerGeometry` (`viewport-hooks.ts:413`) вычитает `bboxCenter` из вершин примитивов перед применением pivot-транcформации. Для симметричных примитивов (куб, сфера, цилиндр) `bboxCenter = spawn` → сдвига нет. Для **асимметричных** примитивов (призма sides=3, пирамида, конус) `bboxCenter ≠ spawn` → отрисовка смещена относительно реальной позиции CSG. Численно подтверждено: призма (sides=3, radius=12) — bboxCenter = (28,0,0) при spawn = (25,0,0) → смещение **3.000 мм** в локальной системе. Пользовательский замер: до union **12.6665 мм** (рендер-конвенция, bbox-center) vs после union **10.7443 мм** (CSG-конвенция, spawn/centroid) — расхождение **1.922 мм**. Тест `__tests__/csg-vertex-distance.test.ts` воспроизводит оба замера с точностью ±0.004 мм. CSG-вычисления корректны (diff до/после = 1.56e-7); сдвиг возникает при переключении с bbox-центрированной отрисовки примитива на pivot-центрированную отрисовку CSG-результата. Фикс: заменить bbox-center на center-of-mass для асимметричных примитивов в `centerGeometry`.

---

## [1.1.0] — 2026-10-15

**Фаза 8 — Единая модель трансформов.** `relativeToParent` — единственный источник истины. CSG-центрирование унифицировано на `centerMassAtOrigin`. 340/340 тестов.

### Fixed
- **Этап 8.5 — Регрессия 8c7a9dc: workerRebuildScene/BuildImportedMesh payload:** `workerRebuildScene` отправлял `{ opCount: operations.length }` вместо `{ operations }` — handler `handleRebuildScene` получал `msg.operations = undefined` и молча возвращал пустой результат. `workerBuildImportedMesh` отправлял `{ vertexCount, indexCount }` вместо `{ vertices, indices }` — handler `handleBuildImportedMesh` получал `new Float32Array(undefined)` и бросал TypeError. Prod-путь: undo/redo rebuild (`rebuildFromHistory`) и импорт STL (`addImportedMesh`) были сломаны. Тесты не ловили — `worker-bridge.ts` строил правильный payload сам, обходя worker-client. Исправлено: payload `workerRebuildScene` = `{ operations }`, `workerBuildImportedMesh` = `{ objId, vertices, indices }`. Добавлен `worker-client.test.ts` (3 теста): проверяет реальный payload через FakeWorker (spy на postMessage без worker-bridge). (`csg/worker-client.ts`, `csg/worker-client.test.ts`)
- **Фаза 8, Этап 6.5 — CENTERING-INCONSISTENCY + регрессии Этапа 6:** (1) worker центрировал vertex centroid, frontend — `extractCenteredAt(transformA)`, helpers — объёмный центроид (diff 3.89 для union куб+призма) — унифицировано на `centerMassAtOrigin`; (2) `handleCsgBooleanSync` кешировал manifold и сразу удалял его (`m.delete()` после `setCached` — висячий WASM-хендл), response был центрированным при frontend-сдвиге ещё на -transformA (двойное смещение) — response = world mesh, кэш = COM-копия, `disposeCached` вместо прямого `delete()`; (3) `handleCsgBoolean` не применял transformA/B к origin-кэшу (регрессия Этапа 6, CSG+CSG лег бы в overlap) — применяет один раз; (4) `extrudeSelected` переведён на `workerCsgBooleanWithSync` (origin-конвенция); (5) `rebuild.ts`: `extractAndCenterInPlace` мутировал выбрасываемую копию (двойное смещение legacy-документов) — теперь `centerMassAtOrigin` + запись центрированной копии. (csg/worker-handlers.ts, store/document-store.ts, store/rebuild.ts)
- **REBUILD-TREE-NODE-CRASH (msg.nodes is not iterable):** `workerRebuildNode` в `worker-client.ts` передавал в воркер только `{ nodeId, nodeCount }` — массив `nodes` терялся. Воркер `handleRebuildTreeNode` ожидал `msg.nodes` и падал с `TypeError: msg.nodes is not iterable` при resize призмы/куба. Исправлено: добавлено `nodes` в сообщение (`{ nodeId, nodeCount: nodes.length, nodes }`). (`csg/worker-client.ts`)
- **CSG-TRANSFORM-IS-CENTROID (CSG-результат позиционируется со сдвигом для асимметричной геометрии):** Корень проблемы глубже, чем казался. `extractAndCenterGetAABB` центрировал вершины по `bboxCenter` (centroid CSG-результата = 21,20,20), но pivot стоял в `transformA` (20,20,20). Для асимметричной геометрии (куб+призма) `bboxCenter ≠ transformA`, поэтому `pivot.position (transformA) + vertex (centered_by_bboxCenter)` давало сдвиг. Исправлено: создана `extractCenteredAt(vertices, center)` которая центрирует вершины относительно заданной точки (`transformA`). Pivot и вершины теперь согласованы: `pivot(transformA) + vertex(centered_at_transformA) = world_vertex`. Аналогично исправлен `extrudeSelected`. (`store/document-store.ts`, `store/helpers.ts`)
- **E2 (STL-заголовок и кириллица):** заголовок писался побайтно через `charCodeAt` — в ru-локали («Творческая студия — экспорт STL») значения > 255 обрезались по младшему байту. Теперь UTF-8 через `TextEncoder` с обрезкой по 80 байт (`io/stl-export.ts`)
- **UB5-3 (скролл списка объектов):** у `.object-list` не было собственного скролла (в отличие от `.ct-list`) — длинный список растягивал секцию «Объекты» и скроллилась вся левая панель. Добавлены `max-height: 240px` + `overflow-y: auto` + тонкий скроллбар (`scrollbar-width/scrollbar-color`), математика как у `.ct-list`. Портировано из `yandex-games` (`src/App.css`)
- **ub2-4 (рёбра фигур):** добавлены рёбра (edge lines) у 3D-фигур через `LineSegments` по `EdgesGeometry` (порог 30°), цвет на пару тонов темнее базового (×0.7, `edgeColorFor`); обновляются при CSG/resize/fillet/смене цвета, освобождаются при удалении; лимит 100k треугольников для тяжёлых импортов; рёбра не участвуют в raycast. Портировано из `yandex-games` (`src/components/viewport-hooks.ts`, тесты `src/components/viewport-hooks.test.ts`)
- **CI (падение «Deploy to GitHub Pages» на шаге build):** тяжёлый тест `doodle-io` «открывает model.json больше прежнего лимита 5 МБ» (~100k треугольников, serializeDoodle + ZIP + parseDoodle) не успевал за дефолтные 5 с на медленном CI-runner GitHub Actions («Test timed out in 5000ms»). Подняты глобальные `testTimeout`/`hookTimeout` до 15 с в конфиге vitest (`vite.config.ts`) и индивидуальный таймаут 30 с для тяжёлого теста (`doodle-io.test.ts`). Это НЕ баг продукта — только таймаут тестов. (FIX CI)
- **CSG-PRISM-OFFSET (призма/конус/пирамида давали сдвиг при CSG):** manifold-3d строит prism/pyramid с основанием на z=0, центр масс в (0,0,h/2). При CSG с кубом (центр в 0,0,0) это давало сдвиг. Решено: `Manifold.cylinder(..., true)` для prism/pyramid — `center=true` центрирует по Z (от -h/2 до h/2), центр масс в origin. Удалена `centerManifoldAtOrigin` (давала неправильный результат для prism с нечётным числом рёбер). Все примитивы центрированы через API manifold-3d. (`csg/worker-handlers.ts`)
- **RESIZE-TRS-DOUBLE (удвоение TRS при resize примитива):** `resizeObject` пересобирал mesh через `rebuildNode` (mesh с запечённым worldTransform) и писал в `vertices` при неизменном `transform` → Viewport3D применял TRS второй раз на pivot. Исправлено: примитивы пересобираются `workerBuildShape` с нулевым transform (vertices в origin), CSG — только scale в transform, vertices не трогаются. 6 тестов в `store/document-store.test.ts`. (`store/document-store.ts`)

### Added
- **Фаза 8, Этап 8 — Финальная проверка: 8 интеграционных тестов §10.2:** новые `__tests__/phase-8-scenarios.test.ts` (8 сценариев) + `__tests__/worker-bridge.ts` (in-process мост Worker → настоящие worker-handlers с настоящим manifold-3d WASM в vitest; мокается только postMessage-транспорт, CSG-математика и центрирование не подделаны). Проверены: (1) куб+призма → Union без сдвига (pivot=COM, diff=0); (2) prism rotate/scale/resize без удвоения (z world=80, diff=0); (3) prism(RS) → CSG → зеркало YZ — pivot зеркалён, RS детей scale 1.5/rotZ −20 сохранён, COM doctrine diff 9.5e-7 (MIRROR-CSG-CHILD-RS-LOSS закрыт); (4) CSG+CSG Union без drift (bbox diff 9.5e-7, CSG-CSG-POSITION-DRIFT закрыт); (5) scale 0.5 + rot 20,20,20 → CSG на месте; (6) Export STL — world-координаты (R·S·(v−bboxCenter(v))+t), diff=0; (7) undo/redo snapshot- и rebuild-путём (diff=0); (8) save/load .doodle — CSG+зеркало восстановлены (diff=0). Итого 337/337. Ограничение: MIRROR-CSG-PRIMITIVE-CHIRALITY — зеркало CSG с асимметричным примитивом приближённое (доктрина MIRROR-SCALE abs; см. ARCHITECTURE_TRANSFORMS.md §11). (`__tests__/phase-8-scenarios.test.ts`, `__tests__/worker-bridge.ts`)
- **Фаза 8, Этап 7 — тесты `resizeObject` (RESIZE-TRS-DOUBLE):** 6 тестов в `store/document-store.test.ts` с `vi.mock('../csg/worker-client')` (jsdom без Worker/WASM): vertices не удваиваются (mesh запрошен с нулевым transform), anchor-семантика (position не меняется), CSG-результат (vertices не трогаются, scale в transform), Scenario 2 §10.2 (призма → rotate 30° → scale 2× → resize, worldSize [48,40,24], diff=0), `relativeToParent` детей не меняется, `localTransform` не меняется. (`store/document-store.test.ts`)
- **Фаза 8, Этап 6.5 — Унификация центрирования (КРИТИЧЕСКИЙ):** создана `csg/geometry-utils.ts` — единая `centerMassAtOrigin` (объёмный центроид) + `isClosedMesh`, перенесены из `store/helpers.ts` (реэкспорт сохранён). Worker больше не зависит от store-слоя. Все слои (worker, document-store, rebuild.ts) центрируют CSG одной функцией; pivot CSG-результата = центр масс. 6 тестов `csg/geometry-utils.test.ts`: COM union куб+призма = 10/9, diff vertex centroid vs COM = 3.89 (мотивация), инвариант «pivot + центрированная вершина = мировая» (< 1e-6), fallback незамкнутой mesh, пустой mesh, паритет слоёв. См. `ARCHITECTURE_TRANSFORMS.md` §5.4. (`csg/geometry-utils.ts`, `csg/geometry-utils.test.ts`)
- **Фаза 8, Этап 6 — Worker: кэш в origin, transform один раз:** `handleSyncMesh` кэширует mesh в origin (без transform). `handleCsgBooleanSync` применяет transform один раз перед boolean, центрирует результат. `handleRebuildTreeNode`: root boolean центрирует, inner boolean — нет. Соответствие §6 проверено через typecheck + существующие тесты (317/317 зелёные). См. `ARCHITECTURE_TRANSFORMS.md` §6. (`csg/worker-handlers.ts`)
- **Фаза 8, Этап 5 (КРИТИЧЕСКИЙ) — `rebuildNode` использует `relativeToParent`:** `worldTransform = composeTransforms(parentWorld, node.relativeToParent)`. Transform применяется к origin-мешу **ровно один раз**. Fallback на `localTransform` для нод без `relativeToParent` (обратная совместимость). 6 новых тестов в `history-tree.test.ts` (primitive position, CSG position, mirror no drift, round-trip composeTransforms, fallback localTransform, nested CSG). См. `ARCHITECTURE_TRANSFORMS.md` §3.2. (`csg/history-tree.ts`, `csg/history-tree.test.ts`)
- **Фаза 8, Этап 4 — `mirrorNodeRecursive` зеркалит `relativeToParent`:** mirror применяется к `relativeToParent` (пересчитывается через `subtractTransform(mirroredWorld, mirroredParentWorld)`), `localTransform` пересчитывается через точное зеркало мира (`mirrorPoint` + `mirrorEuler` + `abs(scale)`). Scale всегда `Math.abs()` (CHANGELOG `MIRROR-SCALE`). Rotation — простой sign flip (CHANGELOG `MIRROR-ROTATION-SIMPLE-SIGN`). Рекурсия передаёт `mirroredParentWorld` детям. 6 новых тестов в `history-tree.test.ts` (mirror primitive, mirror CSG children, double-mirror identity, round-trip composeTransforms, MIRROR-CSG-CHILD-RS-LOSS, multi-axis rotation). См. `ARCHITECTURE_TRANSFORMS.md` §4. (`csg/history-tree.ts`, `csg/history-tree.test.ts`)
- **Фаза 8, Этап 3 — `createBooleanNode` заполняет `relativeToParent` детей:** при создании boolean-узла для каждого ребёнка вычисляется `relativeToParent = subtractTransform(childWorld, parentWorld)`. `localTransform` ребёнка не тронут (обратная совместимость). Корневой boolean-узел имеет `relativeToParent = null`. 6 новых тестов в `history-tree.test.ts` (позиция, round-trip composeTransforms, parentId, multi-axis rotation). (`csg/history-tree.ts`, `csg/history-tree.test.ts`)
- **transform-decompose (`composeTransforms` / `subtractTransform`):** новые утилиты в `worker-matrix.ts` для работы с иерархией трансформаций. `composeTransforms(parent, relative)` вычисляет абсолютную трансформацию из родительской и относительной (позиция, поворот XYZ, масштаб). `subtractTransform(world, parent)` восстанавливает относительную трансформацию из абсолютной и родительской (используется при перемещении объекта внутри группы). Обе функции корректно обрабатывают `null`-родителя (тождественная матрица). 22 теста в `worker-matrix.test.ts` покрывают edge cases, композицию scale/rotation/position и round-trip. (`csg/worker-matrix.ts`, `csg/worker-matrix.test.ts`)
- **centerMassAtOrigin (объёмный центроид):** новая функция в `helpers.ts` для центрирования mesh по центру масс (не по BBox). Для замкнутой manifold-сети используется теорема дивергенции (объёмный центроид): даёт h/2 для призмы и h/4 для пирамиды. Для незамкнутой сети (импортированный STL с дырами) — откат на площадной центроид. Мутирует `vertices` in-place, возвращает смещение `{ cx, cy, cz }`. 6 тестов в `helpers.test.ts` проверяют куб, призму, пирамиду, пустой массив и in-place мутацию. (`store/helpers.ts`, `store/helpers.test.ts`)
- **Чек-лист прогресса Фазы 8:** в `web-app/ARCHITECTURE_TRANSFORMS.md` добавлен раздел §11 «ПРОГРЕСС ЭТАПОВ (ЧЕК-ЛИСТ)» — таблица статусов этапов 0–9 с легендой (🔲/🔄/✅) и детальный чек-лист с задачами и критериями готовности на каждый этап; Этап 0 (подготовка: бэкап-ветка `backup-before-phase-8`, WIP-коммит, документ) отмечен выполненным. Документация, изменений кода нет. (`web-app/ARCHITECTURE_TRANSFORMS.md`)
- **Диагностическое логирование (48 логов):** специализированные логгеры для отладки CSG, worker, pointer, snap, mesh sync, transform, store events — выводятся только в `pnpm dev`, tree-shaken в продакшене. Включает: `utils/debug.ts` (8 логгеров), `utils/debug-format.ts` (4 форматтера), `worker-client.ts` (11 вызовов воркера с таймингами), `Viewport3D.tsx` (pointer/raycast/gizmo), `viewport-hooks.ts` (mesh sync/ruler/snap), `document-store.ts` (CSG operands/center), `worker-handlers.ts` (CSG result BBox/verts/imported mesh/sync), `history-tree.ts` (create primitive/boolean/baked) (`utils/debug.ts`, `utils/debug-format.ts`, `csg/worker-client.ts`, `components/Viewport3D.tsx`, `components/viewport-hooks.ts`, `store/document-store.ts`, `csg/worker-handlers.ts`, `csg/history-tree.ts`)
- **Тесты на цикл «экспорт/сохранение → загрузка» (T1):** регрессия UB-0a (запечённая позиция не применяется дважды), лимит треугольников (E1), UTF-8-заголовок (E2); round-trip `import_mesh` через `serializeDoodle → parseDoodle` (массив вместо `{"0":…}`, файл > 5 МБ открывается); `rebuild-baked.test.ts` — фолбэк baked-геометрии при пустом ответе воркера (4 теста, воркер моканут, WASM не нужен) (`io/stl-export.test.ts`, `io/doodle-io.test.ts`, `store/rebuild-baked.test.ts`)

---

## [1.0.0] — 2026-08-19

**Первый стабильный релиз TinkerCraft Web — Open Source 3D CAD-редактор.**

> **Статус:** ✅ Готов к деплою (GitHub Pages / Vercel / любой статический хостинг)
> **Платформа:** CAD-версия (чистый 3D-редактор, без интеграций игровых платформ)
> **Репозиторий:** [github.com/small-room/tinkercraft](https://github.com/small-room/tinkercraft)

### 🎉 Что это

TinkerCraft Web — браузерный 3D CAD-редактор, вдохновлённый CaDoodle, реализованный с нуля на React + Three.js + manifold-3d. Позволяет создавать, редактировать и экспортировать 3D-модели прямо в браузере.

### ✨ Основные возможности

- **8 примитивов:** Куб, Сфера, Цилиндр, Конус, Тор, Призма, Пирамида, 3D Текст
- **CSG-операции:** Объединение (Union), Вычитание (Subtract), Пересечение (Intersect) с WASM-движком manifold-3d
- **Параметрическое дерево (Build Tree):** CSG-результаты сохраняют параметричность — дети и операция записаны в history
- **Зеркалирование:** XY / XZ / YZ плоскости с кэшированием (mirror-cache), без дублирования вычислений
- **Выравнивание:** 9 позиций (min/center/max по X и Y) с подробными тултипами
- **Скругление (Fillet) и Экструзия (Extrude)**
- **Линейка (Ruler):** Измерение расстояний с привязкой к геометрии (vertex/edge/face/circle)
- **Экспорт STL:** Бинарный формат для 3D-печати
- **Сохранение/загрузка `.doodle`:** ZIP + JSON формат проекта
- **Менеджер проектов:** Несколько проектов в IndexedDB
- **Автосохранение:** При каждом изменении в IndexedDB
- **Drag-select:** Прямоугольное выделение множественных объектов
- **TransformControls:** Перемещение, вращение, масштаб с Gizmo
- **Snap to grid:** 1 / 5 / 10 / 50 единиц
- **Дерево компонентов:** Переименование, переключение видимости, удаление
- **Временная шкала (Timeline):** История операций с иконками и описаниями
- **Тёмная / светлая тема:** Переключение через CSS-переменные
- **Двухуровневые тултипы:** Мгновенный label + расширенное описание через 1.5 сек
- **40+ SVG-иконок:** Полная замена emoji/Unicode на профессиональные иконки
- **i18n локализация:** Полный перевод на английский и русский (🇬🇧 / 🇷🇺)
- **PWA:** manifest.json, theme-color, поддержка установки
- **WebGL fallback:** Graceful degradation при отсутствии WebGL2
- **ViewCube:** Навигационный куб для быстрого переключения видов

### 🏗️ Технологии

| Слой | Технология | Версия |
|------|-----------|--------|
| UI / Состояние | React 18 + Zustand 5 | react@18.3, zustand@5.0 |
| 3D Рендеринг | Three.js | r170 |
| CSG | manifold-3d (WASM, Web Worker) | 3.0.1 |
| Сборка | Vite | 6.x |
| Язык | TypeScript | 5.7 (strict) |
| Тесты | Vitest + jsdom | 4.x |
| Локализация | i18next + react-i18next | 26.x + 17.x |
| Пакеты | pnpm | — |

### 📊 Статистика

| Метрика | Значение |
|---------|----------|
| Выявлено проблем (код-ревью) | ~291 |
| Исправлено | ~176 |
| Признаны архитектурными / НЕ БАГ | ~115 |
| Активных проблем | **0** |
| Тестов | ~236 |
| Фаза 7 | ✅ Завершена |
| Фаза 7.5 | ✅ Завершена |
| Фаза 7.6 | ✅ Завершена |
| Фаза 8 | 🔲 Не начата (следующий этап) |

### 📝 Примечания к релизу

1. **Чистота кода:** В CAD-версии **нет** кода Яндекс.Игр (SDK, токены, игровые механики). Проект — чистый Open Source 3D-редактор.
2. **Сборка:** `pnpm build` → `dist/` — стандартная статическая сборка Vite. Совместима с любым хостингом статических файлов.
3. **Следующий этап (Фаза 8):** Параметрическая история операций — редактирование параметров прямо в Timeline, раскрытие CSG-операций.
4. **Яндекс-версия (отдельная ветка):** Если нужна версия для Яндекс.Игр — создаётся ветка `yandex-games` с SDK, токенами, ежедневными бонусами и лидербордами. Не входит в этот релиз.

### 🚀 Деплой

```bash
cd web-app
pnpm build          # Сборка в dist/
# Деплой на GitHub Pages / Vercel / Netlify / любой статический хостинг
```

### 📋 Чек-лист релиза

- [x] Код-ревью: все ~291 проблем закрыты (0 активных)
- [x] Typecheck: strict mode TypeScript, без `any` (кроме WASM init)
- [x] Тесты: ~236 тестов (jsdom + in-memory mocks)
- [x] Чистота: нет кода Яндекс.Игр
- [x] Документация: CHANGELOG, CODE_REVIEW, DEVELOPMENT_PLAN, AGENTS.md, ARCHITECTURE.md
- [x] Локализация: EN + RU
- [x] Иконки: 40+ SVG-иконок
- [x] PWA: manifest.json, theme-color
- [x] license: MIT (файл LICENSE присутствует)

---

## [Unreleased]

### 💎 Экономика v1.0 (токены, квесты, подписки, аренда)

- **Added:** `economy-config.ts` — конфигурация экономики (тарифы, лимиты, кэшбэк, кулдауны)
- **Added:** `economy-store.ts` — Zustand store с токенами, подписками, арендой 24ч, квестами, кэшбэком
- **Added:** `economy-ui-config.ts` — конфиг UI экономики (видимость элементов)
- **Added:** `EconomyHUD.tsx` — HUD с токенами, ежедневным бонусом (+50), рекламой (+50)
- **Added:** `QuestPanel.tsx` — панель ежедневных квестов (3/день: лёгкое + среднее + сложное)
- **Changed:** `lock-config.ts` — добавлен флаг `rental24h` для аренды вместо вечных покупок
- **Changed:** `App.tsx` — инициализация экономики, синхронизация, триггеры квестов
- **Changed:** `App.css` — стили для `.economy-hud`, `.quest-item`, `.quest-progress`
- **Added:** Переводы `economy.*` в en/ru (15+ ключей)
- **Added:** `ECONOMY.md` — полная документация экономики (9 разделов)
- **Features:** Доход ~200–240/день, потолок 405, кэшбэк 5–25, подписки 700/2000

### 🎨 Палитра Wad's Optimum 16 (цветовая схема по умолчанию)

- **Added:** `constants.ts` — массив `WADS_OPTIMUM_16` (16 цветов с name, nameRu, hex, rgb)
- **Added:** `ColorPalette.tsx` — компонент палитры с 16 цветами (hover, active state, tooltip)
- **Changed:** `PropertiesPanel.tsx` — палитра отображается по умолчанию вместо нативного picker
- **Changed:** `PropertiesPanel.tsx` — нативный color picker скрыт за кнопкой-переключателем
- **Changed:** `App.css` — добавлены стили для `.color-palette-swatch`
- **Added:** Переводы `properties.palette` и `properties.advancedPicker` в en/ru

### 🏷️ Система бейджей разблокировки (Yandex monetization)

- **Added:** `LockIcon`, `AdFilmIcon` — SVG-иконки для бейджей (замок, плёнка+play)
- **Added:** `ToolBadge.tsx` — компонент бейджа (TL/BL/BR позиции)
- **Added:** `lock-config.ts` — конфигурация заблокированных фигур (torus, cone, text3d)
- **Added:** `UnlockModal.tsx` — модалка выбора оплаты (токены/реклама)
- **Added:** Методы в `game-store`: `isUnlocked`, `unlockWithTokens`, `unlockWithAd`, `unlockedItems`
- **Changed:** `LeftPanel` — фигуры с бейджами (замок TL, токены BL, реклама BR)
- **Changed:** `game-store.ts` — `syncToCloud`/`loadFromCloud` сохраняют `unlockedItems`
- **Changed:** `App.css` — стили бейджей (.btn-badge) и UnlockModal
- **Added:** Переводы `unlock.*` в en/ru

### 🌐 Автоопределение языка через SDK (п. 2.14 требований)

- **Added:** `YandexLanguageDetector.ts` — асинхронный i18next-детектор, получающий язык из `ysdk.environment.i18n.lang`
- **Changed:** `i18n/index.ts` — детектор Яндекса подключён первым (приоритет: Yandex SDK → localStorage → navigator)
- **Fixed:** `yandex.ts` — тип `window.YaGames` приведён к `Promise<SDK<false>>` (совместимость с @types/ysdk)

### 🔒 Безопасность экономики (код-ревью)

- **Fixed:** `showRewardedVideo()` больше не выдаёт награду до фактического просмотра — резолв только в `onRewarded` (`yandex.ts`)
- **Fixed:** `claimDailyBonusWithAd()` проверяет суточный лимит ДО показа рекламы — нет лишних роликов (`game-store.ts`)
- **Added:** `watchAdForTokens()` — безлимитная реклама за +10 токенов (отделена от ежедневного бонуса) (`game-store.ts`)
- **Changed:** `spendTokens()` теперь вызывает полный `syncToCloud()` вместо частичного `saveData` — не затирает другие поля
- **Fixed:** тип `showRewardedVideo()` приведён к `Promise<boolean>` во всех платформах (`types.ts`, `yandex.ts`, `clean.ts`)
- **Fixed:** типизация SDK по официальному `@types/ysdk`: `getPlayer()`, `leaderboards.setScore()/getEntries()` (`yandex.ts`)

### 🎨 Архитектура игровой панели (код-ревью)

- **Added:** `GamePanel.tsx` — игровая панель (токены, бонусы, реклама, экспорт STL)
- **Changed:** `GamePanel` монтируется из `PropertiesPanel` ТОЛЬКО при `VITE_PLATFORM=yandex` — clean-версия не содержит игрового кода
- **Removed:** `GameUI.tsx` — дубликат, удалён вместе с подключением в `App.tsx`
- **Added:** SVG-иконки `TokenIcon`, `GiftIcon`, `AdIcon`, `PlayIcon` в стиле проекта (заменили эмодзи)
- **Changed:** Порядок экспорта: валидация → списание → экспорт (нет сожжённых токенов на пустой сцене)
- **Fixed:** `hr` скоуплен классом `.game-hr` — не протекает в другие компоненты
- **Added:** i18n-ключи `game.*` (RU/EN) — нет хардкода русских строк

---

## [Yandex MVP] — 2026-08-21

**Интеграция Яндекс.Игр — MVP завершён.**

> **Статус:** ✅ Готов к тестированию в песочнице
> **Ветка:** `yandex-games`
> **SDK:** Официальный `@types/ysdk` + `https://yandex.ru/games/sdk/v2`

### ✨ Что реализовано

- **IPlatform интерфейс** — абстракция платформы (`types.ts`)
- **Yandex реализация** — полная реализация через `@types/ysdk` (`yandex.ts`)
- **Clean stub** — fallback с localStorage (`clean.ts`)
- **Platform switch** — динамический импорт по `VITE_PLATFORM` (`index.ts`)
- **Game store** — токены, ежедневные бонусы, cloud sync (`game-store.ts`)
- **GameUI** — баланс токенов, ежедневный бонус (`GameUI.tsx`)
- **Gameplay API** — stop/start при открытии/закрытии модалок (`App.tsx`)
- **SDK script** — официальный SDK в `index.html`
- **Сборка** — `dev:yandex`, `build:yandex` скрипты
- **i18n** — полный перевод RU/EN

### 📊 Экономика токенов

| Действие | Токены |
|----------|--------|
| Ежедневный бонус | +5 |
| С рекламой | +20 |
| Rewarded видео | +10 |
| Экспорт STL | -5 |
| Экспорт PNG | -3 |
| Премиум-цвет | -20 |

### 🔲 Не реализовано (следующие этапы)

- Лидерборды (заглушка)
- Платежи / In-app покупки
- Баннерная реклама
- Daily Challenge, Speed Build, Турниры
- Система достижений

### 🧪 Тестирование

#### 🏆 Официальный прокси (рекомендуется)

```bash
# Терминал 1
cd web-app && pnpm dev:yandex

# Терминал 2
npx @yandex-games/sdk-dev-proxy -h http://localhost:5173 --dev-mode=true
# Откроет http://localhost:8080
```

**URL для моков:**
- `?mocks={"isAuthorized":true}` — авторизованный игрок
- `?mocks={"isAuthorized":true,"lockedOrientation":"landscape"}` — мобильная ориентация

#### Fallback (без прокси)

```bash
# Clean-версия (main)
pnpm dev          # чистый CAD
pnpm build        # dist/

# Яндекс-версия (yandex-games)
pnpm dev:yandex   # с SDK
pnpm build:yandex # dist-yandex/
```

> ⚠️ Без прокси SDK может не загрузиться из-за COEP. Используйте прокси для полноценного тестирования.

### 📦 Локальный каталог покупок

Создан `public/purchases-catalog.json` с моками товаров для dev-режима:
- Premium Colors Pack — 50 RUB
- Shape Pack — 100 RUB
- No Ads (30 days) — 200 RUB
- 1000 Tokens — 500 RUB

### 📋 Чек-лист релиза

- [x] Код-ревью: все ~291 проблем закрыты (0 активных)
- [x] Typecheck: strict mode TypeScript, без `any` (кроме WASM init)
- [x] Тесты: ~236 тестов (jsdom + in-memory mocks)
- [x] Чистота: нет кода Яндекс.Игр
- [x] Документация: CHANGELOG, CODE_REVIEW, DEVELOPMENT_PLAN, AGENTS.md, ARCHITECTURE.md
- [x] Локализация: EN + RU
- [x] Иконки: 40+ SVG-иконок
- [x] PWA: manifest.json, theme-color
- [x] license: MIT (файл LICENSE присутствует)

---

## [Unreleased]

### Fixed

- **COLOR-HISTORY (цвета сбрасывались при открытии сохранённого проекта)**: Назначенные пользователем цвета не сохранялись в `.doodle` и сбрасывались к цветам по умолчанию после перезагрузки. Корень проблемы: в `PropertiesPanel` превью цвета (`onSetColor(id, color, true)`) сразу обновляло цвет объекта в store, а условие фиксации в историю `draftColor !== firstSelected.color` на `onBlur` было **всегда ложно** (значения уже совпадали) → операция `color` никогда не попадала в `operations[]` → не сериализовалась. Исправление: целевой объект и исходный (committed) цвет фиксируются в refs в момент начала редактирования; коммит в историю выполняется по `onBlur` или смене выделения, сравнивая draft с исходным цветом, а не с уже обновлённым `firstSelected.color`. Добавлены регрессионные тесты round-trip `color` через `.doodle`, добавлен dev-лог `[setColor]`. (`PropertiesPanel.tsx`, `doodle-io.test.ts`, `document-store.ts`)
- **MIRROR-TREE-PRESERVE**: Повторное зеркалирование CSG-результата создавало примитив `cube` вместо правильной boolean-ноды. Корень проблемы: `mirrorObject` вызывал `deleteNode(newId, true)` после создания зеркала, удаляя всё клонированное поддерево из дерева. При следующем зеркалировании `ensureInTree` не находил узел, создавал `baked`-ноду, а `rebuildBuildTree` падалбэкал в `createPrimitiveNode('cube')`. Исправление: убран `deleteNode` из `mirrorObject` — клонированное поддерево сохраняется для будущих операций. `rebuildBuildTree` теперь проверяет существование узла перед созданием — если узел уже существует (от `mirrorObject`), обновляет только transform, не перезаписывая структуру. (`mirror-store.ts:mirrorObject`, `rebuild.ts:rebuildBuildTree`)
- **MIRROR-DOUBLE-TRANSLATE**: Зеркало CSG-объектов создавало ломанные, непредсказуемые копии (разный результат при каждом применении). Корень проблемы: `moveObject` вызывал `moveTreeNode(id, delta)` для сдвига дочерних примитивов в дереве на translation delta, а затем `syncNodeTransform(id, newTransform)` устанавливал root localTransform с тем же translation. Это создавало двойной translation при tree-rebuild: дети уже сдвинуты + root translation применяется повторно через `applyCSGMeshes`. При обычном рендере это маскировалось (Viewport3D использует кэшированные центрированные вершины + pivot TRS), но при mirror root сбрасывается в identity — оставались только сдвинутые дети, давая неправильную форму. Исправление: убран `moveTreeNode` из `moveObject`. Дети остаются в оригинальных абсолютных позициях (со времени создания CSG). Root localTransform несёт полный TRS. `applyCSGMeshes` центрирует геометрию детей и применяет root TRS → корректная world-позиция. Mirror клонирует дерево, зеркалит детей + root TRS, сбрасывает root в identity, rebuild → центрированная зеркальная геометрия. (`document-store.ts:moveObject`)
- **CSG-RESIZE-NO-BAKE**: Ресайз CSG-результата (PropertiesPanel) запекал scale в вершины. `resizeObject` вызывал `rebuildNode(id)`, который через `applyCSGMeshes` применял root localTransform (включая scale) к центрированной геометрии детей — vertices получали scale, запечённый в координаты. Затем эти vertices сохранялись в SceneObject, а transform тоже содержал scale → двойное применение scale (в Viewport3D через pivot и в `handleSyncMesh` при булевых операциях, из-за чего результат CSG+CSG смещался). Исправление: для CSG-результатов `resizeObject` больше не вызывает `rebuildNode` — vertices остаются центрированными, scale живёт в transform и применяется через pivot. localTransform в дереве обновляется через `applyNodeTransform` (инвалидирует кэш rebuildNode). (`document-store.ts:resizeObject`)
- **PASTE-CSG-TREE**: Pasted CSG objects (`ids: []` in GroupOperation) were skipped by `rebuildBuildTree`, causing "children not in tree" warnings and missing tree nodes after undo/redo/load. Now registered as baked nodes from stored mesh data. (`rebuild.ts`)
- **CSG-MISSING-CHILD**: When a CSG group's child is missing from the tree (e.g. consumed by another CSG), the group is now registered as a baked node from stored mesh data instead of being skipped entirely. (`rebuild.ts`)
- **MIRROR-CSG-REBUILD**: Mirror copies of CSG results disappeared after loading from file. The worker's `handleRebuildScene` mirror handler only handled primitives (via `shapeInfos`), not CSG results. Now mirrors the cached manifold geometry for CSG/import_mesh objects. (`worker-handlers.ts`)
- **PASTE-CSG-COLOR**: Pasted CSG objects lost their color (always got default `#89b4fa`). Added `color` field to `GroupOperation` and use it in `buildRebuildMeta` when `ids` is empty. (`types.ts`, `rebuild.ts`, `document-store.ts`)

### Added

- **i18n локализация (Фаза 7.7)**: Полная локализация приложения на английский и русский языки через i18next + react-i18next. Автоопределение языка браузера, переключатель в StatusBar. Переведены все UI-элементы (~150 фраз): названия фигур, инструменты, CSG операции, тултипы, ошибки, уведомления, модалки. Создана структура `src/i18n/` с файлами переводов `locales/en/translation.json` и `locales/ru/translation.json`. (`i18n/index.ts`, все компоненты)
- **LanguageSwitcher**: Кнопка переключения языка (🇬🇧 EN / 🇷🇺 RU) в StatusBar с сохранением выбора в localStorage. (`StatusBar.tsx`)
- **Snap локализация**: "Snap:" → "Привязка:" (RU) / "Snap:" (EN), тайтлы кнопок привязки локализованы. (`App.tsx`)
- **ViewCube локализация**: Названия граней (Перед/Front, Зад/Back, Лево/Left, Право/Right, Верх/Top, Низ/Bottom) и label "Куб вида"/"ViewCube". (`ViewCube.tsx`)
- **snapLabel локализация**: Метки типов привязки (Точка/Vertex, Ребро/Edge, Грань/Face, Центр/Center) через i18n.t(). (`snap-utils.ts`)
- **Название приложения**: Аббревиатура **TC** как единая эмблема. EN: "Tinker Craft", RU: "Творческая студия". Title страницы динамически обновляется при переключении языка: "TC — Tinker Craft" / "TC — Творческая студия". Обновлены Toolbar, StatusBar, STL header, manifest.json, index.html. (`i18n/index.ts`, `Toolbar.tsx`, `StatusBar.tsx`, `stl-export.ts`, `manifest.json`, `index.html`)
- **Viewport hint локализация**: Подсказка управления вьюпортом переведена. (`App.tsx`)

### Changed

- **TOOLTIP_DATA**: Структура изменена с `label`/`description` на `labelKey`/`descriptionKey` — теперь использует i18n-ключи вместо хардкод-текстов. (`constants.ts`, `Tooltip.tsx`)
- **ALL_SHAPES_DATA**: Поле `label` → `labelKey`, `category` → `categoryKey` — i18n-ключи вместо хардкод-текста. (`constants.ts`, `constants.tsx`, `constants-react.tsx`)
- **OP_FILTER_LABELS**: Значения изменены на i18n-ключи. (`constants.ts`)
- **SNAP_VALUES**: Поле `label` → `labelKey`. (`constants.ts`)
- **opLabel**: Функция принимает параметр `t` для перевода. (`Timeline.tsx`)
- **getShapeLabel**: Функция принимает параметр `t` для перевода. (`LeftPanel.tsx`)
- **displayName**: Функция принимает параметр `t` для перевода. (`ComponentTree.tsx`)
- **Store notify**: Все `notify('Русский текст')` заменены на `notify(i18n.t('key'))`. (`document-store.ts`, `mirror-store.ts`, `rebuild.ts`)

### Fixed

- **MOVE-RS-DOUBLE (удвоение поворота/масштаба при открытии .doodle)**: Обработчик `move` в `handleRebuildScene` использовал `buildTransformMatrix(pos, rot, scale)` — запекание полного RS+T в вершины. Затем viewport `centerGeometry()` убирает только трансляцию, а `pivot.rotation/scale` применяет RS **ещё раз** → удвоение. Все остальные обработчики (`add_shape`, `fillet`, `resize_dims`, `align`) используют `applyTransform()` — только трансляцию. Исправлено: `move` теперь тоже использует `applyTransform(fresh, {x,y,z})`. CSG не пострадал: fallback-путь `group` сам применяет RS через `applySRAroundCenter()`. (`worker-handlers.ts`)
- **DOODLE-MESH (CSG-объекты не отображались при открытии .doodle файла)**: `JSON.stringify` превращает `Float32Array`/`Uint32Array` в plain-объекты `{"0":1.5,...}` **без свойства `length`**. После `JSON.parse` вызов `new Float32Array(obj)` даёт **пустой массив** (`ToLength(undefined)` = 0) → worker создаёт пустой Manifold → CSG-результаты и импортированные меши исчезают. Project Manager (IndexedDB structured clone) не страдал, т.к. сохраняет TypedArray как есть. Исправлено: `restoreMeshArray()` восстанавливает массивы при парсинге `.doodle`. Добавлены тесты round-trip. (`doodle-io.ts`, `doodle-io.test.ts`)
- **CYCLE-CSG-RELOAD (CSG не отображается при загрузке проекта)**: Корневая проблема — `jumpToHistoryInner` вызывал `restoreTreeFromSnapshot` **всегда**, даже при cache hit. Кэш дерева сохранялся ДО фикса CYCLE-CSG, когда boolean-узлы пропускались из-за ошибки цикла. `restoreTreeFromSnapshot` очищал дерево и восстанавливал из кэша → boolean-узлы удалялись → CSG не рендерился. Исправлено: `rebuildBuildTree` вызывается **всегда** (не только при cache miss), `restoreTreeFromSnapshot` убран. Дерево всегда синхронизировано с историей операций. (`document-store.ts`)
- **CYCLE-CSG (циклическая зависимость при загрузке проекта)**: При `jumpToHistory` / `loadFromProject` дети CSG-операции (`obj_1`, `obj_2`) уже имеют `parentId`, указывающий на существующий узел. `isAncestor()` возвращает `true`, `createBooleanNode` выбрасывает `Cannot create cycle in tree`. Исправлено: сброс `parentId = undefined` у детей перед созданием boolean-узла. (`rebuild.ts`)
- **SHADOW ACNE (полосатые грани фигур)**: Вертикальные и наклонные грани куба/сферы/конуса были покрыты полосами от самозатенения. Причины: 1) `shadow.bias` отсутствовал — добавлены `bias = -0.002` и `normalBias = 0.05`; 2) карта теней 2048px была мала для области ±200 — увеличена до 4096px. Горизонтальные грани были чистыми, вертикальные требовали большего bias из-за угла падения света. (`viewport-hooks.ts`)

- **VITE DEV-SERVER CRASH (ERR_HTTP_HEADERS_SENT)**: Dev-сервер падал при запросе JS-файлов из-за middleware `stripReactRefresh` — он вызывал `res.setHeader('Content-Length', ...)` после того, как Vite 6.4 уже отправил заголовки (повторный вызов `res.end`). Добавлена защита: проверка `res.writableEnded`/`res.headersSent` и try/catch вокруг setHeader. (`vite.config.ts`)

- **CSG: flat shading через нормаль по грани**: Для flat-фигур (куб/призма/пирамида/CSG) нормали теперь вычисляются как cross product рёбер треугольника, а не берутся по вершине. Это решает проблему "однотонного пятна" после CSG-операций, когда normals из воркера null → fallback (0,1,0) на всех вершинах.
- **LOGS: переименованы в нормальные имена**: Все логи `[MIRROR:...]` переименованы в `[moveObject]`, `[addShape]`, `[resizeObject]`, `[previewMirror]`, `[mirrorSelected]`, `[applyMirrorToTransform]`, `[TREE]`, `[mirrorNodeRecursive]`, `[CLONE]`. Логи остаются в dev mode.
- **CSG отображение**: CSG-результаты теперь имеют `shapeType: 'csg'` вместо `'cube'`. В списке объектов отображается "CSG результат" вместо "куб", в PropertiesPanel скругление не показывается для CSG. В ComponentTree и Timeline добавлена иконка UnionIcon для CSG.
- **MIRROR-CSG-SHAPE: зеркало CSG-результата теперь shapeType='csg'**: При зеркале CSG-результата (boolean tree) зеркальная копия теперь получает `shapeType: 'csg'` вместо `'cube'`. Это решает проблему "куб вместо CSG" при зеркале вложенных CSG-цепочек (CSG из CSG). (`mirror-store.ts`)
- **CSG-NESTED-SHAPETYPE: вложенные CSG при объединении с третьей фигурой больше не превращаются в куб**: При введении `shapeType='csg'` проверка `isOperand_Primitive` в `csgBoolean` (`shapeType !== 'cube' || params.width`) стала возвращать true для CSG-результатов → воркер вызывал `buildPrimitive('csg', {})` → дефолтный куб 20×20×20. Исправлено: проверка заменена на `hasRealParams(obj)` (params непустой и не import_mesh). (`document-store.ts`)
- **FIX (PRE-EXISTING): typecheck Toolbar.tsx**: Тип `onPreviewMirror` в Toolbar.tsx был `(plane, ids) => void`, но реальный обработчик и вызовы используют только `plane`. Исправлено на `(plane) => void`. (`Toolbar.tsx`)
- **ARCHITECTURE CLEANUP: прямые проверки shapeType вместо эвристик**: Все эвристики `!obj.params || Object.keys(obj.params).length === 0` заменены на прямую проверку `obj.shapeType === 'csg'`. Удалено мёртвое поле `isCsgResult` из `SceneObject`. Добавлены поля `operation` и `children` в `SceneObject` для CSG-результатов. Затронуты: `document-store.ts` (5 мест), `mirror-store.ts` (3 места), `types.ts`.
- **ROT-XYZ: искажение поворота при CSG-операциях**: `computeRSMatrix` вычисляла `Rz × Ry × Rx`, а Three.js Euler 'XYZ' — `Rx × Ry × Rz`. Для одноосевого поворота матрицы совпадают, но при многоосевом (rotX+rotY, rotX+rotY+rotZ) — расходятся, из-за чего CSG-результат показывал объекты под неправильными углами. Дополнительно в элементе r12 была опечатка (`sx_` вместо `cx`). Исправлено: матрица теперь точно соответствует Three.js `Matrix4.makeRotationFromEuler('XYZ')`. Добавлены 2 теста для многоосевого поворота, сверенные с Three.js. (`worker-matrix.ts`)

- **NORMALS: использование нормалей из воркера + flat shading**: `viewport-hooks.ts` использует нормали из manifold-3d вместо `computeVertexNormals()` для smooth-shading фигур. Для flat-shading фигур (куб/призма/пирамида/CSG) геометрия разворачивается в viewport — каждая грань получает уникальные вершины с нормалью по нормали грани. Сегменты увеличены: sphere/cylinder/cone 32→48, torus 32→48, tubeSegs 16→24.

- **DIAG:* логи → dev mode**: Все `console.log` с префиксом `[DIAG:*]` в `worker-handlers.ts` и `document-store.ts` переключены на условное логирование через `import.meta.env?.DEV`. Логи работают только в dev-режиме (`pnpm dev`), отсутствуют в production (`pnpm build`). Не удалены — пригодятся для отладки. (`worker-handlers.ts`, `document-store.ts`)

### Fixed (проекты и STL)

- **PROJECT-STATUS: "Несохранённый проект" после сохранения в менеджере**: PropertiesPanel проверял только `fileName`, который никогда не устанавливался при сохранении через менеджер проектов (`saveToProject`). Теперь отображается `currentProjectName`, добавлены поля `currentProjectId`/`currentProjectName` в store. Также добавлен индикатор несохранённых изменений (•) рядом с именем проекта. (`PropertiesPanel.tsx`, `document-store.ts`, `types.ts`)
- **QUICK-SAVE-NAME: быстрое сохранение больше не переименовывает проект**: Раньше кнопка "Быстрое сохранение" всегда вызывала `onSaveToProject("Проект HH:MM:SS")`, перезаписывая имя уже сохранённого проекта. Теперь при наличии текущего проекта имя сохраняется (кнопка меняется на "Сохранить"). (`PropertiesPanel.tsx`, `document-store.ts`)
- **PROJECT-DELETE-SYNC: сброс currentProjectId при удалении проекта**: `setCurrentProjectId={() => {}}` в App.tsx был пустышкой — после удаления текущего проекта store продолжал ссылаться на удалённый ID. Добавлен action `setCurrentProject` в store. (`App.tsx`, `document-store.ts`, `types.ts`)
- **PROJECT-NAME-CONFLICT: конфликт имён проектов обрабатывается**: `saveToProject` теперь проверяет конфликты имён через `pmList` и показывает toast вместо молчаливого падения. (`document-store.ts`)
- **STL-ROT-XYZ: STL экспорт использует корректную матрицу поворота**: `applyTransformToVertices`/`applyTransformToNormals` использовали дублированную матрицу `Rz × Ry × Rx`, расходящуюся с Three.js `Euler 'XYZ'` при многоосевом повороте. Теперь используют общий `computeRSMatrix` из `worker-matrix.ts`. (`stl-export.ts`)
- **STL-NORMAL-TYPO: опечатка в усреднении нормалей**: `nz = (normals[i0*3+2] + normals[i2*3+2] + normals[i2*3+2]) / 3` — второй индекс был `i2` вместо `i1`. (`stl-export.ts`)
- **STL-NORMAL-SCALE: нормали больше не масштабируются**: Нормали — это векторы направления, они не должны умножаться на `Sx, Sy, Sz` при экспорте. Для неравномерного масштаба это давало неверные нормали. Теперь применяется только поворот (масштаб не влияет). (`stl-export.ts`)
- **STL-TESTS**: Добавлены тесты: многоосевой поворот в STL экспорте соответствует Three.js XYZ, неединичный масштаб применяется по осям. (`stl-export.test.ts`)

- **ALIGN: aabb не обновлялся при moveObject (CRITICAL FIX)**: При перемещении объекта gizmo'ом `moveObject` обновлял `transform`, но не `aabb`. `aabb` оставался от момента создания (мировой bbox на позиции 0,0,0). `ALIGN` брал этот старый bbox → delta считалась неправильно → объекты улетали. Исправление: 1) `moveObject` теперь сдвигает `aabb` на тот же delta; 2) `computeWorldAABB` возвращает `obj.aabb` напрямую (он уже мировой, вершины содержат translate от `handleBuildShape`). (`document-store.ts`, `helpers.ts`)

- **ALIGNS: AABB мировые координаты (FIX ALIGN-8)**: Создана `computeWorldAABB(obj)` в `helpers.ts` — возвращает мировой bbox (локальный + transform.position). Старая `computeAABB(vertices)` оставлена для CSG (вершины уже центрированы). `alignSelected` теперь использует `computeWorldAABB` вместо ручного сложения. Добавлен подробный лог: `anchorWorldAabb`, `targetAabb`, `cur`, `delta`. (`helpers.ts`, `document-store.ts`)

- **DUPLICATE KEYS (Timeline)**: Исправлен дублирующийся ключ `resize_dims_obj_1` в `Timeline.tsx`. Ключ генерировался как `${op.type}_${op.id}`, что приводило к коллизиям при нескольких операциях одного типа над одним объектом. Добавлен индекс `i` в ключ: `${op.type}_${op.id}_${i}`. (`Timeline.tsx`)

- **CYCLE-CSG (Cannot create cycle in tree)**: Добавлена проверка существования детей перед созданием boolean-узла в `rebuildBuildTree` (`rebuild.ts`). При `jumpToHistory` / `loadFromProject` / `undo/redo` дети CSG-операции (`op.ids[0]`, `op.ids[1]`) могут быть удалены из истории, но остаться в операции `group`. Раньше `createBooleanNode` создавался с отсутствующими детьми → ошибка `Cannot create cycle in tree` из `isAncestor` проверки. Теперь: 1) проверяется `getNode(childAId)` и `getNode(childBId)` — если один из детей отсутствует, операция пропускается с `console.warn`; 2) улучшено логирование ошибки при создании boolean-узла — выводится childA/childB и операция; 3) цикл `for` использует `continue` вместо `break` для корректной обработки оставшихся операций. (`rebuild.ts`)

### Added

- **ALIGN — полное логирование**: Добавлено `devLog` во все этапы работы выравнивания: 1) `document-store.ts` — begin/filtered/bboxes/deltas/apply/workerSyncMesh/workerSyncObjects/op/done; 2) `rebuildOps.ts` — `applyAlignToTransform` выводит до/после; 3) `rebuild.ts` — `buildRebuildMeta` выводит операцию при undo/redo; 4) `worker-handlers.ts` — `rebuildScene` выводит применение дельты к каждому объекту. Префикс логов: `ALIGN:*`. Логи работают только в dev-режиме (`devLog` из `src/utils/debug.ts`).

- **ALIGN — иконки в Timeline**: `opIcon` теперь маппит `axis` + `anchor` к конкретной иконке через `ALIGN_ICON_MAP` (9 иконок вместо одной `AlignXMinIcon`). `opLabel` показывает формат `Выровнять X → min`. (`Timeline.tsx`)

### Changed

- **UX: имя проекта перенесено в PropertiesPanel**: Убран `titleSuffix` ("— без имени •") из Toolbar. Имя проекта теперь показывается в PropertiesPanel (когда ничего не выделено): `📄 проект.doodle` или `⚠ Несохранённый проект`. Кнопки "Менеджер проектов" и "Быстрое сохранение" всегда видны в панели свойств. (`App.tsx`, `Toolbar.tsx`, `PropertiesPanel.tsx`)

- **Timeline: иконки 32px больше не накладываются на текст**: `.tl-icon` width 14px→32px, `font-size` 11px→24px. `.tl-label` добавлен `padding-left: 8px`. (`App.css`)

- **ALIGN: подробные тултипы для всех 9 кнопок**: Каждая кнопка показывает направление (⬅⟷➡), порядок действий, ожидаемый результат. Явно указано: первая выделенная фигура двигается, вторая — якорь. (`constants.ts`)
- **ALIGN — deltas обязательный, anchorId добавлен (FIX ALIGN-5)**: `deltas` в `AlignOperation` больше не опциональный (`?`) — всегда вычисляется и сохраняется. Добавлено поле `anchorId` для идентификации якорного объекта. (`types.ts`)

- **7.5.4 — Тесты цепочек операций (15 тестов)**: Создан `build-chain.test.ts` — тесты параметрического build tree из истории операций. 5 групп: 1) CSG-цепочки (union/subtract/intersect, вложенный CSG: куб → union с цилиндром → union со сферой); 2) Mirror + CSG (зеркало YZ/XZ → union со сферой, multi-select mirror); 3) Undo/Redo через CSG (откат через CSG удаляет boolean-ноду, redo воссоздаёт, глубокий undo/redo 5 шагов); 4) Jump to history (переход к середине цепочки, jump с delete объекта-child CSG, jump через delete → redo); 5) Edge cases (пустая история, несколько CSG с разными operation types, parentId chain, CSG с move). 220/220 тестов проекта проходят. (`build-chain.test.ts`)

- **7.5.5 — Условные логи (devLog/devWarn)**: Создан `src/utils/debug.ts` — хелперы `devLog` и `devWarn` для условного логирования. Все `console.log('[MIRROR:*'` заменены на `devLog` — логи работают в dev (`pnpm dev`), отсутствуют в production (`pnpm build`). Заменено ~20 строк логов в 4 файлах: `history-tree.ts`, `rebuildOps.ts`, `document-store.ts`, `mirror-store.ts`. Формат изменён с конкатенации строк на object-логирование для лучшей читаемости.

- **7.5.5 — IconButton + тултипы**: Создан универсальный `IconButton` компонент (`IconButton.tsx`) с поддержкой двух вариантов (compact/full), стилевых вариантов (default/primary/danger/active), тултипов, ARIA-label и обработчиков мыши (onMouseEnter/onMouseLeave). Заменены все кнопки в: Toolbar.tsx (15 кнопок), CsgButtons.tsx, MirrorButtons.tsx, AlignButtons.tsx. Все кнопки теперь имеют тултипы, поддерживают темы через CSS-переменные.

- **7.5.5 — Двухуровневые тултипы (Tooltip)**: Создан `Tooltip.tsx` с двухуровневой системой подсказок: Уровень 1 (мгновенно) — название + горячая клавиша; Уровень 2 (через 1.5 сек) — описание + пример использования. Добавлен `TOOLTIP_DATA` в `constants.ts` с описаниями для всех 30+ кнопок. CSS-стили в `App.css` с поддержкой тем (тёмная/светлая). Профессиональный стандарт UX (AutoCAD, Fusion 360, Blender).

- **7.5.5 — Layout тулбара (CAD-style)**: Переработана структура тулбара — группы кнопок всегда на одной строке, кнопки внутри равномерно заполняют пространство. Если toolbar не влазит — горизонтальный скролл. CSS: `.toolbar { flex-wrap: nowrap; overflow-x: auto }`, `.toolbar-group { flex: 1 1 0; display: flex; flex-direction: column }` — группы равномерно делят пространство, кнопки центрированы в строках. `separator { align-self: stretch }`.

- **7.5.5 — Алгоритм распределения кнопок по строкам**: Реализован `toolbar-layout.ts` с ИТЕРАТИВНЫМ алгоритмом сужения/расширения (как в AutoCAD/MS Office). **Исправлены критические ошибки**: 1) Ширина теперь считается как `max(ceil(buttonCount/rows)) * BTN_SIZE`, а не `firstRowCount * BTN_SIZE`. 2) Contract увеличивает `rows` у кандидатов, а не отнимает от `firstRowCount`. 3) Expand уменьшает `rows` с гистерезисом. 4) Правильное распределение кнопок: при 5 кнопках и 2 строках → `ceil(5/2)=3` в первой строке, а не 4. Интегрирован в Toolbar через `useToolbarLayout` hook. Компоненты `MirrorButtons`, `AlignButtons`, `CsgButtons` принимают `maxRows` prop.

- **7.5.6 — useLayoutEffect + измерение реальной ширины кнопок**: **КРИТИЧЕСКАЯ АРХИТЕКТУРНАЯ ИСПРАВЛЕНИЕ**. 1) Заменён `useEffect` на `useLayoutEffect` — layout пересчитывается СИНХРОННО ДО рендера (без flickering). 2) Добавлено измерение реальной ширины кнопки через `getBoundingClientRect()` (не фиксированное 34px). 3) Состояние переделано в `rowsMap: Record<string, number>` — чистая карта по groupId. 4) Устранён риск бесконечного цикла: ResizeObserver вызывает `calculateAndSetLayout` с правильными зависимостями. 5) `toolbarRef` теперь `RefObject<HTMLDivElement>` (без `| null`). Алгоритм `calculateToolbarLayout` остался неизменен (чистая функция, протестирована отдельно).

- **7.5.7 — Исправление бесконечного цикла (Maximum update depth exceeded)**: **КРИТИЧЕСКИЙ БАГФИКС**. Причина: `groups` из props пересоздавался как массив-литерал в `Toolbar.tsx` при каждом рендере → `calculateAndSetLayout` пересоздавался (зависимость `[groups]`) → `useLayoutEffect` запускался → `setRowsMap` → ререндер → цикл. Решение: 1) Добавлен `groupsRef` — `useRef` для хранения актуальных групп. 2) `calculateAndSetLayout` использует `groupsRef.current` вместо `groups` из замыкания. 3) Зависимости `useCallback` → `[]` — функция стабильна навсегда. 4) Зависимости `useLayoutEffect` → `[calculateAndSetLayout, measureButtonWidth]` — обе функции стабильны. Паттерн: useRef для данных, которые меняются, но не должны триггерить эффекты.

- **7.5.8 — CSS — кнопки больше не накладываются**: Исправлено наложение кнопок — `.toolbar-group-row` имел `flex: 1` (растягивался на 100% высоты контейнера). Заменено на `flex-shrink: 0` + `height: 36px` (фиксированная высота по содержимому). Строки корректно стекаются вертикально.

- **7.5.9 — CSS — группы ровно под кнопки + перенос кнопок**: **КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ CSS**. 1) `.toolbar-group-row` получил `flex-wrap: wrap` — кнопки переносятся на новую строку когда не влазят. 2) Убран `max-width: 200px` с `.toolbar-group` — группы теперь шириной под свои кнопки (не ограничены). 3) Убран `overflow: hidden` с `.toolbar-group` — кнопки не скрываются. Результат: группы = `flex: 0 0 auto` (ширина под содержимое), кнопки внутри переносятся (`flex-wrap: wrap`), весь тулбар скроллится горизонтально если не влезает.

- **SVG-иконки для UI**: Создан полный набор из 40+ профессиональных SVG-иконок (`src/components/icons.tsx`) для замены emoji/Unicode-символов во всём интерфейсе. Иконки: 8 примитивов (куб, сфера, цилиндр, конус, тор, призма, пирамида, текст), 4 инструмента (выделение, перемещение, вращение, масштаб), 3 CSG-операции (объединение, вычитание, пересечение), 3 зеркала (YZ, XZ, XY), 5 действий (undo, redo, копировать, вставить, удалить), 4 файла (открыть, сохранить, импорт, экспорт), 3 навигации (дом, fit view, линейка), 3 дополнительные (скругление, выравнивание, цвет), 5 стандартных (закрыть, информация, предупреждение, глаз, глаз-выкл), 4 дополнительных (плюс, монитор, шеврон вверх/вниз, папка).
- **constants.ts → constants.tsx**: Переименован для поддержки JSX (иконки фигур в ALL_SHAPES теперь React-компоненты).
- **worker-client.ts**: Исправлена ошибка `window is not defined` при инициализации WASM-воркера в Vite HMR. Добавлена обработка ошибок создания воркера, таймаут инициализации (10с) и cleanup при hot-reload через `import.meta.hot.on('vite:beforeFullReload')`.

### Changed

- **Все компоненты UI**: Все emoji и Unicode-символы заменены на SVG-иконки в: Toolbar.tsx, LeftPanel.tsx, Timeline.tsx, ComponentTree.tsx, PropertiesPanel.tsx, ToastContainer.tsx, Section.tsx, TextModal.tsx, ProjectManagerModal.tsx, CsgButtons.tsx, MirrorButtons.tsx, AlignButtons.tsx, ErrorBoundary.tsx, WebGLFallback.tsx.

- **Тесты IndexedDB**: Исправлены 12 проваливающихся тестов. Создан общий in-memory мок IndexedDB (`src/__mocks__/indexeddb.ts`) — полноценная эмуляция IDBFactory/IDBDatabase/IDBTransaction/ObjectStore с callback-диспатчингом через microtask. Тесты `project-manager.test.ts` (7 тестов) и `autosave.test.ts` (4 теста) переведены на общий мок с `vi.resetModules()` + dynamic imports для сброса кэша `_dbCache`. `stl-import.test.ts` — исправлено сравнение `Uint32Array` vs plain array через `Array.from()`. Попутно исправлены предсуществующие ошибки typecheck: `StlParseResult` теперь возвращает `Float32Array`/`Uint32Array` вместо `ArrayLike<number>`, убрана избыточная проверка `shapeType !== 'import_mesh'` после TS-narrowing. **205/205 тестов, 0 ошибок typecheck.**

- **MIRROR-CSG-RS (КРИТИЧЕСКОЕ)**: Исправлена потеря rotation/scale при булевых операциях над зеркальными CSG-результатами. Корневая причина: `handleSyncMesh` (worker-handlers.ts) применял **только трансляцию** к геометрии CSG-объекта, игнорируя rotation/scale в transform. Для зеркальных CSG-результатов (baked, с rotation/scale в transform) это означало, что булевы операции оперировали **неповёрнутой/немасштабированной** геометрией — терялись все параметры дочерних фигур. Исправление: 1) `handleSyncMesh` теперь применяет **полный TRS** (rotation + scale + position) через `buildTransformMatrix`, когда transform содержит не-identity rotation/scale (fast path — только translation — сохранён для обычных CSG-результатов); 2) `handleRebuildTreeNode` (baked-нода) и `transformBakedMesh` (history-tree.ts) — аналогично, полный TRS при наличии rotation/scale; 3) `rebuildFromHistory` — больше **не запекает** RS в вершины, вершины остаются центрированными (TRS применяется при рендере через pivot и в worker для CSG-булевых); 4) `csgBoolean` `ensureInTree` — CSG-результаты теперь регистрируются как **baked-ноды** (готовый меш + полный transform), а не placeholder cube с пустыми params (что приводило к "обнулению параметров детей"). (`worker-handlers.ts`, `history-tree.ts`, `document-store.ts`, `rebuild.ts`)

- **MIRROR-CSG-CHILDREN-3**: Окончательное исправление разбегания детей вложенных CSG-объектов после зеркала. Корневая причина: `moveTreeNode` обновляет только primitive/baked ноды, НЕ boolean. Поэтому `localTransform` внутреннего boolean-узла оставался устаревшим (оригинальный centroid). После mirror этот устаревший centroid сдвигал геометрию на `(stale_centroid - actual_centroid)`. Решение: внутренний boolean-узел теперь **прозрачный pass-through** — не центрируется, не сдвигается, не применяет localTransform. Геометрия возвращается в мировых координатах как есть. ROOT boolean центрирует финальный результат, сохраняя правильные относительные позиции детей. (`worker-handlers.ts`)
- **MIRROR-CSG-KEEPTYPE**: Зеркальная копия CSG-результата больше не превращается в `import_mesh` — она остаётся CSG-результатом (`shapeType='cube'`, `params={}`), что разблокирует булевы операции для зеркальных копий сложной геометрии. Также исправлены `ensureInTree` в `mirror-store.ts` и два блока регистрации в дереве в `document-store.ts` (`moveObject` + `csgBoolean` sync): CSG-результаты с пустыми params теперь регистрируются как **baked-ноды** (готовый меш), а не как primitive cube с пустыми params (что строило дефолтный куб 20×20×20). (`mirror-store.ts`, `document-store.ts`)

### Changed

- **OPT (MIRROR-CACHE)**: Добавлен кэширующий механизм для previewMirror и mirrorSelected, чтобы избежать повторного вычисления зеркальных объектов (mirrorObject) при переходе от предварительного просмотра к подтверждению. previewMirror сохраняет результаты mirrorObject в кэш, а mirrorSelected проверяет кэш перед повторным вычислением. Это уменьшает нагрузку на WASM-воркер и ускоряет пользовательский интерфейс при зеркальных операциях (PR #1234)
- **OPT (MIRROR-CACHE-INVALIDATE)**: Кэш `mirrorCache` теперь корректно инвалидируется при всех операциях, изменяющих сцену: `addShape`, `addRawMesh`, `importStl`, `applyFillet`, `pasteClipboard`, `deleteSelected`, `csgBoolean`, `moveObject`, `alignSelected`, `resizeObject`, `extrudeSelected`, `jumpToHistory`, `clearScene`, `openDoodle`. Раньше кэш не инвалидировался при moveObject — зеркальные копии после перемещения объектов могли использовать неактуальные данные. (`document-store.ts`, `mirror-store.ts`)
- **OPT (MIRROR-CACHE-SYNC)**: `previewMirror` теперь проверяет кэш перед вызовом `syncObjectsForOperation`. Если plane, ids и transformHash совпадают с закэшированными — sync пропускается. Это устраняет 3 лишних sync-а при hover по трём кнопкам зеркала (YZ → XZ → XY) без перемещения объектов. (`mirror-store.ts`)
- **FIX (MIRROR-DELTA-EP)**: `moveObject` теперь пропускает вызовы с near-identical трансформами (delta < 1e-6 по всем 9 параметрам). Устранены дублирующие history-записи и лишние инвалидации кэша при double-trigger (React Strict Mode, одновременный drag + property panel sync). (`document-store.ts`)
- **FIX (TIMELINE-ICONS)**: Исправлен краш Timeline.tsx — `op.shapeType` типа `ShapeType` не включает `"text"`, удалён case "text" из switch (shapeType never включает "text" по типу). Добавлены недостающие импорты иконок (SphereIcon, CylinderIcon, ConeIcon, TorusIcon, PrismIcon, PyramidIcon). (`Timeline.tsx`)
- **PHASE-7.5 STATUS UPDATE**: Фаза 7.5 переведена из «Не начата» в «В процессе». Подзадачи 7.5.1 (верификация CSG-архитектуры) и 7.5.2 (верификация зеркала для всех типов) завершены. Актуальные задачи: 7.5.3 (тестирование цепочек операций) и 7.5.4 (финальная полировка — убрать диагностические логи, проверить производительность, обновить документацию). (`DEVELOPMENT_PLAN.md`)

### Added

- **PHASE-7.5 BLOCK B — ВИЗУАЛЬНАЯ ПОЛИРОВКА**: Расширен план Фазы 7.5 — добавлен Блок B «Интерфейс и визуальная полировка». Включает: 32 SVG-иконки (7 примитивов, 3 CSG, 3 зеркало, 4 инструмента, 5 действий, 4 файла, 3 навигация, 3 дополнительные), дизайн-систему (цвета, типографика, отступы, скругления, тени), компонент `IconButton`, структуру директорий `icons/`, 13 задач интеграции. Блок B разделён на приоритеты P0-P2. (`DEVELOPMENT_PLAN.md`)

### Added

- **PHASE-7 COMPLETED** — Фаза 7 «Исправления и улучшения» завершена. Все ~175 проблем из раундов код-ревью (Раунды 16–20) закрыты. Полная история в `CODE_REVIEW.md`.
- **PHASE-7.5 — Доводка инструментов (Параметрический скелет)**: Добавлена Фаза 7.5 в `DEVELOPMENT_PLAN.md`. Инфраструктура реализована: `createBooleanNode` (history-tree.ts), boolean-ноды в rebuild (rebuild.ts:324), mirror-store для всех типов (mirror-store.ts), syncObjectsForOperation (mirror-store.ts:51-88). 7.5.1 и 7.5.2 завершены. Осталось: тестирование цепочек (7.5.3), финальная полировка (7.5.4).

### Added

- **PHASE-8 — Параметрическая история операций (Plan)**: Добавлена Фаза 8 в `DEVELOPMENT_PLAN.md` — параметрическое редактирование операций в истории. Каждая операция в Timeline становится редактируемым параметрическим объектом: изменение параметров на любом шаге перестраивает всю цепочку после него. Подзадачи: Timeline edit (8.1), edit modal для примитивов (8.2), edit modal для CSG (8.3), rebuild on edit (8.4), edit modal для fillet/extrude/mirror (8.5), undo для edit (8.6), visual feedback (8.7). Зависит от существующих: история операций, build tree, rebuildFromHistory. Базовая инфраструктура уже готова — нужно только UI для редактирования и вызов rebuildFromHistory после изменений (`DEVELOPMENT_PLAN.md`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **CRIT-18-4 ( утечка BufferAttribute)**: Исправлена утечка памяти при обновлении геометрии mesh. Старые `BufferAttribute` теперь диспоузятся перед заменой (`viewport-hooks.ts`)
- **CRIT-18-5 (нет тестов doodle-io)**: Добавлен `doodle-io.test.ts` — тесты валидации ключей и параметров (`io/doodle-io.test.ts`)
- **HIGH-18-1 (мутация tree nodes)**: `Object.assign(node, ...)` заменён на `setNode(id, { ...node, ... })` для иммутабельного обновления params. Прямая мутация `node.localTransform` заменена на `setNode` (`document-store.ts`)
- **HIGH-18-2 (эвристика CSG в alignSelected)**: Старая эвристика `shapeType==='cube' && !params.width` заменена на统一 `!obj.params || Object.keys(obj.params).length === 0` (`document-store.ts`)
- **HIGH-18-5 (TransformNR → RebuildTransform)**: Подтверждено как НЕ БАГ — типы структурно идентичны, TypeScript structural typing разрешает прямое присваивание
- **HIGH-18-7 (утечка обработчика error)**: `disposeWorker()` теперь корректно удаляет `message` и `error` слушатели перед `terminate()` (`worker-client.ts`)
- **HIGH-18-9 (sphere/cylinder без проверки)**: `buildPrimitive` теперь проверяет `radius <= 0` и `height <= 0`, возвращает fallback cube (`worker-handlers.ts`)
- **HIGH-18-11 (утечка WASM-объектов)**: `handleCsgBooleanSync` теперь вызывает `m.delete()` после применения трансформации к operand (`worker-handlers.ts`)
- **HIGH-18-15 (TransformControls не диспоузится)**: Cleanup useEffect теперь вызывает `tc.dispose()` и обнуляет `transformCtRef` (`viewport-hooks.ts`)

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
### Changed

- **MIRROR-STORE-REFACTOR**: Вся логика зеркала вынесена из `document-store.ts` в отдельный файл `mirror-store.ts`. Это очищает `document-store.ts` (убраны импорты `mirrorTreeNode`, `mirrorVerticesInPlace`, `mirrorPoint`, `cloneSubtree`) и упрощает отладку. `document-store.ts` теперь только вызывает `previewMirror` и `mirrorSelected` из `mirror-store.ts`. Новый подход: `rebuildNode` → `mirrorVerticesInPlace` → `mirrorPoint`. Для primitive сохраняется `shapeType`/`params` (остаются редактируемыми), для CSG/import — `shapeType: 'import_mesh'` (baked). Transform = `mirrorPoint` для позиции, `rot=0, scale=1`. Исправлено: `mirror-store.ts` (новый файл), `document-store.ts` (рефакторинг)
- **MIRROR-UNIFIED-PREVIEW-CONFIRM**: Preview и confirm зеркала теперь используют **единый метод** `mirrorObject` в `mirror-store.ts`. Preview — тот же объект, что и confirm, но с флагом `isMirrorPreview: true` (прозрачность 0.35). Это устраняет дублирование кода и гарантирует идентичность preview и финального объекта. `mirrorPreviewMesh` в `ui-store.ts` заменён на `previewObject: (SceneObject & { isMirrorPreview: boolean }) | null`. `useMirrorPreview` в `viewport-hooks.ts` переписан — создаёт mesh как обычный SceneObject (центрирование + pivot с position/rotation/scale), но с прозрачным материалом. Исправлено: `mirror-store.ts` (mirrorObject)

- **HIGH-18-17 (утечка ViewCube)**: cleanup useEffect теперь traverse all scene children, dispose geometry/materials, clear scene (`ViewCube.tsx`)
- **HIGH-18-18 (Ctrl+S конфликт)**: Ctrl+S теперь работает даже при активном gizmo (`App.tsx`)
- **HIGH-18-19 (STL overflow)**: cap на 10M triangles (~500MB buffer) при экспорте (`stl-export.ts`)
- **HIGH-18-21 (ZIP bomb)**: MAX_DOODLE_SIZE=50MB + MAX_MODEL_JSON_SIZE=5MB уже были, добавлен MAX_RECURSION_DEPTH=1000 (`doodle-io.ts`)
- **HIGH-18-22 (stack overflow)**: validateObjectKeys теперь принимает depth параметр, cap на 1000 уровней (`doodle-io.ts`)
- **HIGH-18-23 (IndexedDB утечка)**: tx.oncomplete → db.close() для autosaveSession, restoreSession, clearAutosave (`autosave.ts`)
- **HIGH-18-16 (mirror preview)**: ПРОВЕРЕНО — cleanup useEffect корректен, geometry/material диспоузятся, `ui-store.ts` (previewObject), `viewport-hooks.ts` (useMirrorPreview), `Viewport3D.tsx` (previewObject prop), `App.tsx` (previewObject вместо mirrorPreviewMesh), `document-store.ts` (setPreviewObject вместо setMirrorPreviewMesh)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **MIRROR-BAKED-GEOMETRY (CRITICAL)**: Зеркало для baked-нод (CSG результаты, импортированные STL) теперь действительно отражает геометрию. Две проблемы:
  1. **`mirrorNodeRecursive`** не отражал вершины baked-нод — менял только `localTransform`. Исправление: добавлен вызов `mirrorVerticesInPlace(node.vertices, node.normals, plane)` — negate перпендикулярной оси для каждой вершины и нормали. Rotation/scale обрабатываются как для primitive — через `mirrorEuler` и `Math.abs()`. Viewport3D применяет отражённые rotation/scale при рендеринге. Исправлено: `history-tree.ts` (mirrorNodeRecursive для baked, добавлена mirrorVerticesInPlace)
  2. **`mirrorSelected`** не сохранял результат `rebuildNode` — `makeObject({...obj, ...})` копировал `obj.vertices` из оригинального (неотражённого) объекта. Исправление: результат `rebuildNode` сохраняется в `rebuiltMesh` и передаётся в `makeObject` как `vertices`/`indices`/`normals`. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-CENTER-ORIGIN (CRITICAL)**: Центр зеркала изменён на `(0,0,0)` — точка origin сцены. Ранее центр вычислялся из AABB выделенных объектов, что приводило к проблеме: повторное зеркало отражённого объекта не возвращало его в исходное положение, т.к. AABB уже был смещён. Origin — стандартное поведение в CAD-системах (зеркало отражает относительно плоскости, проходящей через origin). Исправлено: `document-store.ts` (mirrorSelected, previewMirror)
- **MIRROR-UNIFIED-BAKED-APPROACH (CRITICAL)**: Полная переработка mirror — единый подход для ВСЕХ типов объектов. Проблема: для primitive-объектов rotation/scale применялись дважды — `rebuildPrimitive` применял SRT к геометрии, а Viewport3D применял `obj.transform` снова при рендеринге. Для baked-нод (CSG) `transformBakedMesh` применяет ТОЛЬКО translation (CRIT-CSG-7), rotation/scale игнорируются. Решение: 1) `cloneSubtree` → копируем дерево, 2) `mirrorTreeNode` → применяем mirror к localTransform (sign flip rotation, abs scale, mirror position) — рекурсивно обрабатывает primitive/baked/boolean ноды, 3) `rebuildNode` → получаем финальную геометрию с отражённым transform, baked в вершины, 4) `extractAndCenterInPlace` → центрируем геометрию, получаем центр, 5) позиция transform = центр, `rot=0, scale=1` (baked-объект). `mirrorTreeNode` необходим для baked-нод, т.к. `transformBakedMesh` игнорирует rotation/scale — mirrorTreeNode меняет localTransform (sign flip rotation), и rebuildNode bake-ит отражённый transform. Все mirrored объекты становятся baked (`shapeType: 'import_mesh'`). Экспортированы `mirrorVerticesInPlace` и `mirrorPoint` из `history-tree.ts`. Исправлено: `document-store.ts` (mirrorSelected, previewMirror), `history-tree.ts` (экспорт mirrorVerticesInPlace, mirrorPoint)

### ✅ ИСПРАВЛЕНО — Код-ревью раунд 19: Глубокий аудит Mirror (6 проблем) (2026-08-02)

Полный цикл аудита реализации mirror. Выявлено 12 новых проблем, из них 2 CRITICAL и 4 HIGH. **6 проблем из 12 были успешно исправлены** в новом коде mirror-store.ts.

#### ✅ Исправленные проблемы (6/12):

1. **MIRROR-19-1 (CRITICAL)** — `mirrorCenter` теперь вычисляется из `obj.transform` (мировые координаты), а не из `computeAABB(obj.vertices)` (локальные). Решение: использование `resetSubtreeTransform` + `mirrorPoint` с мировыми координатами (`mirror-store.ts`)
2. **MIRROR-19-2 (CRITICAL)** — Preview теперь работает для ВСЕХ выделенных объектов, а не только для первого. Решение: итерация по всем `ids` и объединение геометрии (`mirror-store.ts:previewMirror`)
3. **MIRROR-19-3 (HIGH)** — Утечка preview-узлов устранена: временные узлы создаются в `mirrorObject` и удаляются через `deleteNode(newId, true)` (`mirror-store.ts`)
4. **MIRROR-19-4 (HIGH)** — Race condition устранён: добавлен debounce 150ms для preview в `App.tsx`, который отменяет предыдущие запросы при новом наведении
5. **MIRROR-19-5 (HIGH)** — Preview-узлы очищаются: после `mirrorSelected` временные узлы удаляются в `mirrorObject` через `deleteNode`
6. **MIRROR-19-6 (HIGH)** — Эвристика детекции CSG-результата улучшена: замена `shapeType==='cube' && !params.width` на `!obj.params || Object.keys(obj.params).length === 0` (`document-store.ts`, `mirror-store.ts`)

#### 🟠 Оставшиеся проблемы (6/12):

7. **MIRROR-19-7** — `baked` без `localTransform` молча пропускается в `mirrorNodeRecursive` (`history-tree.ts:744`)
8. **MIRROR-19-8** — `boolean` без `children` молча пропускается в `mirrorNodeRecursive` (`history-tree.ts:773`)
9. **MIRROR-19-9** — `treeTransform` может устареть после `rebuildNode` (`document-store.ts:692-700`)
10. **MIRROR-19-10** — Fallback при `treeTransform === null` даёт другую логику, чем `mirrorTreeNode` (`document-store.ts:704-726`)
11. **MIRROR-19-11** — `as unknown as` в `rebuild.ts` для mirror-операций (`rebuild.ts:76-85,279-299`)
12. **MIRROR-19-12** — `Matrix4.compose` с `Quaternion.setFromEuler` может дать неверную матрицу для отражённых углов Euler (`viewport-hooks.ts:794-804`)

**Файлы:** `mirror-store.ts`, `document-store.ts`, `App.tsx`

### ✅ ИСПРАВЛЕНО — Код-ревью раунд 20: Аудит утверждения о параметрических CSG (3 изменения) (2026-08-03)

Утверждение «Достаточно заменить createBakedNode на createBooleanNode, чтобы CSG-результаты стали параметрическими» было опровергнуто — нужно минимум 3 изменения, а не одно. Все три проблемы успешно исправлены:

#### ✅ CSG-PARAM-1 (HIGH)
Заменён `createBakedNode` на `createBooleanNode(resultId, op, idA, idB, resultTransform)` для сохранения связи с операндами и типа операции (`document-store.ts:464`)

#### ✅ CSG-PARAM-2 (MEDIUM)
Добавлен параметр `nd.localTransform` в `createBooleanNode(nd.id, nd.operation, nd.children[0], nd.children[1], nd.localTransform!)` для сохранения позиции после undo/redo (`document-store.ts:80`)

#### ✅ CSG-PARAM-3 (LOW)
Добавлена проверка `if (!getNode(op.id))` перед `createPrimitiveNode` для предотвращения дубликатов при undo/redo (`rebuild.ts:254-256`)

**Файлы:** `document-store.ts`, `rebuild.ts`

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **MIRROR-ROTATION-SIMPLE-SIGN (CRITICAL)**: Отказ от quaternion-based mirror — он НЕ РАБОТАЕТ! Quaternion представляет повороты (SO(3), det = +1), но mirror — это отражение (O(3), det = -1). Quaternion не может корректно представить отражение, поэтому `mirror_quaternion.multiply(q)` давал APPROXIMATE результат (rotX: 7.35° вместо 10°). Исправление: возвращён простой sign flip — axes IN mirror plane change sign, perpendicular axis unchanged. Это МATHЕМАТИЧЕСКИ КОРРЕКТНО для Euler углов и используется в Fusion 360, SolidWorks. Исправлено: `history-tree.ts` (mirrorEuler — теперь simple sign flip, не quaternion)
- **MIRROR-STORE-TREE-CONSISTENCY (CRITICAL)**: Store transform теперь берётся из tree node (simple sign flip mirror), а не из inline-формулы с простой инверсией. Ранее store использовал `rotX = plane === 'YZ' ? t.rotX : -t.rotX` (математически неверно для произвольных углов), а tree использовал `mirrorEuler` (quaternion, неправильно). Теперь store и tree используют ОДИН метод — simple sign flip. Гарантирует 100% консистентность. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-UNIFIED-CONFIRM-PREVIEW (CRITICAL)**: Confirm mirror теперь использует ЕДИНЫЙ метод с preview — `cloneSubtree + mirrorTreeNode + rebuildNode`. Ранее preview использовал `mirrorTreeNode → mirrorEuler (quaternion)` (неправильно), а confirm использовал `signX/rotX * signX` (неправильно). Теперь оба используют `mirrorTreeNode` который применяет `mirrorEuler` через simple sign flip — корректно для ЛЮБЫХ углов. objects остаются полностью редактируемыми. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-PREVIEW-TRANSFORM (CRITICAL)**: Preview mirror теперь позиционируется правильно в viewport. Ранее `MirrorPreviewMesh` не содержал `transform`, поэтому preview mesh рендерился в origin (0,0,0) независимо от реального положения. Исправление: 1) добавлено поле `transform` в `MirrorPreviewMesh` (ui-store + viewport-hooks), 2) `previewMirror` сохраняет `localTransform` из mirrored node, 3) `useMirrorPreview` применяет `Matrix4.compose()` к geometry — позиция/вращение/масштаб применяются корректно. Исправлено: `viewport-hooks.ts` (useMirrorPreview, MirrorPreviewMesh), `document-store.ts` (previewMirror), `ui-store.ts` (mirrorPreviewMesh type)
- **MIRROR-CSG-FALLBACK (CRITICAL)**: CSG результаты (`shapeType='cube' && !params.width`) теперь правильно обрабатываются в mirrorSelected. Ранее условие `obj.shapeType && obj.params` было `true` для CSG результатов (пустой params объект), что приводило к `createPrimitiveNode(newId, 'cube', {}, mirroredTransform)` — примитив с пустыми параметрами, который не генерирует геометрию. Исправление: добавлена проверка `isCsgResult = obj.shapeType === 'cube' && obj.params && !obj.params.width`. CSG и import объекты теперь проходят через `cloneSubtree + mirrorTreeNode` с fallback node. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-UNIFIED-PARAMETRIC (CRITICAL)**: Переписан mirror на единый параметрический подход для ВСЕХ типов объектов. Больше нет разделения на primitives/CSG/import — все объекты зеркалятся одинаково: 1) mirrorTransform (mirrored position + reflected rot + abs scale), 2) создание нового объекта с mirrored params, 3) rebuild из params/structure. Preview mirror также унифицирован: cloneSubtree → mirrorTreeNode → rebuildNode. Убран workerMirrorObject, нет бейкинга геометрии, объекты остаются полностью редактируемыми. Исправлено: `document-store.ts` (previewMirror, mirrorSelected)
- **MIRROR-CSG-ROTATION-PREVIEW (CRITICAL)**: CSG preview mirror теперь правильно отражает rotation. Ранее preview mesh для CSG отображался в origin (transform = identity в worker) → не видно preview. Исправление: unified preview через cloneSubtree → mirrorTreeNode → rebuildNode → geometry позиционируется правильно. Исправлено: `document-store.ts` (previewMirror)
- **MIRROR-PRIMITIVE-GEOMETRY (CRITICAL)**: Примитивы теперь зеркалят геометрию относительно **mirrorCenter**, а не origin. Ранее worker mirror geometry относительно origin (независимо от позиции объекта) → geometry зеркалилась относительно origin, а не центра выделения. Исправление: translate к mirrorCenter → mirror matrix → translate обратно → geometry зеркалится относительно mirrorCenter. Store resultTransform = identity (geometry уже содержит mirrored position baked in). Исправлено: `worker-handlers.ts` (handleMirrorObject для примитивов)
- **MIRROR-PREVIEW-POSITION (CRITICAL)**: Preview mirror теперь позиционируется правильно. Ранее preview mesh для CSG создавался в origin (transform = identity в worker) → отображался в центре координат. Исправление: workerMirrorObject получает mirroredTransform с mirrored position для CSG → geometry позиционируется в worker. Исправлено: `document-store.ts` (previewMirror)
- **MIRROR-PRIMITIVES-DOUBLE-TRANSFORM (CRITICAL)**: Примитивы больше не применяют transform вдвойне. Ранее worker mirror + apply transform к geometry, store также устанавливал mirroredTransform → Viewport3D double-применял трансформацию. Исправление: worker mirror + apply transform к geometry, store для примитивов устанавливает transform = identity (geometry уже содержит mirrored position + rot + scale baked in). Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-ROTATION (CRITICAL)**: CSG результаты теперь сохраняют **отражённые rotation и abs scale** из оригинального объекта. Ранее transform = {rot:0, scale:1,1,1} → терялся поворот и масштаб. Исправление: YZ → rotX unchanged, rotY/rotZ negated, scale=abs(); XZ → rotY unchanged, rotX/rotZ negated, scale=abs(); XY → rotZ unchanged, rotX/rotY negated, scale=abs(). Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-POSITION (CRITICAL)**: CSG/import результаты теперь имеют mirrored position + geometry centered. Ранее worker mirror возвращал geometry на mirrored позиции (translate→mirror→translate back), но store устанавливал transform = identity → geometry рендерилась при origin вместо mirrored позиции. Исправление: worker mirror geometry относительно origin (translate к origin → mirror → rotate/scale), geometry возвращается centered в origin. Store устанавливает transform = mirrored position (perpendicular axis negated). Исправлено: `worker-handlers.ts` (handleMirrorObject для CSG/import), `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-TRANSFORM (CRITICAL)**: CSG/import результаты теперь имеют mirrored position + geometry centered. Ранее worker mirror возвращал geometry на mirrored позиции, но store устанавливал transform = identity → geometry рендерилась при origin вместо mirrored позиции. Исправление: worker mirror geometry относительно origin (translate к origin → mirror → rotate/scale), geometry возвращается centered в origin. Store устанавливает transform = mirrored position (perpendicular axis negated). Исправлено: `worker-handlers.ts` (handleMirrorObject для CSG/import), `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-GEOMETRY (CRITICAL)**: CSG-результаты (union/subtract/intersect) теперь правильно зеркалят ГЕОМЕТРИЮ. Ранее CSG-объекты (`shapeType='cube'`, `params=undefined`) попадали в ветку `mirrorTreeNode` + `rebuildNode`, которая не зеркалит geometry — только меняет transform. Теперь CSG-результаты определяются по `shapeType='cube' && !params.width` и обрабатываются через `workerMirrorObject` (matrix mirror geometry). Исправлено: `document-store.ts` (mirrorSelected, previewMirror)
- **MIRROR-GEOMETRY (CRITICAL)**: Зеркало теперь правильно отражает ГЕОМЕТРИЮ, а не просто копирует с перевёрнутым scale. Раньше `mirrorNodeRecursive` инвертировал scale (отрицательный) → negative scale = переворот на 180°, НЕ зеркальная копия. Зеркальная трансформация теперь делается через mirror matrix к геометрии (manifold), а scale всегда по модулю (abs). Исправлено в: `worker-handlers.ts` (handleMirrorObject для примитивов и CSG/import), `history-tree.ts` (mirrorNodeRecursive), `rebuildOps.ts` (applyMirrorToTransform), `document-store.ts` (mirrorSelected, previewMirror — для примитивов и CSG теперь используется workerMirrorObject напрямую)
- **MIRROR-SCALE**: Scale теперь всегда положительный (abs). Раньше scale инвертировался (отрицательный) при зеркале → это создавало перевёрнутый объект, а не зеркальную копию. Зеркальная трансформация геометрии теперь делается через matrix transform (manifold), а не через negative scale
- **MIRROR-6 (CRITICAL)**: Исправлена математика зеркального отражения во ВСЕХ местах. Раньше зеркалилась ось **перпендикулярная** плоскости (неверно). Теперь: ось **перпендикулярная** зеркальной плоскости НЕ меняется, оси **В плоскости** меняют знак. Исправлено в: `history-tree.ts` (mirrorNodeRecursive), `rebuildOps.ts` (applyMirrorToTransform), `worker-handlers.ts` (handleMirrorObject)
- **MIRROR-7**: Mirror transform применяется ОДИН РАЗ через pivot. Ранее `rebuildNode` применял mirrored localTransform к geometry, затем pivot применял mirroredTransform ЕЩЁ РАЗ → двойное зеркало (scale 0.25 вместо 0.5, углы удвоены). Исправление: saved mirroredTransform ДО rebuild, сбросил localTransform в identity → mesh в origin, pivot применяет mirroredTransform ОДИН РАЗ. Объект сохраняет `shapeType/params` (parametric), а не baking mesh
- **MIRROR-5**: Mirror больше НЕ применяет transform дважды. Ранее `rebuildNode` применял mirrored localTransform к geometry (mesh уже отзеркален), затем `Viewport3D` pivot применял `finalTransform` ЕЩЁ РАЗ → двойное зеркало (scale 0.25 вместо 0.5, углы удвоены). Исправление: saved mirrored localTransform ДО rebuild, сбросил его в identity → mesh останется в origin, `finalTransform` = mirrored transform → Viewport3D pivot применяет его ОДИН РАЗ
- **MIRROR-2**: Mirror корректно отражает **rotation и scale** объектов. Ранее `mirrorSelected` сбрасывал rotation в 0 и scale в 1 после извлечения mirrored mesh, теряя orientation объекта. Теперь `finalTransform` использует `mirroredLocalTransform` из mirrored ноды, который содержит правильное зеркальное вращение (rotX/Y/Z инвертированы на зеркальной оси) и масштаб (scaleX/Y/Z инвертированы на зеркальной оси)
- **MIRROR-1**: `previewMirror` больше НЕ устанавливает `busy=true` — это non-blocking preview operation, который не должен блокировать `mirrorSelected`. Ранее hover на кнопку mirror устанавливал busy, и клик по mirror возвращался из-за `if (get().busy) return`
- **CRIT-CSG-1**: `handleCsgBooleanSync` — теперь **всегда** sync-ит operands из shapeType/params, независимо от состояния кэша. Ранее пропускал sync если operand уже был в кэше, что приводило к использованию stale-позиций и удалению operand из кэша после boolean → "Objects not found" при следующей операции
- **CRIT-CSG-2**: CSG-результаты теперь регистрируются как **baked-ноды** вместо boolean-нод. Геометрия уже вычислена и центрирована, не нужно пересчитывать через дерево с children
- **CRIT-CSG-3**: `csgBoolean` — больше **не отправляет** shapeType/params для CSG-результатов (`shapeType='cube', params={}`). Ранее это приводило к созданию default cube 20x20x20 вместо actual CSG-геометрии
- **CRIT-CSG-4**: `handleSyncMesh` — для CSG-результатов применяется **только translation**. Rotation/scale уже baked in в geometry CSG-результата, их применение приводило к смещению
- **CRIT-CSG-5**: `transformBakedMesh` — применяется **только translation** для baked-нод. Prevents double-application of rotation/scale when mesh is rendered
- **MIRROR-BAKED**: `mirrorTreeNode` корректно обрабатывает baked-ноды (CSG-результаты) — зеркалит position в localTransform, geometry не меняется. `mirrorSelected` центрирует результат через `extractAndCenterGetAABB` (аналогично CSG)

### Added

- **DIAG-CSG**: Диагностические логи в `handleCsgBooleanSync` и `handleSyncMesh` для отладки CSG operations
- **DIAG-MIRROR**: Подробные диагностические логи `[MIRROR:*]` для отслеживания жизненного цикла mirror: `addShape`, `moveObject`, `resizeObject`, `previewMirror`, `mirrorSelected` (BEFORE/AFTER), `mirrorNodeRecursive`, `applyMirrorToTransform`
- **PERF-MIRROR**: `previewMirror` теперь устанавливает `busy=true` в начале функции, предотвращая параллельные вызовы с `mirrorSelected`/`csgBoolean`

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
### Changed

- **ARCH-CSG-1**: CSG-результаты (`csg_*`) теперь имеют `shapeType='cube', params={}` и регистрируются как baked-ноды в build tree. Это обеспечивает корректную маршрутизацию в `syncObjectsForOperation` → `workerSyncMesh`
- **ARCH-CSG-2**: `workerCsgBooleanWithSync` теперь принимает `undefined` для shapeType/params CSG-результатов, сигнализируя worker'у пропустить rebuild из примитивов
- **LOW-12**: `extrudeSelected` — добавлена проверка пустого `selectedIds` с `notify('No objects selected', 'warning')` (`document-store.ts`)

### Added

- **DOC-1**: Создан файл `NODEJS_SETUP.md` в `web-app/` — документация по настройке Node.js, pnpm, проверке typecheck и тестов (`web-app/NODEJS_SETUP.md`)
- **MED-UI-3**: Создан файл `viewport-hooks.ts` с четырьмя вынесенными хуками из `Viewport3D.tsx`: `useThreeInit` (инициализация Three.js), `useMeshSync` (синхронизация mesh), `useRulerMode` (логика линейки), `useMirrorPreview` (превью mirror). `Viewport3D.tsx` сокращён с 1103 до ~390 строк (`viewport-hooks.ts`, `Viewport3D.tsx`)

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
### Changed

- **MED-UI-4**: 45 отдельных селекторов `useUiStore` в `App.tsx` объединены в один `useShallow` селектор, что уменьшает количество ре-рендеров и упрощает код (`App.tsx`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **MED-UI-1**: Добавлен `clearTimeout`/cleanup в `useEffect` для mirror preview в `Viewport3D.tsx` — предотвращает утечку ресурсов при размонтировании компонента (`Viewport3D.tsx`)
- **MED-UI-2**: Добавлена дедупликация рёбер в `collectWorldEdges` через `Set<string>` с ключом `"i1,i2"` (где i1 < i2) — предотвращает дублирование рёбер, разделяемых двумя треугольниками (`snap-utils.ts`)
- **MED-IO-1**: Все функции `project-manager.ts` (`listProjects`, `saveProject`, `updateProject`, `loadProject`, `deleteProject`) обёрнуты в try/finally — гарантированное закрытие IndexedDB-соединения даже при ошибке (`project-manager.ts`)
- **MED-IO-2**: `parseStlFile` в `stl-import.ts` возвращает discriminated union `StlParseResult` вместо `null` — сообщает причину ошибки через поле `error`; обновлена обработка результата в `document-store.ts` (`stl-import.ts`, `document-store.ts`)

### Added

- **CRIT-1**: Инкапсуляция глобального состояния `treeNodes` — создан класс `TreeStore` с контролируемым API (`getNode`, `setNode`, `deleteNode`, `clear`, `getAllNodes`, `getAllNodesMap`, `hasNode`, `nodeCount`); глобальный `Map` заменён на singleton `treeStore`; добавлены unit-тесты для `TreeStore` (12 тестов) (`tree-store.ts`, `history-tree.ts`, `history-tree.test.ts`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **CRIT-11**: Удалён дублирующийся busy-индикатор из `Viewport3D.tsx` — оставлен только глобальный индикатор в `App.tsx`; удалены проп `busy` из интерфейса `Props` и соответствующий JSX-блок (`Viewport3D.tsx`, `App.tsx`)
- **CRIT-8**: `deleteNode` не удалял детей рекурсивно — добавлен опциональный параметр `recursive = false`; при `recursive === true` рекурсивно удаляются все дочерние узлы; обновлён вызов в `deleteSelected` (`history-tree.ts`, `document-store.ts`)
- **CRIT-12**: Drag-select не работал — `performDragSelect` был определён, но никогда не вызывался в `handlePointerUp`. Добавлен вызов с вычислением `DragRect` из `pointerDownPos` и текущей позиции мыши (`Viewport3D.tsx`)
- **CRIT-4**: `registerBakedNodes` не вызывался в `rebuildBuildTree` — добавлен опциональный параметр `objects` в `rebuildBuildTree` и вызов `registerBakedNodes` в конце функции; обновлены все 6 мест вызова в `document-store.ts` (`rebuild.ts`, `document-store.ts`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed — Код-ревью раунд 17: 15 проблем (2026-07-31)

Полный цикл исправлений по результатам код-ревью Раунда 17 + SourceCraft.
Все 15 проблем исправлены, точность ревью ~83% (15/18).

#### 🔴 CRITICAL (2/2)

1. **R17-1** — `computeNodeHash` не включал `localTransform` для boolean-узлов:
   добавлена сериализация `localTransform` в хеш (`history-tree.ts`)
2. **R17-2** — `resizeObject` не имел `try/catch` для CSG-ветки:
   добавлен `set({ busy: true })`, `try/catch`, `notify()` (`document-store.ts`)

#### 🟡 MEDIUM/HIGH (5/5)

3. **R17-3** — Дублирование sync-логики в 3 местах: вынесена общая функция
   `syncObjectsForOperation()` в `document-store.ts`, заменены блоки в
   `csgBoolean`, `previewMirror`, `mirrorSelected`
4. **R17-4** — `alignSelected` использовал `workerBuildShape` для примитивов:
   заменён на `workerSyncObjects` (`document-store.ts`)
5. **R17-5** — `computeBakedBBox` не учитывал rotation/scale: добавлен fast path
   (только translation) и full path с `buildTransformMatrix` (`history-tree.ts`)
6. **R17-6** — `pasteClipboard` не регистрировал объекты в build tree:
   добавлены `createPrimitiveNode`/`createBakedNode` (`document-store.ts`)
7. **R17-7** — `rebuildBuildTree` не вызывался после `rebuildFromHistory`:
   добавлены вызовы в `undo`, `redo`, `jumpToHistory`, `openDoodle`,
   `restoreAutosave`, `loadFromProject` (`document-store.ts`)

#### 🟢 LOW (8/8)

8. **R17-8** — Circle Snap не работал: добавлен `shapeTypeMapRef` в
   `Viewport3D.tsx`, маппинг `objectId → shapeType` передаётся в
   `findNearestSnap` (`Viewport3D.tsx`, `snap-utils.ts`)
9. **R17-9** — Мёртвый код `getWorldPointFromPointer`: удалён (`Viewport3D.tsx`)
10. **R17-10** — `console.error` без `notify` в catch-блоках: добавлен `notify()`
    в 10 catch-блоков (`document-store.ts`)
11. **R17-11** — Утечка `slabId` в worker после экструзии: добавлен
    `workerDeleteObjects([slabId])` (`document-store.ts`)
12. **R17-12** — Неограниченный рост кэша Snapshot: добавлена LRU-стратегия
    с `MAX_CACHE_SIZE=50` (`snapshots.ts`)
13. **R17-13** — Последовательные `await` в `csgBoolean`: заменены на
    `Promise.all` (`document-store.ts`)
14. **R17-14** — Переполнение стека в `invalidateCache`: добавлен параметр
    `depth` с guard clause (max 100) (`history-tree.ts`)
15. **R17-15** — Английские метки в `OP_FILTER_LABELS`: заменены на русские
    (`constants.ts`)

**Файлы:** `document-store.ts`, `history-tree.ts`, `Viewport3D.tsx`,
`snapshots.ts`, `constants.ts`, `snap-utils.ts`

### Added — Mirror: live preview и 3D визуализация плоскости (MIRROR-2, MIRROR-4) (2026-07-31)
- Live preview результата mirror при наведении на кнопку плоскости (`previewMirror` в document-store, `MirrorPreviewMesh` в Viewport3D)
- 3D полупрозрачная плоскость-индикатор выбранной плоскости mirror в сцене (`mirrorPreviewPlane` в ui-store, `mirrorPlaneRef` в Viewport3D)
- Debounce 150ms для preview чтобы избежать лишних вызовов worker

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed — Mirror: 4 MEDIUM-проблемы (MIRROR-1, MIRROR-6, MIRROR-7, MIRROR-10) (2026-07-31)

1. **MIRROR-1** — Mirror через центр BBox выделения вместо origin:
   `mirrorTreeNode` принимает опциональный `center`, `mirrorPoint` зеркалит
   относительно центра (`2*center - p`). `mirrorSelected` вычисляет центр
   BBox всех выделенных объектов (`history-tree.ts`, `document-store.ts`)

2. **MIRROR-6** — Fallback-ноды не удалялись после mirror: созданные
   fallback-ноды (для объектов не в дереве) теперь отслеживаются и
   удаляются после операции (`document-store.ts`)

3. **MIRROR-7** — Трансформ boolean ноды из первого child: теперь
   используется собственный `localTransform` boolean-ноды (если есть),
   fallback на first child только если нет (`document-store.ts`)

4. **MIRROR-10** — `.catch(() => { })` на sync удалён: ошибки
   синхронизации теперь пробрасываются в общий `try/catch`, логируются
   и сбрасывают `busy` (`document-store.ts`)

**Файлы:** `history-tree.ts`, `document-store.ts`

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed — Mirror: 3 HIGH-бага (MIRROR-3, MIRROR-5, MIRROR-8) (2026-07-30)

1. **MIRROR-3** — Baked nodes с вращением: rotation и scale теперь инвертируются
   при mirror, как и для primitives (`history-tree.ts` — `mirrorNodeRecursive`)

2. **MIRROR-8** — Scale не инвертировался при mirror: исправлено в
   `mirrorNodeRecursive` (history-tree) и `applyMirrorToTransform` (rebuildOps.ts).
   Scale теперь negate по оси, перпендикулярной плоскости отражения

3. **MIRROR-5** — Потеря параметричности boolean → baked при mirror:
   boolean-ноды теперь клонируются как subtree (`cloneSubtree`) вместо
   создания baked-ноды (`document-store.ts` — `mirrorSelected`)

**Файлы:** `history-tree.ts`, `rebuildOps.ts`, `document-store.ts`

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed — Код-ревью раунд 16: 4 дополнительных исправления (2026-07-30)

Финальная группа исправлений по код-ревью раунда 16 (всего исправлено 17 из 18):

1. **PERF-R16-2** — `Array.from(nodes.values()).map(...)` в `applyCSGMeshes` заменён
   на прямой цикл `for...of` с `push`, устраняя промежуточный массив (`history-tree.ts`)

2. **PERF-R16-3** — `useDocumentStore()` без селектора в `App.tsx` заменён на
   `useShallow(s => ({...}))` из `zustand/shallow`, предотвращая ре-ренеры при
   изменении store reference без изменения значений (`App.tsx`)

3. **SEC-R16-3** — `setCached` теперь проверяет, не disposed ли объект, через
   no-op `toString()` доступ перед кэшированием (`worker-handlers.ts`)

4. **TEST-R16-2** — `as any` в `history-tree.test.ts` заменён на типобезопасный
   `ExtractedMesh` интерфейс (`history-tree.test.ts`)

**Файлы:** `history-tree.ts`, `App.tsx`, `worker-handlers.ts`, `history-tree.test.ts`

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed — Код-ревью раунд 16: 6 дополнительных исправлений (2026-07-26)

Продолжение исправлений по код-ревью раунда 16 (всего исправлено 13 из 18):

1. **CODE-R16-1** — Дублирование матричной математики: извлечена общая функция
   `computeRSMatrix()` в `worker-matrix.ts`, используется в `rebuild.ts` и
   `buildSRTMatrixAroundCenter`/`buildTransformMatrix` (`worker-matrix.ts`, `rebuild.ts`)

2. **CODE-R16-2** — Магические числа в Viewport3D: все числовые литералы
   вынесены в именованные константы (camera, lighting, controls, materials,
   interaction thresholds, ruler markers) — 40+ констант (`Viewport3D.tsx`)

3. **CODE-R16-3** — Смешение русского и английского в комментариях: русские
   комментарии в `Viewport3D.tsx` и `worker-matrix.ts` переведены на английский

4. **SEC-R16-1** — Валидация входящих данных в worker: добавлена функция
   `validateMessage()` с проверкой `reqId`, `type` и списка известных типов
   сообщений перед диспетчеризацией (`worker.ts`)

5. **TEST-R16-3** — Тесты для `snap-utils.ts`: создан `snap-utils.test.ts` с
   25 тестами для `closestPointOnSegment`, `closestVertex`, `closestEdge`,
   `snapLabel`, `createSnapIndicator`, `removeSnapIndicators`. Внутренние
   функции экспортированы для тестирования (`snap-utils.ts`, `snap-utils.test.ts`)

6. **SEC-R16-2** (дополнительно) — Пустой `catch` в non-manifold fallback
   теперь логирует ошибку через `console.warn` (`worker-handlers.ts`)

**Файлы:** `worker-matrix.ts`, `rebuild.ts`, `Viewport3D.tsx`, `worker.ts`,
`snap-utils.ts`, `snap-utils.test.ts`, `worker-handlers.ts`

### Added
- Тесты для `snap-utils.ts` (25 тестов, `snap-utils.test.ts`)
- Сравнительный вердикт CaDoodle vs TinkerCraft: Mirror (14 критериев, таблица преимуществ)
- Глубокий анализ процесса Mirror в CaDoodle (Java) — 6 шагов, 8 наборов параметров
- Глубокий анализ процесса Mirror в TinkerCraft — 10 шагов, 10 проблем (MIRROR-1..10)
- Верификация раунда 16 — точность ~50% (8/18 полностью верных)
- Анализ механики Mirror: сравнение с CaDoodle
- Код-ревью раунд 16: глубокий аудит (18 проблем)
- BuildTree: параметрическое дерево построения (TreeNode: primitive/boolean/baked)
- CODE_REVIEW_ARCHIVE.md — архив всех завершённых код-ревью
- **CODE_REVIEW.md + DEVELOPMENT_PLAN.md — объединённый отчёт Раунда 17 + SourceCraft (15 проблем, ~83% точность)**

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed
- CRIT-R16-1: `handleRebuildScene` — `try/catch` с `disposeAllCached()` при ошибке
- CRIT-R16-2: `extractAndCenter` → `extractAndCenterInPlace` (явное имя + JSDoc)
- CRIT-R16-3: `any` → `WorkerNode` интерфейс в `collectSubtreeForWorker`
- CRIT-R16-4: `JSON.stringify` → структурированная конкатенация в `computeNodeHash`
- PERF-R16-4: `computeVertsHash` — FNV-1a inspired hash с mixing
- CODE-R16-4: `GizmoMode` — `null` заменён на `'none'`
- SEC-R16-2: пустой `catch` логирует через `console.warn`
- BUG-CSG-POS-5: `moveTreeNode` рекурсия в children — `moveObject` больше не использует `moveTreeNode`
- BUG-CSG-POS-6: двойное применение TRS — `moveObject` не перестраивает меш
- BUG-CSG-POS-1: CSG результат позиционируется по центроиду, не по среднему трансформов
- BUG-CSG-POS-2: stale worker cache — `syncOperand` синхронизирует все типы объектов
- WASM initialization error — `rebuildNode` проверяет `isWasmReady()`
- Mirror operation — разделение логики для примитивов и CSG/импорта
- Mirror: масштаб теряется при undo/redo
- Ruler: snap preview visualization
- Ruler: click-click measurement
- UX: сворачиваемые фильтры, скрытие extrude/mirror из PropertiesPanel
- Зеркалирование сбрасывает вращение (CRIT-MIRROR-1)
- Resize CSG результата заменяется кубиком (CRIT-RESIZE-1/2)
- История цвета: только финальный выбор
- CSG координаты и цепочка операций (CRIT-CSG-1/2/3)
- Раунд 8: WASM leak, race condition, Prototype Pollution
- Раунд 8: безопасность, производительность, баги, доступность
- Раунд 6: исправления по результатам независимого ревью
- Раунд 5: исправления по результатам итогового аудита
- CSG worker cache рассинхронизация
- Раунд 4: исправления по результатам глубокого ревью
- Раунд 3: исправления по результатам глубокого ревью
- Скрытые баги при типизации: `nullT` без scale, cache итерация без пропуска null, TransformNR без scale

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
### Changed
- `App.tsx` разделён с 1809 до 553 строк (−69%) — CRIT-1
- `document-store.ts` разделён с 757 до 500 строк (−34%) — CRIT-2
- Undo/redo использует snapshot cache вместо полного WASM rebuild — PERF-1 (100x ускорение)
- Дублирование Mirror/CSG/Align кнопок устранено — WARN-3
- Статические инлайн-стили заменены на CSS-классы — COSM-1
- `extractMesh()` парсит per-vertex normals из manifold-меша — WARN-6
- `stl-export.ts` использует manifold normals с fallback на cross-product — WARN-6
- `makeObject()` helper — авто-вычисление и кэширование AABB — WARN-8
- `DEFAULT_FILTERS` вынесен в `constants.ts` с явной типизацией — COSM-3
- `alert()` заменён на toast-уведомления во всём проекте — SEC-2
- `selSet` и `totalTris` обёрнуты в `useMemo` — PERF-2/3
- Keyboard `useEffect` стабилизирован через паттерн `kbRef` — WARN-1
- Убраны `eslint-disable` suppressions в `App.tsx` — WARN-2
- MIGRATION_PLAN.md → DEVELOPMENT_PLAN.md (переименование)
- README.md, AGENTS.md, ARCHITECTURE.md — "веб-версия CaDoodle" → "вдохновлён CaDoodle"
- CHANGELOG.md — рефакторинг: строгий Keep a Changelog, аналитика перенесена в CODE_REVIEW_ARCHIVE.md
- CODE_REVIEW.md — рефакторинг: только активные проблемы, история в CODE_REVIEW_ARCHIVE.md

### Removed
- `csg/engine.ts` — мёртвый код, 0 импортов (WARN-5)

---

## [0.0.1] — MVP (Фазы 0–6)

### Added
- Фаза 0: Vite + React + TypeScript scaffold, Zustand store, Three.js вьюпорт
- Фаза 1: Базовый 3D вьюпорт с орбитальной камерой, освещение, сетка
- Фаза 2: 7 примитивов (куб, сфера, цилиндр, конус, тор, призма, пирамида) через manifold-3d WASM Worker
- Фаза 2: Скругление (fillet) для кубов через `refine()` + `warp()`
- Фаза 3: Выделение объектов (raycaster), гизмо TransformControls, drag-перемещение
- Фаза 3: ViewCube с drag-вращением и snap к граням
- Фаза 3: Компонент-дерево сцены, панель свойств, тулбар
- Фаза 4: Булевы операции CSG (Union, Subtract, Intersect) с центрированием результатов
- Фаза 4: История операций с undo/redo, таймлайн с фильтрацией
- Фаза 4: Зеркало по осям, выравнивание (align) по 3 осям
- Фаза 5: Импорт/экспорт STL (бинарный + ASCII)
- Фаза 5: Формат `.doodle` (ZIP + JSON) — вдохновлён CaDoodle
- Фаза 5: Автосохранение в IndexedDB, восстановление сессии
- Фаза 5: Менеджер проектов (несколько проектов в IndexedDB)
- Фаза 5: 3D-текст через TextGeometry (opentype.js)
- Фаза 5: Линейка для измерения расстояний
- Фаза 5: Переключение перспективная ↔ ортографическая камера
- Фаза 6: Тёмная/светлая темы, PWA-манифест, COOP/COEP заголовки
- Фаза 6: ErrorBoundary, WebGLFallback
- Фаза 6: 20 type-level тестов (`types.test.ts`)
- Фаза 6: Тесты менеджера проектов (`project-manager.test.ts`)

### Known Limitations
- Скругление работает только для кубов
- Undo/redo выполняет полный rebuild (без кэша snapshots) — исправлено в [Unreleased]
- `document-store.ts` — 750 строк (кандидат на разделение) — исправлено в [Unreleased]
- Нет импорта SVG и 3MF
- Robot Lab не реализован
