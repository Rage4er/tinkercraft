# 🗣️ Отзыв пользователя: UB5 — аренда поверх Pro-подписки, ширина правой панели, скроллбар списка (2026-09-28)

**Дата отзыва:** 2026-09-28
**Источник:** пользовательский отзыв (ручной прогон на Яндекс Играх)
**Статус:** ✅ ЗАКРЫТО — реестр задокументирован 2026-09-28, исправлено 2026-09-29 (UB5-1…UB5-3).
**Объект:** экономика ([`economy-store.ts`](../web-app/src/store/economy-store.ts), [`economy-config.ts`](../web-app/src/store/economy-config.ts)), панель экономики/аренды ([`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx), [`RentalModal.tsx`](../web-app/src/components/RentalModal.tsx)), layout ([`App.css`](../web-app/src/App.css)), левая панель ([`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx), [`ComponentTree.tsx`](../web-app/src/components/ComponentTree.tsx)), спека ([`ECONOMY.md`](../ECONOMY.md))

> Реестр проблем, а не код-ревью. Продолжение [`docs/USER_FEEDBACK_UB4.md`](USER_FEEDBACK_UB4.md) (закрыт 2026-09-27).
> Все ссылки на файлы/строки проверены по рабочему дереву ветки `yandex-games` (коммит `d63d4c5`).
> Связанные материалы: [`ECONOMY.md`](../ECONOMY.md) (§3.2 — аренды, §3.3 — состав подписки), [`docs/USER_FEEDBACK_UB3.md`](USER_FEEDBACK_UB3.md) (UB3-2 — иконки и кнопки не влезают по ширине), [`CHANGELOG.md`](../CHANGELOG.md) → `[Unreleased]`.

---

## Текст отзыва (дословно)

> **UB5-1.** при pro подписке остается активна покупка расширенной палитры из панели аренды, хотя она уже включена в подписку, токены списываются повторно
> **UB5-2.** расширить правую панель х1,2
> **UB5-3.** добавить скроллбар в панель "список" слева, по аналогии с панелью "дерево"

---

## Реестр проблем

| # | Проблема | Тип | Приоритет | Проверка по коду | Статус |
|---|----------|-----|-----------|------------------|--------|
| UB5-1 | При активной Pro-подписке в разделе «Аренда» остаются рабочими кнопки покупки `text3d`/`extendedPalette`/`disableBanner` — функция уже выдана подпиской, но токены списываются повторно | Экономика, потеря денег пользователя | 🔴 P1 | ✅ подтверждено: `buyRental` проверяет только баланс ([`economy-store.ts:1237-1273`](../web-app/src/store/economy-store.ts)), в `rentalsSection` нет сверки с подпиской ([`PropertiesPanel.tsx:296-373`](../web-app/src/components/PropertiesPanel.tsx)) | ✅ ИСПРАВЛЕНО (2026-09-29) |
| UB5-2 | Правая панель слишком узкая — расширить ×1,2 (200px → 240px) | UX / layout | 🟡 P2 | ✅ подтверждено: `.panel-right { width: 200px }` ([`App.css:763-773`](../web-app/src/App.css)); продолжение UB3-2 | ✅ ИСПРАВЛЕНО (2026-09-29) |
| UB5-3 | В левой панели вкладка «Список» не имеет собственного скролла (в отличие от «Дерево») — длинный список растягивает секцию и скроллит всю панель | UX / layout | 🟢 P3 | ✅ подтверждено: у `.ct-list` есть `max-height + overflow-y` ([`App.css:987-996`](../web-app/src/App.css)), у `.object-list` — нет ([`App.css:456-462`](../web-app/src/App.css)) | ✅ ИСПРАВЛЕНО (2026-09-29) |

---

## UB5-1 · Покупка аренды поверх активной Pro-подписки — токены списываются повторно 🔴 P1

**Как воспроизвести:** купить недельную (700 TC) или месячную (2000 TC) подписку → открыть правую панель, раздел «Аренда» → кнопки «токены 75» у строк «3D-текст» и «Расширенная палитра» (и «токены 50» у «Отключения баннера») остаются активными → клик списывает токены, хотя доступ уже выдан.

