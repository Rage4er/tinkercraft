# 🗣️ Отзыв пользователя: экономика и UI (2026-09-11)

**Дата отзыва:** 2026-09-11
**Источник:** пользовательский отзыв (ручной прогон приложения) + регрессии после теста на платформе Яндекс Игр (A/B/C, 2026-09-13/14)
**Статус:** 🟢 ЗАКРЫТО (2026-09-14) — все проблемы реестра исправлены (U1–U10 + A1/A2 + B1/B2/B3 + C1/C2/C3)
**Объект:** экономика ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`economy-config.ts`](../web-app/src/store/economy-config.ts)), UI экономики ([`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx), [`EconomyBanner.tsx`](../web-app/src/components/EconomyBanner.tsx), [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx), [`Badge.tsx`](../web-app/src/components/Badge.tsx)), платформа ([`main.tsx`](../web-app/src/main.tsx), [`platform/*`](../web-app/src/platform/index.ts))

> Документ создан по просьбе пользователя для фиксации отзыва. Это **реестр проблем**, а не код-ревью.
> **Закрыт 2026-09-12:** все пункты U1–U10 обработаны в подзадачах (см. [`CHANGELOG.md`](../CHANGELOG.md) → `[Unreleased]`: U1/U9 v2.1, U10, U2, P2-5, U4, U6, U7, U5/P0-1, U8/P1-1, P0-2).
> **U3 решён 2026-09-13:** «магазин» = правая панель (`PropertiesPanel` → `EconomyPanel`); левая вкладка убрана, переходы «купить» ведут в правую панель; ECONOMY.md обновлён до v2.2 (§6.3 — два места).
> **Регрессии A/B/C закрыты 2026-09-14:** A1/A2 (экспорт/импорт за рекламу), B1/B2/B3 (баннер, 3D-текст слева, палитра), C1/C2/C3 (бейджи, токен-куб, квест зеркал) — исправлены, полный `pnpm verify` зелёный (357/357).
> Проверка: `pnpm verify` — typecheck 0 ошибок, **357/357 тестов (23 файла)**, build/build:yandex успешны.
> Связанные материалы: [`ECONOMY.md`](../ECONOMY.md) (**v2.3**), [`docs/ECONOMY_CODE_REVIEW.md`](ECONOMY_CODE_REVIEW.md), [`CHANGELOG.md`](../CHANGELOG.md), [`CODE_REVIEW.md`](CODE_REVIEW.md), [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md), [`docs/USER_FEEDBACK_UB2.md`](USER_FEEDBACK_UB2.md) (продолжение: UB2-1…UB2-5, 2026-09-22 — квесты/иконки/тултипы, 🔲 ОТКРЫТО).

---

## Текст отзыва (дословно)

> - ревард видео блокирует откат на 5 минут везде, а должен отдельно за разные награды свой откат, иначе не логично;
> - таймер отката рекламы не отсчитывает секунды реалтайм;
> - панель экономики дублируется и слева (магазин), и справа, оставляем справа только;
> - не бейджа на панели фигур у 3д текста;
> - я потратил токены на скрытие баннера, баннер скрылся, но кнопки оплаты и ревард на нем остались активны и спывает повторно токены при нажатии и показывает рекламу, это явно баг — я уже купил же, нужно везде проверить;
> - отсутствует простая палитра в свойствах;
> - иконки на всех бейджах увеличить в два раза;
> - экспорт не происходит при оплате или просмотре рекламы;
> - счетчик рекламы един, но должен для каждой награды свой быть;
> - sdk инициализируется уже после того как игра доступна становится, что недопустимо.

---

## Реестр проблем

| # | Проблема (из отзыва) | Тип | Приоритет | Статус |
|---|----------------------|-----|-----------|--------|
U1 | Единый 5-минутный откат (кулдаун) rewarded-видео блокирует **все** награды сразу; нужен **отдельный откат на каждый вид награды** | Логика / UX | 🟡 P1 | ✅ ИСПРАВЛЕНО — раздельные кулдауны per-reward (`adRewards: Record<AdRewardKind, …>`, `markAdWatched`), ECONOMY.md v2.1 ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`ECONOMY.md`](../ECONOMY.md)) |
U2 | Таймер отката рекламы **не тикает в реальном времени** (секунды не обновляются корректно) | UX / баг | 🟡 P1 | ✅ ИСПРАВЛЕНО — `useAdCooldown()`/`getAdCooldownRemainingMs()` ([`platform/ad-timers.ts`](../web-app/src/platform/ad-timers.ts)), посекундный тик с поправкой на серверное смещение; fallback `Date.now()` не кэшируется (P2-5) |
U3 | Панель экономики **дублируется**: слева «магазин» и справа панель. Оставить **только справа** | UX / редизайн | 🟡 P1 | ✅ ИСПРАВЛЕНО — «магазин» = правая панель (`PropertiesPanel` → `EconomyPanel`), левая вкладка `shop` в LeftPanel удалена, переходы «купить» ведут в правую панель, ECONOMY.md v2.2 (§6.3 — два места) |
U4 | На панели фигур **нет бейджа у 3D-текста** (цена/состояние доступа не показаны) | UX / баг | 🟢 P2 | ✅ ИСПРАВЛЕНО — сравнение по реальному типу `type:'text'` (`ALL_SHAPES_DATA`) + геттер `canUseText3dRO()` ([`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx)) |
U5 | **Баннер:** после покупки скрытия за токены баннер скрылся, но кнопки оплаты и «смотреть рекламу» на нём остались активны — **повторно списывают токены и показывают рекламу**. Проверить все точки продажи | Баг, дублирующее списание | 🔴 P0 | ✅ ИСПРАВЛЕНО — EconomyBanner подключён в App.tsx, все 3 точки продажи защищены от повторной покупки при активной аренде `disableBanner` ([`App.tsx`](../web-app/src/App.tsx), [`EconomyBanner.tsx`](../web-app/src/components/EconomyBanner.tsx), [`EconomyShop.tsx`](../web-app/src/components/EconomyShop.tsx), [`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx)) |
U6 | В свойствах **отсутствует простая палитра** (доступна только расширенная за аренду/подписку) | UX / баг | 🟡 P1 | ✅ ИСПРАВЛЕНО — палитра Wad's Optimum 16 доступна всегда; расширенный native-picker — только при аренде `extendedPalette`/подписке ([`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx), [`ColorPalette.tsx`](../web-app/src/components/ColorPalette.tsx)) |
U7 | **Иконки на всех бейджах увеличить в 2 раза** | UX / косметика | 🟢 P2 | ✅ ИСПРАВЛЕНО — Badge: иконки 10→20px, шрифт 10→16px; IconBadge: 16→20px ([`Badge.tsx`](../web-app/src/components/Badge.tsx), [`IconBadge.tsx`](../web-app/src/components/IconBadge.tsx)) |
U8 | **Экспорт не выполняется** после оплаты токенами и после просмотра рекламы | Баг, блокирует платный сценарий | 🔴 P0 | ✅ ИСПРАВЛЕНО — единая модель кэшбэка: `exportStl(method: 'tokens'\|'ad')`, кэшбэк учтён в цене при токенах/начисляется при рекламе, цепочка `handleExportExecute → exportStl` восстановлена ([`App.tsx`](../web-app/src/App.tsx), [`document-store.ts`](../web-app/src/store/document-store.ts), [`ExportModal.tsx`](../web-app/src/components/ExportModal.tsx)) |
U9 | **Счётчик просмотров рекламы единый для всех наград**; должен быть **отдельный счётчик для каждой награды** | Логика | 🟡 P1 | ✅ ИСПРАВЛЕНО — отдельные дневные счётчики per-reward (`adRewards[*].countToday`), лимиты `maxPerDay=705`, `realisticPerDay=350` (v2.1; **с v2.3 — 405/250**, т.к. доход даёт только вид `tokens`) ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`economy-config.ts`](../web-app/src/store/economy-config.ts)) |
U10 | **SDK инициализируется уже после того, как игра стала доступна** — недопустимо | Платформа / модерация | 🔴 P0 | ✅ ИСПРАВЛЕНО — bootstrap «сплэш → initSdk → App» в main.tsx; ранний fallback LoadingAPI.ready (15с) убран; GameplayAPI стартует после `getInitDonePromise()` ([`main.tsx`](../web-app/src/main.tsx), [`platform/sdk.ts`](../web-app/src/platform/sdk.ts)) |
B1 | **Баннер-оффер не виден по умолчанию** (sticky-баннер платформы скрыт/недоступен, наш UI-баннер тоже молчит) | UX / баг | 🟡 P1 | ✅ ИСПРАВЛЕНО — `bannerVisible` инициализируется `true` (initial state + persist-merge); единый RO-геттер `shouldShowBannerRO()` (bannerVisible && !подписка && !аренда disableBanner) для EconomyBanner и bootstrap EC1; платформенный sticky (`showBannerAdv`) не влияет на наш UI-баннер ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`EconomyBanner.tsx`](../web-app/src/components/EconomyBanner.tsx), [`App.tsx`](../web-app/src/App.tsx)) |
B2 | **Кнопка «3D-текст» на левой панели неактивна**, нельзя арендовать (в правой панели аренда работает) | UX / баг | 🟡 P1 | ✅ ИСПРАВЛЕНО — клик по 3D-тексту без доступа открывает правую панель с оффером аренды text3d (75 TC, бейдж 💰75); store-флаг `economyPanelOpen` (ui-store) не снимает выделение ([`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx), [`App.tsx`](../web-app/src/App.tsx), [`ui-store.ts`](../web-app/src/store/ui-store.ts)) |
B3 | **«Расширенный выбор» (палитра) закрывает панель свойств** вместо открытия оффера аренды | UX / баг | 🟡 P1 | ✅ ИСПРАВЛЕНО — `setEconomyPanelOpen(true)` вместо `clearSelection()`: EconomyPanel рендерится ВНУТРИ правой панели поверх свойств (кнопка «← К свойствам»), флаг сбрасывается только при смене выбранного объекта ([`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx), [`ui-store.ts`](../web-app/src/store/ui-store.ts)) |
A1 | **Экспорт за рекламу:** rewarded-просмотр начислял +50 токенов, но файл не скачивался; счётчик/кулдаун общие с HUD | Баг, платный сценарий | 🔴 P0 | ✅ ИСПРАВЛЕНО — новый вид `export` в `adRewards` (`watchAdForExport()`): НЕ начисляет токены, экспорт выполняется ПОСЛЕ onRewarded; собственный кулдаун 5 мин и лимит ≤3/день, отдельный от HUD `tokens` ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`ExportModal.tsx`](../web-app/src/components/ExportModal.tsx), [`App.tsx`](../web-app/src/App.tsx)) |
A2 | **Импорт за рекламу:** начислялось +50/ролик; file chooser требовал user activation после рекламы | Баг, платный сценарий | 🔴 P0 | ✅ ИСПРАВЛЕНО — `watchAdsForImport(2)` серия 2 роликов ОПЛАЧИВАЕТ импорт (без +50/ролик), частичная серия → импорт не выполняется; диалог выбора файла открывается ДО рекламы (user activation); счётчик вида `import` независим ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`ImportModal.tsx`](../web-app/src/components/ImportModal.tsx), [`document-store.ts`](../web-app/src/store/document-store.ts)) |
C1 | **Бейджи стали слишком крупными** (шрифт 16px, контейнер ×2) после увеличения иконок (U7) | UX / косметика | 🟢 P2 | ✅ ИСПРАВЛЕНО — компактные бейджи: шрифт 10px, padding 1px 3px, gap 2px, minWidth 16/minHeight 14; IconBadge шрифт 10px/padding 2px 4px; иконки остаются 20×20 ([`Badge.tsx`](../web-app/src/components/Badge.tsx), [`IconBadge.tsx`](../web-app/src/components/IconBadge.tsx)) |
C2 | **Токен выглядел как «монета»**, а должен быть золотым кубом-логотипом | UX / косметика | 🟢 P2 | ✅ ИСПРАВЛЕНО — иконка токена = золотой куб `TokenIcon` (из `components/icons`), заменён `MoneyIcon` в Badge/IconBadge; уже используется в HUD/баннере/онбординге/модалках ([`icons/index.tsx`](../web-app/src/components/icons/index.tsx), [`Badge.tsx`](../web-app/src/components/Badge.tsx), [`IconBadge.tsx`](../web-app/src/components/IconBadge.tsx)) |
C3 | **Квест «Зазеркалье» (зеркала) не засчитывался** — счётчик молчал при выполнении условия | Баг (quest) | 🟡 P1 | ✅ ИСПРАВЛЕНО — счёт по mirror-операциям истории (`op.type === 'mirror'` → уникальные `mirrorCreatedIds`) + legacy `scale < 0`; пересечение с текущей сценой; порог «≥ target» ([`economy-store.ts`](../web-app/src/store/economy-store.ts)) |

---

## Детали по пунктам

### U1. Единый кулдаун rewarded-видео вместо отдельного на каждую награду
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Решение принято:** раздельные кулдауны per-reward (вопреки первоначальному обоснованию E4 общим кулдауном). Экономика обновлена до v2.1.
- **Где исправлено:** [`economy-store.ts`](../web-app/src/store/economy-store.ts) — `adRewards: Record<AdRewardKind, AdRewardState>` (кулдаун 5 мин и лимит ≤3/день на каждый вид `tokens`/`import`/`banner`) вместо единых `lastAdTimestamp`/`todayAdsWatched`; миграция старых полей в `sanitizeEconomyData()`; геттеры `getAdCooldownRemaining(kind)`/`getAdRewardsLeftToday(kind)`/`canWatchAdKind(kind)`. [`ECONOMY.md`](../ECONOMY.md) — v2.1 (§2 таблица рекламы per-reward, §5 раздельные счётчики, §9 баланс).

### U2. Таймер отката рекламы не отсчитывает секунды в реальном времени
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Где исправлено:** [`platform/ad-timers.ts`](../web-app/src/platform/ad-timers.ts) — хук `useAdCooldown(kind)` + `getAdCooldownRemainingMs()`: посекундный пересчёт по локальным часам с поправкой на серверное смещение (`getServerTimeOffset()`). [`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx)/[`EconomyMiniHUD.tsx`](../web-app/src/components/EconomyMiniHUD.tsx) показывают живой «м:сс». **P2-5:** fallback `Date.now()` в [`server-time.ts`](../web-app/src/platform/server-time.ts) больше не кэшируется на 30 с.

### U3. Дублирование панели экономики (слева магазин + справа панель)
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-13).
- **Решение принято:** «магазин» = **только правая панель** (`PropertiesPanel` → `EconomyPanel`). Левая вкладка «магазин» удалена как отдельная точка продаж.
- **Что сделано:** вкладка `shop` удалена из [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx) и из `ui-store` (`activeTab` теперь только `'objects' | 'tree'`); компонент [`EconomyShop.tsx`](../web-app/src/components/EconomyShop.tsx) **удалён** (все его офферы — аренды text3d/extendedPalette/disableBanner, подписки, баннер — уже были в `EconomyPanel`, ничего не потеряно). Переходы «купить» (`App.tsx`, `PropertiesPanel.tsx`) заменены с `setActiveTab('shop')` на `clearSelection()`: экономика в правой панели рендерится при пустом выделении, поэтому снятие выделения раскрывает её. i18n: ключ `leftPanel.shop` удалён из ru/en.
- **Спецификация:** [`ECONOMY.md`](../ECONOMY.md) обновлён до **v2.2** — §6.3 «Кнопка скрытия баннера» переведён с трёх мест на два (баннер + панель), п.3 (магазин) переформулирован: точки продаж аренды/подписок сосредоточены в правой панели.

### U4. Нет бейджа у 3D-текста на панели фигур
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Где исправлено:** [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx) — сравнение переведено на реальный тип `s.type === 'text'` из `ALL_SHAPES_DATA` ([`constants.ts`](../web-app/src/constants.ts)); активность через `canUseText3dRO()` (подписка ИЛИ аренда text3d). Бейдж «75» показывается/скрывается корректно.

### U5. Баг: кнопки на баннере активны после покупки скрытия, повторное списание токенов
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12, P0-1).
- **Где исправлено:** [`App.tsx`](../web-app/src/App.tsx) — `EconomyBanner` подключён (yandex-only, `bannerVisible=true`, нет подписки/аренды `disableBanner`). Все **3** точки продажи защищены: EconomyBanner, PropertiesPanel (секция «НЕТ БАННЕРА НА 24 Ч»), EconomyShop — при активной аренде показывают статус «баннер скрыт · N ч» и не позволяют повторно списать токены/показать рекламу. `buyRental('disableBanner')`/`watchAdForBanner()` атомарно скрывают баннер; `refreshDayRollover()` возвращает баннер после expiry аренды.

### U6. Отсутствует простая палитра в свойствах
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Где исправлено:** [`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx) — `ColorPalette` (Wad's Optimum 16) рендерится **всегда** (ядро редактора бесплатно, §3.4); расширенный native `<input type="color">` (кнопка «Расширенный выбор») — только при аренде `extendedPalette`/подписке. Lock-блок заменён на бейдж «75» на кнопке.

### U7. Иконки на всех бейджах — увеличить в 2 раза
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Где исправлено:** [`Badge.tsx`](../web-app/src/components/Badge.tsx) — `MoneyIcon`/`AdFilmIcon`/`ClockIcon`/`CrownIcon` 10→20px, шрифт 10→16px; [`IconBadge.tsx`](../web-app/src/components/IconBadge.tsx) — иконка 16→20px, шрифт 9→13px, контейнеры увеличены.

### U8. Экспорт не происходит при оплате токенами и при просмотре рекламы
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12, P1-1).
- **Где исправлено:** единая модель кэшбэка (Вариант 1, §2.1): [`document-store.ts`](../web-app/src/store/document-store.ts) — `exportStl(method: 'tokens'|'ad')`; модалка списывает `netCost = 50 − кэшбэк` (кэшбэк учтён в цене при токен-оплате, начисляется при рекламной). [`App.tsx`](../web-app/src/App.tsx) — `handleExportExecute(method)` передаёт method → оплата → закрытие → реальное скачивание файла. Хэш модели фиксируется при любом успешном экспорте (анти-фарм). Покрыто тестами (нет задвоения, анти-фарм по хэшу, success/fail сериализации).

### U9. Единый счётчик рекламы вместо отдельного для каждой награды
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Решение принято:** раздельные дневные счётчики per-reward; ECONOMY.md v2.1.
- **Где исправлено:** [`economy-store.ts`](../web-app/src/store/economy-store.ts) — `adRewards[*].countToday` на каждый вид; UI переведён на per-reward счётчики (EconomyMiniHUD/PropertiesPanel/ExportModal — вид `tokens`, ImportModal — вид `import`); i18n подсказка «≤3/день на каждую награду, пауза 5 минут»; `LIMITS.maxPerDay` 405→705, `realisticPerDay` 240→350 (v2.1). **С v2.3 (A1/A2):** видов стало 4 (`tokens`/`import`/`export`/`banner`), доход только `tokens` → лимиты **705→405 / 350→250** ([`economy-config.ts`](../web-app/src/store/economy-config.ts)). Persist v3 + облако (`collectSyncData`/`loadFromCloud`/`partialize`).

### U10. SDK инициализируется после того, как игра становится доступной
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Где исправлено:** [`main.tsx`](../web-app/src/main.tsx) — bootstrap «сплэш-экран со спиннером → `await initSdk()` (таймаут 10с → clean) → рендер App»; ранний fallback `LoadingAPI.ready()` 15с **убран** — `loadingReady()` вызывается только при `workerOk === true` И завершённом init SDK. [`platform/sdk.ts`](../web-app/src/platform/sdk.ts) — `getInitDonePromise()`; `GameplayAPI.start()` стартует после него (не до init SDK).

---

## Регрессии после теста на платформе Яндекс Игр (A/B/C, закрыты 2026-09-14)

> Проблемы выявлены при реальном прогоне сборки на платформе Яндекс Игр (в песочнице/на модерации). Исправлены подзадачами A1/A2 (платные сценарии), B1/B2/B3 (UI-переходы), C1/C2/C3 (бейджи/квест).

### A1. Экспорт за рекламу — токены начислялись, файл не скачивался
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-14).
- **Где исправлено:** новый вид `export` в `adRewards` + `watchAdForExport()` в [`economy-store.ts`](../web-app/src/store/economy-store.ts) — НЕ начисляет токены (раньше `watchAdForTokens` начислял +50); `exportStl` выполняется ПОСЛЕ onRewarded в [`ExportModal.tsx`](../web-app/src/components/ExportModal.tsx) и [`App.tsx`](../web-app/src/App.tsx). Собственный кулдаун 5 мин и лимит ≤3/день, независимый от HUD `tokens`.

### A2. Импорт за рекламу — +50/ролик и user activation
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-14).
- **Где исправлено:** `watchAdsForImport(2)` в [`economy-store.ts`](../web-app/src/store/economy-store.ts) — серия 2 роликов ОПЛАЧИВАЕТ импорт (токены НЕ начисляются ни за один), частичная серия → false; счётчик вида `import` считает показы. File chooser открывается ДО рекламы (в момент клика, user activation) — `importStl(preSelectedFile?)` в [`document-store.ts`](../web-app/src/store/document-store.ts); при отмене выбора реклама не показывается ([`ImportModal.tsx`](../web-app/src/components/ImportModal.tsx)).

### C1. Бейджи стали крупными (регрессия U7)
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-14).
- **Где исправлено:** компактные бейджи в [`Badge.tsx`](../web-app/src/components/Badge.tsx) (шрифт 10px, padding 1px 3px, gap 2px, minWidth 16/minHeight 14) и [`IconBadge.tsx`](../web-app/src/components/IconBadge.tsx) (шрифт 10px, padding 2px 4px); иконки остаются 20×20, `pointer-events:none`, бейдж — ¼ кнопки.

### C2. Токен-иконка — золотой куб вместо монеты
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-14).
- **Где исправлено:** `TokenIcon` (золотой изометрический куб TC из [`icons/index.tsx`](../web-app/src/components/icons/index.tsx)) заменил `MoneyIcon` в Badge/IconBadge; HUD/баннер/онбординг/модалки уже использовали `TokenIcon`.

### C3. Квест «Зазеркалье» не засчитывал зеркала
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-14).
- **Где исправлено:** [`economy-store.ts`](../web-app/src/store/economy-store.ts) — счёт строится по mirror-операциям истории (`op.type === 'mirror'` → уникальные `mirrorCreatedIds`), пересечение с текущей сценой (удаление/undo уменьшает счёт), legacy `scale < 0` (причина бага: `mirrorObject` пишет `scale = Math.abs(...)`), порог «≥ target».

---

## Приоритеты к исправлению

> **Статус 2026-09-14:** все 10 пунктов U1–U10 + регрессии A1/A2, B1/B2/B3, C1/C2/C3 закрыты.

1. 🔴 **P0:** U5 ✅, U8 ✅, U10 ✅, **A1 ✅, A2 ✅** — исправлены (см. реестр выше).
2. 🟡 **P1:** U1 ✅, U2 ✅, U3 ✅, U6 ✅, U9 ✅, **B1 ✅, B2 ✅, B3 ✅, C3 ✅** — исправлены (U1/U9 — раздельные откаты/счётчики per-reward, ECONOMY.md v2.1; U3 — «магазин» = правая панель, ECONOMY.md v2.2 §6.3; B1–B3 — баннер/3D-текст/палитра; C3 — квест зеркал).
3. 🟢 **P2:** U4 ✅, U7 ✅, **C1 ✅, C2 ✅** — исправлены.

**Что осталось открытым:** код-сторона закрыта. Остались ручные проверки на платформе Яндекс Игр: rewarded-реклама экспорта/импорта, отображение баннера, палитра «Расширенный выбор», квест зеркал, модерация (см. [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) → Этап 2, Y.3).

## Чек-лист закрытия

- [x] U1 — откат рекламы разделён по видам наград — ✅ ИСПРАВЛЕНО: `adRewards: Record<AdRewardKind, AdRewardState>` (кулдаун 5 мин и лимит ≤3/день на каждый вид `tokens`/`import`/`banner`), миграция старых полей, ECONOMY.md v2.1 (`economy-store.ts`, `ECONOMY.md`)
- [x] U2 — таймер отката тикает посекундно — ✅ ИСПРАВЛЕНО: `useAdCooldown()`/`getAdCooldownRemainingMs()` (`platform/ad-timers.ts`) — посекундный пересчёт по локальным часам с поправкой на серверное смещение; PropertiesPanel/EconomyMiniHUD показывают живой «м:сс»; fallback `Date.now()` в `getServerTime()` не кэшируется (P2-5)
- [x] U3 — экономика только справа, левая вкладка «магазин» убрана, переходы «купить» работают — ✅ ИСПРАВЛЕНО: «магазин» = правая панель (`PropertiesPanel` → `EconomyPanel`); вкладка `shop` и `EconomyShop.tsx` удалены; переходы «купить» = `clearSelection()`; ECONOMY.md v2.2 (§6.3 — два места)
- [x] U4 — бейдж 3D-текста на панели фигур отображается — ✅ ИСПРАВЛЕНО: сравнение по реальному типу `type:'text'` + `canUseText3dRO()` (`LeftPanel.tsx`)
- [x] U5 — покупка скрытия баннера не может быть повторена, кнопки неактивны во всех точках — ✅ ИСПРАВЛЕНО: EconomyBanner в App.tsx + защита всех 3 точек продажи при активной аренде `disableBanner` (P0-1)
- [x] U6 — простая палитра доступна без аренды/подписки — ✅ ИСПРАВЛЕНО: `ColorPalette` рендерится всегда; расширенный picker — за аренду `extendedPalette`/подписку (`PropertiesPanel.tsx`)
- [x] U7 — иконки бейджей ×2 — ✅ ИСПРАВЛЕНО: Badge 10→20px/шрифт 16px; IconBadge 16→20px (`Badge.tsx`, `IconBadge.tsx`)
- [x] U8 — экспорт выполняется после оплаты токенами и после рекламы — ✅ ИСПРАВЛЕНО: единая модель кэшбэка (`exportStl(method)`), цепочка оплата → закрытие → скачивание восстановлена (P1-1)
- [x] U9 — отдельные счётчики рекламы по видам наград — ✅ ИСПРАВЛЕНО: `adRewards[*].countToday` per-reward, лимиты 705/350 (v2.1) → **405/250 (v2.3)**, ECONOMY.md v2.1/v2.3 (`economy-store.ts`, `economy-config.ts`)
- [x] U10 — SDK инициализирован до доступности игры — ✅ ИСПРАВЛЕНО: сплэш-экран → `initSdk()` (таймаут 10с → clean) → рендер App; `LoadingAPI.ready()` только при `workerOk && initDone` (fallback 15с убран); `GameplayAPI.start()` через `getInitDonePromise()` (не до init SDK)
- [x] A1 — экспорт за рекламу — ✅ ИСПРАВЛЕНО: вид `export` (`watchAdForExport()`, без начисления токенов), экспорт после onRewarded, свой счётчик/кулдаун (`economy-store.ts`, `ExportModal.tsx`)
- [x] A2 — импорт за рекламу — ✅ ИСПРАВЛЕНО: серия 2 роликов оплачивает импорт (без +50/ролик), file chooser ДО рекламы (user activation), счётчик вида `import` независим (`economy-store.ts`, `ImportModal.tsx`, `document-store.ts`)
- [x] B1 — баннер виден по умолчанию — ✅ ИСПРАВЛЕНО: `bannerVisible=true` (initial state + persist-merge), геттер `shouldShowBannerRO()` (`economy-store.ts`, `EconomyBanner.tsx`, `App.tsx`)
- [x] B2 — клик по 3D-тексту без доступа → экономика, не disabled — ✅ ИСПРАВЛЕНО: `setEconomyPanelOpen(true)`, панель остаётся открытой (`LeftPanel.tsx`, `App.tsx`, `ui-store.ts`)
- [x] B3 — «Расширенный выбор» не закрывает панель — ✅ ИСПРАВЛЕНО: `economyPanelOpen` в ui-store, EconomyPanel внутри панели, кнопка «← К свойствам» (`PropertiesPanel.tsx`, `ui-store.ts`)
- [x] C1 — компактные бейджи (шрифт 10px, padding 1px 3px, иконки 20px) — ✅ ИСПРАВЛЕНО (`Badge.tsx`, `IconBadge.tsx`)
- [x] C2 — токен = золотой куб `TokenIcon` — ✅ ИСПРАВЛЕНО (`icons/index.tsx`, `Badge.tsx`, `IconBadge.tsx`)
- [x] C3 — квест зеркал считает mirror-операции истории, порог «≥ target» — ✅ ИСПРАВЛЕНО (`economy-store.ts`)
- [x] `pnpm verify` — 0 ошибок, все тесты проходят — ✅ 2026-09-14: typecheck 0 ошибок, **357/357 тестов (23 файла)**, build/build:yandex успешны (полный прогон ПОСЛЕ всех A/B/C правок)
- [x] Записи в `CHANGELOG.md`, статусы в `CODE_REVIEW.md` / `DEVELOPMENT_PLAN.md` — ✅ обновлены (см. ссылки в шапке)

---

# 🗣️ Регрессии UB-0…UB-5 (2026-09-17)

**Источник:** ручной прогон (main + yandex-games) после закрытия реестра U/A/B/C.
**Статус:** 🟢 ЗАКРЫТО (2026-09-17) — все пункты исправлены, `pnpm verify` зелёный.

| # | Проблема | Тип | Приоритет | Статус |
|---|----------|-----|-----------|--------|
| UB-0a | Экспорт STL: при выгрузке нескольких фигур (простых/сложных) они «разлетаются» — позиция применена дважды (запечена в вершины + `obj.transform`) | Баг данных, **ветка main** | 🔴 P0 | ✅ ИСПРАВЛЕНО — трансформ применяется к bbox-центрированной геометрии, как во вьюпорте (`io/stl-export.ts` + регрессионный тест) |
| UB-0b | Сохранение проекта/.doodle не сохраняет импортированную геометрию (исчезает после загрузки) | Баг данных, **main + yandex** | 🔴 P0 | ✅ ИСПРАВЛЕНО — `handleRebuildScene` восстанавливает baked-меш `import_mesh`/`text3d` из операции; move сдвигает baked-кэш; фолбэк в `rebuildFromHistory`; `.doodle`: `text3d` в валидных типах, TypedArray → массивы, лимит model.json 5→64 МБ (`csg/worker-handlers.ts`, `store/rebuild.ts`, `io/doodle-io.ts`) |
| UB-1 | 3D-текст и «Расширенная палитра» без аренды не открывали модалку аренды | UX / баг | 🟡 P1 | ✅ ИСПРАВЛЕНО — новый `RentalModal` (аренда 24ч + авто-продолжение действия), флаги `rentalModalKey`/`palettePickerRequested` (`components/RentalModal.tsx`, `App.tsx`, `PropertiesPanel.tsx`, `ui-store.ts`) |
| UB-2 | Баннер скрывался после просмотра ЛЮБОЙ rewarded-рекламы, а не только реварда «отключить баннер» | Баг экономики (выдача платного реварда бесплатно) | 🔴 P0 | ✅ ИСПРАВЛЕНО — `hideBannerAdv()` убран из `onRewarded` платформы; скрытие осталось только в `watchAdForBanner()` (`platform/yandex.ts`) |
| UB-3 | В модалке экспорта не показан таймер отката реварда | UX | 🟢 P2 | ✅ ИСПРАВЛЕНО — `useAdCooldown('export')` + подпись «ждём м:сс», кнопка дизейблится на кулдауне (`components/ExportModal.tsx`) |
| UB-4 | Дублирование кнопок «скрыть баннер»: секция в правой панели + виджет над тулбаром | UX / дубль | 🟡 P1 | ✅ ИСПРАВЛЕНО — единственное место: строка «Отключение баннера» в разделе «Аренда» (токены + 1 ревард); секция-дубль и `EconomyBanner` над тулбаром удалены (`PropertiesPanel.tsx`, `App.tsx`) |
| UB-5 | Бейджи слишком крупные; иконки оставить текущими | UX | 🟢 P2 | ✅ ИСПРАВЛЕНО — контейнер бейджа ×0.75 (шрифт 7.5px, minWidth 12px, padding/gap/shadow ×0.75), иконки 20px сохранены (`components/Badge.tsx`) |

**Проверка:** `pnpm typecheck` — 0 ошибок; `pnpm test` — **375/375**; `pnpm build` + `pnpm build:yandex` — успешны.
**Перенос в main:** UB-0a/UB-0b — платформенно-независимые, портируются в `main` (файлы: `io/stl-export.ts`, `io/stl-export.test.ts`, `csg/worker-handlers.ts`, `store/rebuild.ts`, `io/doodle-io.ts`); UB-1…UB-5 — специфика экономики yandex-games.
