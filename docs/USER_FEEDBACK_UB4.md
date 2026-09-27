# 🗣️ Отзыв пользователя: UB4 — отключение баннера за токены не скрывало рекламу платформы (2026-09-27)

**Дата отзыва:** 2026-09-27
**Источник:** пользовательский отзыв (ручной прогон на Яндекс Играх) + лог SDK-консоли
**Статус:** 🟢 ЗАКРЫТО (2026-09-27) — UB4-1 исправлен, UB4-2 зарегистрирован как наблюдение
**Объект:** экономика ([`economy-store.ts`](../web-app/src/store/economy-store.ts)), платформа ([`platform/yandex.ts`](../web-app/src/platform/yandex.ts)), bootstrap ([`App.tsx`](../web-app/src/App.tsx))

> Реестр проблем, а не код-ревью. Продолжение [`docs/USER_FEEDBACK_UB3.md`](USER_FEEDBACK_UB3.md).
> Все ссылки на файлы/строки проверены по рабочему дереву ветки `yandex-games`.
> Связанные материалы: [`ECONOMY.md`](../ECONOMY.md) (§6.3 — кнопка скрытия баннера, §3.2 — аренда `disableBanner` 50 TC), [`docs/USER_FEEDBACK_ECONOMY.md`](USER_FEEDBACK_ECONOMY.md) (U5/P0-1, UB-2), [`CHANGELOG.md`](../CHANGELOG.md) → `[Unreleased]`.

---

## Текст отзыва (дословно)

> - не работает отключение баннера за токены, за 50 токенов;
> - отключение баннера не отключает сам баннер, а только саму кнопку отключения;

Фрагмент лога платформы (видно списание и отсутствие скрытия):

```
[Economy] Rental disableBanner purchased: 50 tokens, 24h
adv2_show {"type":"sticky"}        ← баннер платформы остался
… (ни одного вызова hideBannerAdv)
```

---

## Реестр проблем

| # | Проблема | Тип | Приоритет | Статус |
|---|----------|-----|-----------|--------|
| UB4-1 | Покупка «Отключение баннера» (50 TC / 1 📺) скрывала только наш UI-оффер, платформенный sticky-баннер оставался на экране | Баг экономики (платная функция без видимого эффекта) | 🔴 P0 | ✅ ИСПРАВЛЕНО — единая точка `setPlatformBannerVisible()` + `syncPlatformBanner()`; вызовы при покупке аренды/подписки, при старте после `loadFromCloud()` и при возврате оффера в `refreshDayRollover()` (`economy-store.ts`, `App.tsx`) |
| UB4-2 | Платформа может сама перепоказать sticky-баннер (в логе — `adv2_show` после `onAdLoadFailed`), штатного сторожа нет | Наблюдение за поведением SDK | 🟡 P1 | 🔲 ОТКРЫТО — периодическая сверка `getBannerAdvStatus()` + повторный `hideBannerAdv()` не реализованы; при подтверждении — заводить правку |

---

## UB4-1 · Отключение баннера за токены не отключало сам баннер 🔴 P0

**Как воспроизвести:** купить «Отключение баннера» в разделе «Аренда» правой панели → sticky-баннер Яндекс остаётся на экране до перезагрузки; после перезагрузки показывается снова, даже если аренда ещё активна.

**Корень (три независимые причины):**

| # | Факт | Место |
|---|------|-------|
| 1 | `hideBannerAdv()` вызывался **только** в рекламном пути `watchAdForBanner()` | [`economy-store.ts:963-1005`](../web-app/src/store/economy-store.ts) |
| 2 | `buyRental('disableBanner')` и `buySubscription()` ставили лишь `bannerVisible = false` — это состояние **нашего** оффера в панели, к SDK отношения не имеет | [`economy-store.ts:1237-1273`](../web-app/src/store/economy-store.ts), [`:1107-1141`](../web-app/src/store/economy-store.ts) |
| 3 | `platform.init()` при каждом старте безусловно зовёт `adv.showBannerAdv()` → баннер возвращался даже с активной арендой | [`platform/yandex.ts:64-72`](../web-app/src/platform/yandex.ts) |

**Исправление.**

1. **Единая точка управления платформенным баннером** — `setPlatformBannerVisible(visible)`
   ([`economy-store.ts:1211-1226`](../web-app/src/store/economy-store.ts)): берёт адаптер
   через `getPlatform()`, вызывает `showBannerAdv()`/`hideBannerAdv()` внутри `try/catch`
   (баннер может быть недоступен из-за настроек консоли или отсутствия рекламной сети —
   покупка не должна падать).