**Что обещано спекой.** [`ECONOMY.md`](../ECONOMY.md) §3.3 (строка 62): «Состав: безлимит экспорта/импорта, **текст, палитра, баннер off**. **Без автосписания.**» То есть все три объекта аренды (§3.2: `text3d` 75, `extendedPalette` 75, `disableBanner` 50) входят в подписку.

**Доступ по подписке действительно выдаётся** — четыре независимых места:

| Фича | Где подписка даёт доступ | Место |
|------|--------------------------|-------|
| Расширенная палитра | `canUseExtendedPicker = hasExtendedPaletteRental \|\| hasActiveSub` | [`PropertiesPanel.tsx:533-534`](../web-app/src/components/PropertiesPanel.tsx) |
| 3D-текст | единый RO-хелпер «подписка ИЛИ аренда `text3d`» | [`App.tsx:498-505`](../web-app/src/App.tsx), [`:749-762`](../web-app/src/App.tsx) |
| Скрытие баннера | `syncPlatformBanner()`: `hasActiveSubscriptionRO() \|\| hasRentalRO('disableBanner')` → `hideBannerAdv()` | [`economy-store.ts:1231-1235`](../web-app/src/store/economy-store.ts) |
| Экспорт/импорт безлимит | bypass по `hasActiveSub` + скрытие бейджей | [`ExportModal.tsx:52-60`](../web-app/src/components/ExportModal.tsx), [`ImportModal.tsx:58-66`](../web-app/src/components/ImportModal.tsx), [`Toolbar.tsx:118-124`](../web-app/src/components/Toolbar.tsx) |

**Почему всё-таки списывает (две причины):**

| # | Факт | Место |
|---|------|-------|
| 1 | `buyRental(key)` валидирует **только баланс** (`state.tokens < config` до и атомарно внутри `set()`); проверки «ключ уже выдан подпиской» нет. Ставит `rentals[key] = serverTime + ONE_DAY_MS` и списывает `config` токенов | [`economy-store.ts:1237-1273`](../web-app/src/store/economy-store.ts) (`:1241`, `:1252-1258`) |
| 2 | `rentalsSection` рендерит кнопки покупки для всех трёх строк; локальный `isActive = hasRental(r.key)` учитывает **только аренду**, не подписку. `hasActiveSub` в компоненте уже есть ([`:73`](../web-app/src/components/PropertiesPanel.tsx)), но в секции аренды не используется | [`PropertiesPanel.tsx:296-373`](../web-app/src/components/PropertiesPanel.tsx) (`rentalsConfig` :285-289, `isActive` :310, кнопка токенов :341-354) |

**Контраст — другой путь защищён.** `RentalModal` (открывается кликом по закрытой фиче) при активной подписке сам себя закрывает: `if (!economyActive || hasActiveSub || hasAccess) bypassDone(rentalKey)` ([`RentalModal.tsx:63`](../web-app/src/components/RentalModal.tsx)). То есть защита есть на пути «клик по фиче», но отсутствует на пути «клик по кнопке покупки в панели экономики» — отсюда ощущение «лазейки для двойной траты».

**Последствия:**
1. Прямая потеря токенов (75 TC за уже доступную палитру) — для пользователя, уже заплатившего 700/2000 TC.
2. Активная аренда «внутри» подписки невидима: после истечения подписки `rentals[key]` ещё 24 ч продолжает действовать (само по себе корректно), но пользователь воспринимает это как «купил дважды».
3. `buyRental` возвращает коды только `not_enough` / `ok` ([`:1242, 1264, 1272`](../web-app/src/store/economy-store.ts)) — кода «уже включено в подписку» нет, UI не может объяснить отказ.

**Предлагаемое решение (к реализации):**

