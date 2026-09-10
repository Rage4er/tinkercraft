# 🔍 Код-ревью внедрения экономики (ECONOMY.md)

**Дата ревью:** 2026-09-10
**Объект ревью:** спецификация [`ECONOMY.md`](../ECONOMY.md) ↔ фактическая реализация
**Затрагиваемые модули:** [`economy-store.ts`](../web-app/src/store/economy-store.ts), [`economy-config.ts`](../web-app/src/store/economy-config.ts), [`economy-ui-config.ts`](../web-app/src/store/economy-ui-config.ts), компоненты `Economy*`/`QuestPanel`, [`platform/*`](../web-app/src/platform/index.ts), точки интеграции ([`App.tsx`](../web-app/src/App.tsx), [`Toolbar.tsx`](../web-app/src/components/Toolbar.tsx), [`PropertiesPanel.tsx`](../web-app/src/components/PropertiesPanel.tsx), [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx))
**Статус:** 🔴 ОТКРЫТ — ожидает исправлений
**Готовность к релизу:** ❌ Экономика не готова к релизу без закрытия всех P0.

> Связанные материалы: [`CODE_REVIEW.md`](../CODE_REVIEW.md) (статусы E1–E7, EC1–EC18), [`CHANGELOG.md`](../CHANGELOG.md), [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md).

---

## Резюме

Найдено **22 проблемы**: **6 критичных (P0)**, **9 важных (P1)**, **7 незначительных (P2)**.

| Приоритет | Кол-во | Готовность |
|-----------|--------|------------|
| 🔴 P0 (критично) | 6 | ❌ блокируют релиз (фрод, потеря начислений, рассинхрон облака) |
| 🟡 P1 (средне) | 9 | ⚠️ требуют доработки до выпуска |
| 🟢 P2 (низко) | 7 | 📝 техдолг / UX-мелочи |

**Оценка готовности:** экономика **не готова к релизу** — 6 P0-проблем делают невозможным честный анти-фарм (P0-1, P0-5, P0-6), корректный срок действия покупок (P0-2) и надёжную синхронизацию с облаком (P0-3, P0-4).

---

## 🔴 P0 — Критичные проблемы

| # | Проблема | Файлы / строки | Рекомендация |
|---|----------|----------------|--------------|
| P0-1 | **Анти-фарм кэшбэка не работает.** `calculateAndClaimCashback()` не принимает хэш модели и не проверяет его; `lastExportHash` устанавливается после начисления; повторный экспорт той же модели (undo/redo, закрытие вкладки, очистка localStorage) даёт повторный кэшбэк | [`economy-store.ts`](../web-app/src/store/economy-store.ts:1052), [`document-store.ts`](../web-app/src/store/document-store.ts:1047) | Передавать хэш модели в `calculateAndClaimCashback()` и проверять его **до** начисления; устанавливать `lastExportHash` атомарно вместе с начислением; исключить повторное начисление для одинакового хэша (§5) |
| P0-2 | **Expiry аренд/подписок и кулдауны по локальному `Date.now()`** вместо серверного времени (спецификация §5 требует абсолютные timestamp по серверному времени). Перевод часов продлевает аренду/подписку | [`economy-store.ts`](../web-app/src/store/economy-store.ts:478), (488), (518), (529), (537) | Все timestamp expiry/кулдаунов вычислять от `getServerTime()` (кэш 30с); хранить абсолютные метки; не доверять локальным часам |
| P0-3 | **`syncToCloud` теряет обновления.** При `pendingSync=true` повторные вызовы сразу возвращаются, данные не запоминаются; падение синхронизации = потерянные начисления | [`economy-store.ts`](../web-app/src/store/economy-store.ts:789) | Реализовать очередь/«последний pending snapshot»: при повторном вызове во время активной синхронизации запоминать актуальные данные и синхронизировать их после завершения; добавлять retry при ошибке |
| P0-4 | **`lastSavedData` не в `partialize`.** После перезагрузки облако может быть перезаписано более старыми локальными данными; `loadFromCloud` не восстанавливает `lastSavedData` | [`economy-store.ts`](../web-app/src/store/economy-store.ts:841) | Включить `lastSavedData` в `partialize`; восстанавливать его в `loadFromCloud`; при конфликте версий облако > локальное |
| P0-5 | **Вся экономика client-side.** Правка localStorage в DevTools даёт неограниченные токены/подписки; `syncToCloud` без валидации | [`economy-store.ts`](../web-app/src/store/economy-store.ts:244) | Серверная/облачная валидация начислений и лимитов; подпись/не-доверенный клиентский стейт; хотя бы минимальная проверка целостности при загрузке |
| P0-6 | **Clean-фолбэк SDK противоречит спецификации.** При падении `yandex.init()` экономика остаётся активной (`getPlatform() !== null`), но заработок невозможен | [`platform/index.ts`](../web-app/src/platform/index.ts:10), [`platform/yandex.ts`](../web-app/src/platform/yandex.ts:29) | При фолбэке в clean-режим полностью отключать экономику (§7): `getPlatform()` → null, UI-блокировки не показывать, тарифы не применять |

