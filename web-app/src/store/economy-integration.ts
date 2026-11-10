// src/store/economy-integration.ts — экономические врезки document-store (yandex-only)
//
// Y.3 (рефакторинг yandex-games): вынесено из document-store.ts, чтобы merge
// main → yandex-games не конфликтовал в ядре. Модуль НЕ подписывается ни на что
// и не регистрируется при импорте: document-store вызывает функции явно, в тех же
// местах и в том же порядке, что и до рефакторинга (поведение 1:1).
import type { SceneObject, TinkerCraftOperation } from '../csg/types'
import { useEconomyStore, createExportHash, scanForCashback } from './economy-store'
import { countSceneObjects } from './economy-config'
import type { ExportPaymentMethod } from './economy-types'
import { notify } from './notifications'
import i18n from '../i18n'

/** Обновить прогресс квестов V2 по состоянию сцены (после каждой мутации) */
export function evaluateQuestsAfterMutation(
  objects: Record<string, SceneObject>,
  operations: TinkerCraftOperation[],
): void {
  useEconomyStore.getState().evaluateQuests(objects, operations)
}

/** Y3.1: начисление токена за действие (лимит 30/день, кулдаун 5с, серверное время) */
export function earnActionToken(): void {
  void useEconomyStore.getState().earnActionToken()
}

/** Событийный квест «импорт STL» */
export function completeImportQuest(): void {
  useEconomyStore.getState().completeEventQuest('import_stl')
}

/** Квесты V2: коммит токенов при сохранении (save/saveDoodle/saveToProject) */
export function commitQuests(): Promise<void> {
  return useEconomyStore.getState().commitQuests()
}

/**
 * P1-3: облегчить операцию истории для хэша кэшбэка.
 * Убираем тяжёлые геометрические поля (vertices/indices/normals — мегабайты
 * на импортах/CSG), оставляя ВСЮ структуру операции: тип, ids, порядок
 * операндов, resultId, treeOperation, params, transform, цвет и т.д.
 * Геометрия детерминирована этими полями (либо их отсутствие меняет структуру
 * хэша незначительно — размер импорта proxy-ируется по числу вершин/индексов).
 */
export function stripHeavyFieldsForHash(op: TinkerCraftOperation): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(op)) {
    if (key === 'vertices' || key === 'indices' || key === 'normals') {
      // Число вершин/индексов — лёгкий proxy «формы» геометрии (детерминирован
      // от данных, но не раздувает JSON на сотни КБ)
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        out[key + 'Count'] = (value as { length?: number }).length ?? 0
      }
      continue
    }
    // Известные скалярные/структурные поля — включаем как есть
    out[key] = value
  }
  return out
}

/**
 * Экономическая часть успешного экспорта STL (вызывается ПОСЛЕ создания Blob —
 * P2-6: при падении сериализации кэшбэк не начисляется).
 *
 * P1-1/U8: method указывает, чем оплачен экспорт:
 *  - 'tokens' — кэшбэк УЖЕ учтён в цене модалки (netCost = 50 − кэшбэк),
 *    поэтому кэшбэк НЕ начисляется повторно (защита от задвоения,
 *    §2.1 ECONOMY.md «фактическая стоимость 31 💎»);
 *  - 'ad' — бесплатный просмотр рекламы, кэшбэк начисляется (мотивация строить
 *    сложные модели);
 *  - undefined — прямой вызов (clean-режим, экономики нет): кэшбэк НЕ начисляем,
 *    т.к. нет точки списания.
 * SUB-EXPORT-CASHBACK (особенность экономики, решение 2026-11-10): при активной подписке
 * ExportModal экспортирует сразу способом 'ad' — подписчик получает кэшбэк (анти-фарм по хэшу —
 * как у всех). Лояльно к игроку, оставлено намеренно (ECONOMY.md §3.3).
 *
 * ⚠️ ПОРЯДОК ВАЖЕН (не менять):
 *   хэш → calculateAndClaimCashback → setExportHash → download → тост →
 *   completeEventQuest(export_stl[_large]) → commitQuests.
 * calculateAndClaimCashback проверяет анти-фарм по lastExportHash/todayExportHashes,
 * поэтому setExportHash строго ПОСЛЕ него; события квестов — ДО commitQuests.
 *
 * @param download скачивание готового Blob (выполняется между фиксацией хэша и тостом)
 */