1. **Store-гейт (главный, закрывает все пути):** в начале `buyRental` — `if (get().hasActiveSubscriptionRO()) return { ok: false, code: 'included_in_subscription' }`. RO-геттер (не мутирующий `hasActiveSubscription()`) — по конвенции P1-4/EC-R3.
2. **UI:** в `rentalsSection` при активной подписке вместо кнопок покупки рендерить статус «Входит в Pro» (строки не скрывать — пользователю полезно видеть, что именно входит; ориентир — уже реализованный статус подписки `economy.status.proActive`, [`ru/translation.json:443-448`](../web-app/src/i18n/locales/ru/translation.json)).
3. **i18n:** новый ключ `economy.status.includedInPro` (ru: «Входит в Pro», en: "Included in Pro") + ключ причины отказа для `notify`/тултипа.
4. **Тесты (`economy-store.test.ts`):** `buyRental('extendedPalette')` при активной подписке → `ok: false`, баланс **не** изменён, `rentals.extendedPalette === null`; аналогично для `text3d`/`disableBanner`; без подписки — покупка проходит как сейчас (регрессия UB4-1 не должна сломаться).
5. **Смежное (не обязательное):** если в момент покупки подписки аренда уже активна — сегодня она просто «перекрывается» подпиской; при желании добавить выдачу `paidInSubRefund` (компенсацию) — **открытый вопрос**, в текущем патче не делать.

**Критерии готовности:** при активной подписке в разделе «Аренда» нет ни одной активной кнопки списания токенов; прямой вызов `buyRental` из любого места не списывает токены; без подписки покупки работают как раньше.

---

## UB5-2 · Расширить правую панель ×1,2 🟡 P2

**Факт.** Ширина задаётся одним CSS-правилом: `.panel-right { width: 200px; flex-shrink: 0; overflow-y: auto }` ([`App.css:763-773`](../web-app/src/App.css)); левая — `.panel-left { width: 170px }` ([`App.css:332-342`](../web-app/src/App.css)). `.main` — flex-контейнер ([`App.css:325-329`](../web-app/src/App.css)), вьюпорт занимает остаток. Медиа-запросов, меняющих ширину панелей, в `App.css` нет (проверено `grep @media`).

**Запрос пользователя:** ×1,2 → **240px** (200 × 1.2).

**Контекст.** Это продолжение UB3-2 (иконки экономики ×2 и кнопки «токены/ревард» не влезают по ширине, [`docs/USER_FEEDBACK_UB3.md`](USER_FEEDBACK_UB3.md)) и UB2-3b (маятник размеров бейджей). Расширение панели снимает часть проблем UB3-2, но не отменяет решение по целевым размерам иконок — их всё равно надо зафиксировать в [`ECONOMY.md`](../ECONOMY.md) §6.4.

**Предлагаемое решение:** `.panel-right { width: 240px }` (одна правка в `App.css:764`). Если критична работа на узких окнах (встроенные iframe Яндекс Игр) — дополнительно `max-width: 30vw` либо медиа-брейкпоинт; на узких экранах сейчас панель и так «съедает» вьюпорт, поэтому ограничение `max-width` стоит завести сразу.

**Риски/проверки:** после расширения пересмотреть, не нужна ли отмена вертикальной раскладки кнопок «токены/ревард» (UB3-2, `flexDirection: 'column'` в [`PropertiesPanel.tsx:337-340`](../web-app/src/components/PropertiesPanel.tsx)) — при 240px две кнопки могут встать в строку; не менять автоматически, решить по скриншоту.

**Критерии готовности:** правая панель 240px на десктопе; вьюпорт не схлопнут; секции «Аренда»/«Pro»/квесты читаемы, ничего не вылезает за панель.

---

## UB5-3 · Скроллбар во вкладку «Список» (по аналогии с «Дерево») 🟢 P3

**Факт.** Вкладки переключаются в `Section` «Объекты» ([`LeftPanel.tsx:145-199`](../web-app/src/components/LeftPanel.tsx)): «Список» → `<div className="object-list">` (:162-188), «Дерево» → `<ComponentTree>` (:190-197, корень `.ct-list`, [`ComponentTree.tsx:80`](../web-app/src/components/ComponentTree.tsx)).

