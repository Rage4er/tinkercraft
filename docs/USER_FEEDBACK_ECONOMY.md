# 🗣️ Отзыв пользователя: экономика и UI (2026-09-11)

**Дата отзыва:** 2026-09-11
**Источник:** пользовательский отзыв (ручной прогон приложения)
**Статус:** 🟢 ЗАКРЫТО (2026-09-13) — все 10 проблем реестра исправлены (U3 — решение «магазин» = правая панель, ECONOMY.md v2.2)
**Объект:** экономика ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`economy-config.ts`](../web-app/src/store/economy-config.ts)), UI экономики ([`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx), [`EconomyShop.tsx`](../web-app/src/components/EconomyShop.tsx), [`EconomyBanner.tsx`](../web-app/src/components/EconomyBanner.tsx), [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx), [`Badge.tsx`](../web-app/src/components/Badge.tsx)), платформа ([`main.tsx`](../web-app/src/main.tsx), [`platform/*`](../web-app/src/platform/index.ts))

> Документ создан по просьбе пользователя для фиксации отзыва. Это **реестр проблем**, а не код-ревью.
> **Закрыт 2026-09-12:** все пункты U1–U10 обработаны в подзадачах (см. [`CHANGELOG.md`](../CHANGELOG.md) → `[Unreleased]`: U1/U9 v2.1, U10, U2, P2-5, U4, U6, U7, U5/P0-1, U8/P1-1, P0-2).
> **U3 решён 2026-09-13:** «магазин» = правая панель (`PropertiesPanel` → `EconomyPanel`); левая вкладка убрана, переходы «купить» ведут в правую панель; ECONOMY.md обновлён до v2.2 (§6.3 — два места).
> Проверка: `pnpm verify` — typecheck 0 ошибок, 336/336 тестов (23 файла), build/build:yandex успешны.
> Связанные материалы: [`ECONOMY.md`](../ECONOMY.md) (v2.2), [`docs/ECONOMY_CODE_REVIEW.md`](ECONOMY_CODE_REVIEW.md), [`CHANGELOG.md`](../CHANGELOG.md), [`CODE_REVIEW.md`](CODE_REVIEW.md), [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md).

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
U9 | **Счётчик просмотров рекламы единый для всех наград**; должен быть **отдельный счётчик для каждой награды** | Логика | 🟡 P1 | ✅ ИСПРАВЛЕНО — отдельные дневные счётчики per-reward (`adRewards[*].countToday`), лимиты `maxPerDay=705`, `realisticPerDay=350` ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`economy-config.ts`](../web-app/src/store/economy-config.ts)) |
U10 | **SDK инициализируется уже после того, как игра стала доступна** — недопустимо | Платформа / модерация | 🔴 P0 | ✅ ИСПРАВЛЕНО — bootstrap «сплэш → initSdk → App» в main.tsx; ранний fallback LoadingAPI.ready (15с) убран; GameplayAPI стартует после `getInitDonePromise()` ([`main.tsx`](../web-app/src/main.tsx), [`platform/sdk.ts`](../web-app/src/platform/sdk.ts)) |

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
- **Где исправлено:** [`economy-store.ts`](../web-app/src/store/economy-store.ts) — `adRewards[*].countToday` на каждый вид; UI переведён на per-reward счётчики (EconomyMiniHUD/PropertiesPanel/ExportModal — вид `tokens`, ImportModal — вид `import`); i18n подсказка «≤3/день на каждую награду, пауза 5 минут»; `LIMITS.maxPerDay` 405→705, `realisticPerDay` 240→350 ([`economy-config.ts`](../web-app/src/store/economy-config.ts)). Persist v3 + облако (`collectSyncData`/`loadFromCloud`/`partialize`).

### U10. SDK инициализируется после того, как игра становится доступной
- **Статус:** ✅ ИСПРАВЛЕНО (2026-09-12).
- **Где исправлено:** [`main.tsx`](../web-app/src/main.tsx) — bootstrap «сплэш-экран со спиннером → `await initSdk()` (таймаут 10с → clean) → рендер App»; ранний fallback `LoadingAPI.ready()` 15с **убран** — `loadingReady()` вызывается только при `workerOk === true` И завершённом init SDK. [`platform/sdk.ts`](../web-app/src/platform/sdk.ts) — `getInitDonePromise()`; `GameplayAPI.start()` стартует после него (не до init SDK).

---

## Приоритеты к исправлению

> **Статус 2026-09-13:** все 10 пунктов закрыты (U3 — решение «магазин» = правая панель, ECONOMY.md v2.2).

1. 🔴 **P0:** U5 ✅, U8 ✅, U10 ✅ — исправлены (см. реестр выше).
2. 🟡 **P1:** U1 ✅, U2 ✅, **U3 ✅**, U6 ✅, U9 ✅ — исправлены (U1/U9 — раздельные откаты/счётчики per-reward, ECONOMY.md v2.1; U3 — «магазин» = правая панель, ECONOMY.md v2.2 §6.3).
3. 🟢 **P2:** U4 ✅, U7 ✅ — исправлены.

**Что осталось открытым:** всё закрыто. Далее — ручная визуальная проверка UI на платформе Yandex и модерация (см. [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) → Этап 2, Y.3).

## Чек-лист закрытия

- [x] U1 — откат рекламы разделён по видам наград — ✅ ИСПРАВЛЕНО: `adRewards: Record<AdRewardKind, AdRewardState>` (кулдаун 5 мин и лимит ≤3/день на каждый вид `tokens`/`import`/`banner`), миграция старых полей, ECONOMY.md v2.1 (`economy-store.ts`, `ECONOMY.md`)
- [x] U2 — таймер отката тикает посекундно — ✅ ИСПРАВЛЕНО: `useAdCooldown()`/`getAdCooldownRemainingMs()` (`platform/ad-timers.ts`) — посекундный пересчёт по локальным часам с поправкой на серверное смещение; PropertiesPanel/EconomyMiniHUD показывают живой «м:сс»; fallback `Date.now()` в `getServerTime()` не кэшируется (P2-5)
- [x] U3 — экономика только справа, левая вкладка «магазин» убрана, переходы «купить» работают — ✅ ИСПРАВЛЕНО: «магазин» = правая панель (`PropertiesPanel` → `EconomyPanel`); вкладка `shop` и `EconomyShop.tsx` удалены; переходы «купить» = `clearSelection()`; ECONOMY.md v2.2 (§6.3 — два места)
- [x] U4 — бейдж 3D-текста на панели фигур отображается — ✅ ИСПРАВЛЕНО: сравнение по реальному типу `type:'text'` + `canUseText3dRO()` (`LeftPanel.tsx`)
- [x] U5 — покупка скрытия баннера не может быть повторена, кнопки неактивны во всех точках — ✅ ИСПРАВЛЕНО: EconomyBanner в App.tsx + защита всех 3 точек продажи при активной аренде `disableBanner` (P0-1)
- [x] U6 — простая палитра доступна без аренды/подписки — ✅ ИСПРАВЛЕНО: `ColorPalette` рендерится всегда; расширенный picker — за аренду `extendedPalette`/подписку (`PropertiesPanel.tsx`)
- [x] U7 — иконки бейджей ×2 — ✅ ИСПРАВЛЕНО: Badge 10→20px/шрифт 16px; IconBadge 16→20px (`Badge.tsx`, `IconBadge.tsx`)
- [x] U8 — экспорт выполняется после оплаты токенами и после рекламы — ✅ ИСПРАВЛЕНО: единая модель кэшбэка (`exportStl(method)`), цепочка оплата → закрытие → скачивание восстановлена (P1-1)
- [x] U9 — отдельные счётчики рекламы по видам наград — ✅ ИСПРАВЛЕНО: `adRewards[*].countToday` per-reward, лимиты 705/350, ECONOMY.md v2.1 (`economy-store.ts`, `economy-config.ts`)
- [x] U10 — SDK инициализирован до доступности игры — ✅ ИСПРАВЛЕНО: сплэш-экран → `initSdk()` (таймаут 10с → clean) → рендер App; `LoadingAPI.ready()` только при `workerOk && initDone` (fallback 15с убран); `GameplayAPI.start()` через `getInitDonePromise()` (не до init SDK)
- [x] `pnpm verify` — 0 ошибок, все тесты проходят — ✅ 2026-09-12: typecheck 0 ошибок, 336/336 тестов (23 файла), build/build:yandex успешны
- [x] Записи в `CHANGELOG.md`, статусы в `CODE_REVIEW.md` / `DEVELOPMENT_PLAN.md` — ✅ обновлены (см. ссылки в шапке)