---

## 🟡 P1 — Важные проблемы

| # | Проблема | Файлы / строки | Рекомендация |
|---|----------|----------------|--------------|
| P1-1 | `todayCashbacks` сбрасывается только в `initDailyQuests()` при старте → без перезагрузки лимит 3/день не восстанавливается | [`economy-store.ts`](../web-app/src/store/economy-store.ts:456), (638) | Сброс лимита кэшбэков по смене суток (по серверному времени), не только при инициализации |
| P1-2 | `objectCount` считается по-разному: `exportStl` исключает `import_mesh`/`text3d`, `scanForCashback`/`evaluateQuests` считают все → квест «экспорт ≥10» не засчитывается | [`economy-store.ts`](../web-app/src/store/economy-store.ts:121), [`document-store.ts`](../web-app/src/store/document-store.ts:1044) | Единый подсчёт `objectCount` через общий сканер для экспорта, кэшбэка и квестов |
| P1-3 | Хэш кэшбэка не включает `operations` → изменение CSG-структуры без изменения params даёт тот же хэш | [`document-store.ts`](../web-app/src/store/document-store.ts:1047) | Включать историю операций/CSG-дерево в `createExportHash()` |
| P1-4 | [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx:69) использует мутирующий `hasActiveSubscription()` в render-фазе | [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx:69) | Использовать read-only `hasActiveSubscriptionRO()` в селекторах/render |
| P1-5 | Проверка доступа к 3D-тексту дублируется в 4 местах с разной логикой | [`App.tsx`](../web-app/src/App.tsx:441), (678), [`LeftPanel.tsx`](../web-app/src/components/LeftPanel.tsx), [`Toolbar.tsx`](../web-app/src/components/Toolbar.tsx) | Вынести единый хелпер доступа (аренда `text3d` или подписка) и использовать во всех 4 местах |
| P1-6 | `watchAdsForImport(2)` — отказ второй рекламы → первая показана, но токены не начислены | [`economy-store.ts`](../web-app/src/store/economy-store.ts:374) | Начислять токены за каждый успешно просмотренный ролик независимо от последующих; при отказе — частичный зачёт |
| P1-7 | `watchAdForBanner` не учитывает лимит 3/день и не тратит `todayAdsWatched` | [`economy-store.ts`](../web-app/src/store/economy-store.ts:396) | Учитывать общий лимит rewarded-рекламы 3/день и увеличивать `todayAdsWatched` |
| P1-8 | `EconomyMiniHUD` считает кулдаун/бонус по `Date.now()` — рассинхрон с PropertiesPanel | [`EconomyMiniHUD.tsx`](../web-app/src/components/EconomyMiniHUD.tsx:27), (35) | Единый источник времени (серверное время/кэш) в обоих компонентах |
| P1-9 | `csg_complex` считается только для `group` с `ids.length>=2`, не учитываются `subtract`/`intersect` | [`economy-store.ts`](../web-app/src/store/economy-store.ts:735) | Считать CSG-сложность для всех типов булевых операций (union/subtract/intersect) |