| Свойство | `.ct-list` (дерево) | `.object-list` (список) |
|---|---|---|
| `display / flex-direction / gap / padding` | flex column, 1px, 3px 4px | flex column, 1px, 2px 4px |
| `max-height` | **240px** ([`App.css:992`](../web-app/src/App.css)) | нет ([`App.css:456-462`](../web-app/src/App.css)) |
| `overflow-y` | **auto** (:993) | нет |
| `scrollbar-width / scrollbar-color` | **thin / var(--border) transparent** (:994-995) | нет |

**Последствие.** Длинный список растягивает секцию «Объекты», и скроллится вся `.panel-left` (`overflow-y: auto`, [`App.css:338`](../web-app/src/App.css)) — заголовок, палитра фигур и секция «История» уезжают, а до нужного объекта не «дотянуться» локальным скроллом. Во вкладке «Дерево» этой проблемы нет: скролл внутренний.

**Предлагаемое решение:** добавить `.object-list` те же свойства, что у `.ct-list`:

```css
.object-list {
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
```

плюс `::-webkit-scrollbar { width: 4px }` / `::-webkit-scrollbar-thumb` по образцу `.panel-left` ([`App.css:344-351`](../web-app/src/App.css)) — сейчасwebkit-стили заданы только для панелей. Если значение 240px хочется держать одним — вынести общий класс (например `.panel-scroll`) и повесить на `.ct-list` и `.object-list`, чтобы лимиты не разъезжались.

**Критерии готовности:** при >15 объектах вкладка «Список» скроллится внутри секции (секции «Палитра»/«История» остаются на месте), вид и толщина скроллбара совпадают с «Дерево».

---

## Предлагаемые приоритеты (черновик, к обсуждению)

1. 🔴 **P1 — UB5-1:** потеря токенов у платящего пользователя; решается гейтом в `buyRental` + статусом в UI + 4 тестами. Требует правки [`ECONOMY.md`](../ECONOMY.md) §3.2/§3.3 (явное «аренды входят в подписку, покупка при активной подписке недоступна»).
2. 🟡 **P2 — UB5-2:** одна строка в `App.css`; согласовать с UB3-2 (возможный возврат к горизонтальной раскладке кнопок) и зафиксировать ширину в [`AGENTS.md`](../AGENTS.md)/`ECONOMY.md` §6.4, чтобы не делать «маятник».
3. 🟢 **P3 — UB5-3:** 4 CSS-свойства, риск нулевой; полезно сделать вместе с UB5-2 одним коммитом «layout панелей».

**Что нужно уточнить у пользователя:** (а) UB5-1 — скрывать строки аренды целиком при Pro или показывать статус «Входит в Pro»; (б) UB5-1 — компенсировать ли уже купленные поверх подписки аренды; (в) UB5-2 — 240px безусловно или с ограничением `max-width` на узких окнах; (г) UB5-3 — лимит высоты 240px (как у «Дерево») или другой.

## Ход исправления (2026-09-29)