export function settleExport(
  ctx: {
    objects: Record<string, SceneObject>
    operations: TinkerCraftOperation[]
    method: ExportPaymentMethod | undefined
  },
  download: () => void,
): void {
  const { objects, operations, method } = ctx
  const objectList = Object.values(objects)
  const paidByTokens = method === 'tokens'
  const paidByAd = method === 'ad'
  // P1-2: единый подсчёт объектов — та же функция, что в scanForCashback/evaluateQuests.
  // import_mesh и text3d тоже экспортируются в STL (downloadStlBlob(objectList)), поэтому
  // считаются «объектами» для целей экспорта/квестов/кэшбэка (§2.1 ECONOMY.md).
  const objectCount = countSceneObjects(objects)

  // Y3.3: проверка хэша модели для кэшбэка.
  // P1-3: хэш включает ВСЮ структуру сцены — объекты (shapeType/params/transform)
  // и операции (историю CSG: группировка, порядок операндов, treeOperation,
  // перестановки). Изменение CSG-структуры без изменения params теперь даёт
  // другой хэш. Тяжёлые геометрии (vertices/indices) исключаются — они
  // детерминированы params/transform либо огромны, а для импортов их размер
  // учитывается как proxy. Хэш считается только здесь — при экспорте.
  const hash = createExportHash({
    objects: objectList.map(o => ({ shapeType: o.shapeType, params: o.params, transform: o.transform })),
    operations: operations.map(stripHeavyFieldsForHash),
  })
  const lastHash = useEconomyStore.getState().lastExportHash
  const hashChanged = lastHash === null || lastHash !== hash

  // Y3.2/Y2.0: кэшбэк V2 за экспорт (только если модель изменилась).
  // U8/P1-1: ЕДИНАЯ МОДЕЛЬ КЭШБЭКА — кэшбэк начисляется ТОЛЬКО при оплате
  // рекламой ('ad'); при 'tokens' он уже учтён в цене модалки.
  // P0-1: hash фиксируется ПРИ ЛЮБОМ успешном экспорте (анти-фарм — повторный
  // экспорт той же модели без изменений не даёт кэшбэк ни токенами, ни рекламой).
  if (hashChanged) {
    if (paidByAd) {
      const scan = scanForCashback(objects, operations)
      const cashback = useEconomyStore.getState().calculateAndClaimCashback(scan, hash)
      if (cashback > 0) {
        // EC12: тост о кэшбэке (рекламный путь — кэшбэк начислен после экспорта)
        notify(i18n.t('export.cashbackEarned', { cashback }), 'info')
      }
    }
    // Анти-фарм: фиксируем хэш модели в любом случае (E6: через action set —
    // попадает в persist и облако; атомарно добавляет в todayExportHashes).
    useEconomyStore.getState().setExportHash(hash)
  }

  download()
  // U8/P1-1: при оплате токенами кэшбэк уже заложен в цену модалки —
  // информируем пользователя, что повторного начисления не будет.
  if (paidByTokens) {
    notify(i18n.t('export.cashbackIncluded'), 'info')
  }
  // EC4: событийные квесты ДО коммита — прогресс должен обновиться до начисления токенов
  useEconomyStore.getState().completeEventQuest('export_stl', objectCount)
  if (objectCount >= 10) {
    useEconomyStore.getState().completeEventQuest('export_stl_large', objectCount)
  }
  // Квесты V2: коммит токенов при экспорте (после событийных триггеров)
  void useEconomyStore.getState().commitQuests()
}