---

## 🟢 P2 — Незначительные проблемы

| # | Проблема | Файлы / строки | Рекомендация |
|---|----------|----------------|--------------|
| P2-1 | `isDayPassed` фолбэчит на `Date.now()` в clean-режиме | [`economy-config.ts`](../web-app/src/store/economy-config.ts:108) | Явный серверный источник времени даже в clean-режиме или документированное отклонение |
| P2-2 | `serverTime = lastAdTimestamp ?? Date.now()` | [`economy-store.ts`](../web-app/src/store/economy-store.ts:373) | Использовать `getServerTime()` напрямую, `lastAdTimestamp` — только как fallback |
| P2-3 | Флаг онбординга сохраняется напрямую в `platform.saveData` минуя store | [`EconomyOnboarding.tsx`](../web-app/src/components/EconomyOnboarding.tsx:86) | Сохранять флаг через action store (persist + облако единообразно) |
| P2-4 | Онбординг рендерится в clean-режиме | [`App.tsx`](../web-app/src/App.tsx:565) | Не рендерить `EconomyOnboarding` при `getPlatform() === null` |
| P2-5 | Событийные квесты `export_stl`/`import_stl` показывают прогресс «0/1» даже после выполнения | [`economy-store.ts`](../web-app/src/store/economy-store.ts:744) | Обновлять прогресс событийных квестов сразу после триггера |
| P2-6 | Кэшбэк начисляется синхронно до фактического успеха экспорта | [`economy-store.ts`](../web-app/src/store/economy-store.ts:465) | Начислять кэшбэк после подтверждённого успеха экспорта |
| P2-7 | Устаревший `calculateCashback` v1 `@deprecated` не удалён | [`economy-config.ts`](../web-app/src/store/economy-config.ts:219) | Удалить мёртвый код v1, оставить единую формулу V2 |

---

## Расхождения «спецификация ↔ код»

### Совпадают ✅

| Пункт ECONOMY.md | Значение |
|------------------|----------|
| Экспорт STL | 50 токенов |
| Импорт STL | 100 токенов |
| Аренда текст/палитра | 75 токенов |
| Баннер off | 50 токенов |
| Подписки | 700/7 дней, 2000/30 дней |
| Ежедневный бонус | +50 |
| Реклама | +50, ≤3/день, кулдаун 5 мин |
| Действия | +1, ≤30/день, кулдаун 5 с |
| Кэшбэк | 1–25, ≤3/день |

### Расхождения ❌

| Пункт ECONOMY.md | Требование спецификации | Фактическая реализация |
|-------------------|--------------------------|-------------------------|
| `maxPerDay = 405` | декларирован максимум заработка/день | **не enforce** — лимит нигде не проверяется |
| `realisticPerDay = 240` | реалистичный дневной доход | **не используется** |
| IAP 10 TC = 1 ян (фаза B) | покупка внутри приложения | **отсутствует** в конфиге |
| Expiry аренд/подписок | по серверному времени (§5) | по **локальному времени** (`Date.now()`) |
| Анти-фарм (§5) | хэш модели, защита от повторного кэшбэка | реализован **частично** (см. P0-1) |
| Clean-режим (§7) | экономика полностью отключена | **не отключает** экономику полностью (см. P0-6) |

---

## 🚨 Риски фрода

1. **Правка localStorage** → бесконечные токены/подписки (P0-5).
2. **Перевод часов** → продление подписок/аренды (P0-2).
3. **Повторный кэшбэк за ту же модель** — очистка localStorage / undo/redo (P0-1).
4. **Перезагрузка страницы для сброса лимитов** + манипуляция `lastQuestResetDate`.
5. **Обход оплаты через undo/redo** (P0-1, P1-3).
6. **Рассинхрон localStorage ↔ облако** при `pendingSync` (P0-3, P0-4).
7. **Clean-фолбэк SDK** — экономика «полуработает»: UI активен, заработок невозможен (P0-6).
8. **Реклама баннера без лимита** (P1-7).
9. **Импорт за 1 рекламу «бесплатно»** — отказ второй рекламы, первая засчитана (P1-6).