| # | Что сделано | Файлы |
|---|-------------|-------|
| UB5-1 | Гейт в начале `buyRental`: `state.hasActiveSubscriptionRO()` → `{ ok: false, code: 'included_in_subscription' }` — до `await getServerTime()` и до `set()`, списания нет; RO-геттер (без мутаций, expiry по серверному времени, P0-2). Комментарий со ссылкой на [`ECONOMY.md`](../ECONOMY.md) §3.3 | [`economy-store.ts:1244-1248`](../web-app/src/store/economy-store.ts) (`buyRental`) |
| UB5-1 | В `rentalsSection` добавлена ветка `hasActiveSub`: вместо колонок кнопок «токены/ревард» рендерится статус «Входит в Pro» (`economy.status.includedInPro`). Строки не скрыты — пользователь видит, что входит в Pro | [`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx) (`rentalsSection`) |
| UB5-1 | Новые ключи `economy.status.includedInPro`: ru «Входит в Pro», en "Included in Pro" | [`ru/translation.json`](../web-app/src/i18n/locales/ru/translation.json), [`en/translation.json`](../web-app/src/i18n/locales/en/translation.json) |
| UB5-1 | Явно зафиксировано в спеке: аренды не покупаются поверх активной подписки | [`ECONOMY.md`](../ECONOMY.md) §3.2 |
| UB5-1 | Тесты: +4 в store-наборе (`extendedPalette`/`text3d`+`disableBanner`+баннер не скрыт/`hideBannerAdv` не вызван → баланс и `rentals` не изменены; истёкшая подписка НЕ блокирует; без подписки покупка проходит — регрессия UB4-1) и +2 UI-теста в наборе панели («Included in Pro» + нет кнопок с ценой 75/50; без подписки все 3 кнопки на месте) | [`economy-store.test.ts`](../web-app/src/store/economy-store.test.ts), [`PropertiesPanel.color.test.tsx`](../web-app/src/components/PropertiesPanel.color.test.tsx) |
| UB5-2 | `.panel-right { width: 240px }` (было 200px; ×1,2 по запросу) | [`App.css:772-782`](../web-app/src/App.css) |
| UB5-3 | `.object-list` получили `max-height: 240px` + `overflow-y: auto` + `scrollbar-width: thin` + `scrollbar-color: var(--border) transparent` — внутренний скролл как у `.ct-list` | [`App.css:459-469`](../web-app/src/App.css) |
| — | Попутно: тесту `doodle-io.test.ts` «открывает model.json больше прежнего лимита 5 МБ» выставлен явный `timeout` 30 000 мс — фикстура на 100k треугольников стабильно выходила за дефолтные 5000 мс на медленных прогонах (наблюдалось с 2026-09-28) | [`doodle-io.test.ts:208`](../web-app/src/io/doodle-io.test.ts) |

**Не делалось (осознанно):** компенсация уже купленных поверх подписки аренд (пункт (б) вопросов к пользователю) — нужен продукт-дизайн возврата; возврат к горизонтальной раскладке кнопок «токены/ревард» при 240px (пункт UB3-2) — оставлено как есть, правка не запрошена.

**Проверка (2026-09-29):** `pnpm verify` — `typecheck` 0 ошибок, `test` **420/420 (27 файлов)**, `build` и `build:yandex` успешны.

## Чек-лист закрытия

- [x] UB5-1 — гейт `included_in_subscription` в `buyRental`, статус в `rentalsSection`, i18n ru/en
- [x] UB5-1 — тесты: покупка при активной подписке → `ok:false`, баланс и `rentals` не изменены (3 ключа), регрессия «без подписки покупка проходит»
- [x] UB5-1 — [`ECONOMY.md`](../ECONOMY.md) §3.2/§3.3: явно зафиксировано, что аренды не покупаются поверх подписки
- [x] UB5-2 — `.panel-right` 240px (`max-width`/брейкпоинт не заводился: @media-правил в `App.css` нет, панель и так `flex-shrink: 0`)
- [x] UB5-3 — `.object-list`: `max-height` + `overflow-y: auto` + тонкий скроллбар как у `.ct-list`
- [x] `pnpm verify` — typecheck 0 ошибок, 420/420 тестов, `build` + `build:yandex` успешны
- [x] Записи в [`CHANGELOG.md`](../CHANGELOG.md), статусы в [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) (таблица «Известные проблемы»), ссылка в [`AGENTS.md`](../AGENTS.md)

---

**Связанные материалы:** [`docs/USER_FEEDBACK_UB4.md`](USER_FEEDBACK_UB4.md) (закрыт 2026-09-27 — UB4-1/UB4-2 про платформенный баннер), [`docs/USER_FEEDBACK_UB3.md`](USER_FEEDBACK_UB3.md) (открыт — UB3-2 про ширину панели и иконки), [`docs/USER_FEEDBACK_ECONOMY.md`](USER_FEEDBACK_ECONOMY.md), [`ECONOMY.md`](../ECONOMY.md), [`CHANGELOG.md`](../CHANGELOG.md) → `[Unreleased]`, [`docs/PRE_COMMIT_CHECKLIST.md`](PRE_COMMIT_CHECKLIST.md)