2. **Сверка SDK с экономикой** — `syncPlatformBanner()`
   ([`economy-store.ts:1231-1235`](../web-app/src/store/economy-store.ts)):
   `paidOff = hasActiveSubscriptionRO() || hasRentalRO('disableBanner')` → при `paidOff`
   скрываем, иначе показываем. RO-геттеры — без мутаций, безопасны для bootstrap-фазы.
3. **Точки вызова:**

| Место | Когда | Действие |
|-------|-------|----------|
| `watchAdForBanner()` (:1001) | ревард «отключить баннер» досмотрен | `setPlatformBannerVisible(false)` (прямой `platform.hideBannerAdv()` заменён на ту же точку) |
| `buyRental()` (:1269) | куплен `disableBanner` **за токены** | `setPlatformBannerVisible(false)` |
| `buySubscription()` (:1137) | подписка оплачена (атомарно, после `applied`) | `setPlatformBannerVisible(false)` |
| `refreshDayRollover()` (:1367) | аренда истекла, оффер вернулся | `setPlatformBannerVisible(true)` |
| `App.tsx` bootstrap (:247-252) | сразу после `loadFromCloud()` + `setBannerVisible(shouldShowBannerRO())` | `void syncPlatformBanner()` — закрывает и случай «из облака загрузился аккаунт с активной арендой», и случай «аренда истекла, баннер надо вернуть» |

**Что сознательно НЕ менялось:**

- `platform.init()` по-прежнему показывает баннер безусловно — экономическое решение
  применяется сразу после загрузки прогресса в `App.tsx`. Минус: при медленном облаке
  баннер может мелькнуть на короткий момент. Плюс: нет циклической зависимости
  `platform → store`, и поведение остаётся предсказуемым при недоступном SDK.
- `hideBannerAdv()` по-прежнему **не** вызывается из общего обработчика rewarded-рекламы
  (регрессия UB-2: платный reward не должен выдаваться бесплатно за любой ролик).

**Тесты** — [`economy-store.test.ts:1292-1360`](../web-app/src/store/economy-store.test.ts),
`describe('Платформенный sticky-баннер (UB4-1)')`, 7 шт.:

1. покупка аренды `disableBanner` за токены → ровно один `hideBannerAdv()`, `showBannerAdv()` не вызывался;
2. покупка другой аренды (`text3d`) → к SDK не обращаемся;
3. покупка подписки → `hideBannerAdv()`;
4. просмотр рекламы за баннер → `hideBannerAdv()` + `bannerVisible === false`;
5. `syncPlatformBanner()` при активной аренде → `hideBannerAdv()`;
6. `syncPlatformBanner()` без оплаты → `showBannerAdv()`;
7. `syncPlatformBanner()` при истёкшей аренде → `showBannerAdv()` (баннер вернулся).

**Проверка:** `pnpm typecheck` — 0 ошибок; `pnpm test` — **414/414 (27 файлов)**;
`pnpm build` + `pnpm build:yandex` — успешны.

---

## UB4-2 · Платформа сама перепоказывает баннер 🟡 P1 (наблюдение)

В логе после `onAdLoadFailed` встречается повторный `adv2_show`, несмотря на активное
снятие рекламы. Сейчас это не компенсируется: `syncPlatformBanner()` вызывается один раз
при старте и в момент покупки.

**Вариант решения (не реализован):** сторож — периодический `getBannerAdvStatus()`
(метод уже есть в адаптерах: [`platform/types.ts:62`](../web-app/src/platform/types.ts),
[`yandex.ts:265-276`](../web-app/src/platform/yandex.ts), no-op в
[`clean.ts:85`](../web-app/src/platform/clean.ts)) и повторный `hideBannerAdv()`, пока
`hasActiveSubscriptionRO() || hasRentalRO('disableBanner')`. Порождающий риск — лишние
вызовы SDK, поэтому решается по факту подтверждённого поведения (не чаще одного сверочного
вызова в N секунд + только при `stickyAdvIsShowing === true`).

---

## Чек-лист закрытия

- [x] UB4-1 — покупка аренды/подписки скрывает платформенный баннер, истечение возвращает
- [x] UB4-1 — тесты (7), `pnpm typecheck` 0 ошибок, `pnpm test` 414/414
- [x] UB4-1 — записи в `CHANGELOG.md` и `DEVELOPMENT_PLAN.md`
- [ ] UB4-2 — сторож по `getBannerAdvStatus()` (по подтверждению поведения SDK)