---

## ✅ Что сделано хорошо

- **Единая формула кэшбэка** EC5 (`calculateCashbackV2`/`calculateCashbackBreakdown`) + **21 тест** в [`economy-config.test.ts`](../web-app/src/store/economy-config.test.ts)
- **RO-селекторы** EC8/EC11 (`hasActiveSubscriptionRO`, `hasRentalRO`) — предотвращение мутаций в render-фазе
- **Тосты** EC12 — подтверждение начисления кэшбэка через `notify`
- **Событийные квесты через `commitQuests`** (Y3.13, EC10) — зачёт при save/export
- **Серверное время для сброса суток** — кэш 30с в [`server-time.ts`](../web-app/src/platform/server-time.ts)
- **Debounce `syncToCloud`** (Y3.16) — защита от лимита 100 `setData`/5мин
- **Аккуратный UI**: баннер в 3 местах, состояния кнопок («Уже получено», кулдаун `M:SS`, «Лимит рекламы»), SVG-бейджи, полная i18n EN/RU
- **Хорошая документация**: таблицы E1–E7/EC1–EC18 в [`CODE_REVIEW.md`](../CODE_REVIEW.md), записи в [`CHANGELOG.md`](../CHANGELOG.md), конвенции в [`AGENTS.md`](../AGENTS.md)

---

## 📋 Чек-лист закрытия проблем

### 🔴 P0

- [ ] **P0-1** Анти-фарм кэшбэка: хэш модели проверяется до начисления, `lastExportHash` устанавливается атомарно
- [ ] **P0-2** Expiry аренд/подписок и кулдауны — только по серверному времени (§5)
- [ ] **P0-3** `syncToCloud` не теряет обновления при `pendingSync` и падениях
- [ ] **P0-4** `lastSavedData` в `partialize`, восстановление в `loadFromCloud`
- [ ] **P0-5** Валидация экономики на стороне облака/сервера, клиентский стейт не доверенный
- [ ] **P0-6** Clean-фолбэк SDK полностью отключает экономику (§7)

### 🟡 P1

- [ ] **P1-1** Сброс `todayCashbacks` по смене суток (не только при старте)
- [ ] **P1-2** Единый `objectCount` для экспорта/кэшбэка/квестов
- [ ] **P1-3** Хэш кэшбэка включает CSG-операции
- [ ] **P1-4** `LeftPanel.tsx` использует read-only селекторы в render
- [ ] **P1-5** Единый хелпер доступа к 3D-тексту во всех 4 местах
- [ ] **P1-6** `watchAdsForImport` начисляет токены за каждый просмотренный ролик
- [ ] **P1-7** `watchAdForBanner` учитывает лимит 3/день и `todayAdsWatched`
- [ ] **P1-8** `EconomyMiniHUD` и PropertiesPanel используют единый источник времени
- [ ] **P1-9** `csg_complex` учитывает subtract/intersect

### 🟢 P2

- [ ] **P2-1** `isDayPassed` — явный серверный источник времени
- [ ] **P2-2** `serverTime` от `getServerTime()`, а не `lastAdTimestamp`
- [ ] **P2-3** Флаг онбординга сохраняется через store
- [ ] **P2-4** Онбординг не рендерится в clean-режиме
- [ ] **P2-5** Прогресс событийных квестов обновляется после триггера
- [ ] **P2-6** Кэшбэк начисляется после успеха экспорта
- [ ] **P2-7** Удалён устаревший `calculateCashback` v1

### 📐 Расхождения спецификации

- [ ] `maxPerDay = 405` — enforce или документировать
- [ ] `realisticPerDay = 240` — использовать или удалить из спецификации
- [ ] IAP 10 TC = 1 ян (фаза B) — добавить в конфиг или отложить явно
- [ ] Анти-фарм §5 — довести до полной реализации
- [ ] Clean-режим §7 — полное отключение экономики
