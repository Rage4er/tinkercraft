// ============================================================
// legacy-text3d — 3D-текст старых проектов yandex-games (yandex-only)
// ============================================================
//
// До v1.4.0 ветка yandex-games добавляла 3D-текст отдельным шагом `text3d` (объект `text3d`).
// С merge main (v1.4.0) текст — как в main: шаг `import_mesh` с исходной строкой `text`
// (UX-AUDIT-31: история «Добавить текст: …», «Тип: Текст»; замкнутый меш участвует в CSG).
// Автосейвы, проекты IndexedDB, .doodle и .3dtc игроков могут содержать `text3d` — при загрузке
// шаг переводится в `import_mesh` с той же геометрией, id (`txt_N`), именем, цветом и трансформом;
// `text` — из имени «Текст: …». Объекты после миграции пересобираются из истории (`changed`).
// Меш старого текста не сшит (как у текста main до fix-all) — в CSG не участвует: воркер
// отвечает уведомлением errors.csgNonManifold, текст нужно пересоздать.
// Чистая функция: вход не мутируется; без шагов `text3d` возвращается тот же массив.
// ============================================================

import type { ImportMeshOperation, TinkerCraftOperation, TransformNR } from '../csg/types'
import { textFromName } from '../store/text-object'

/** Шаг 3D-текста yandex-games до v1.4.0 (в типах истории больше нет). */
export interface LegacyText3DOperation {
  type: 'text3d'
  id: string
  name: string
  color: string
  transform: TransformNR
  vertices: number[] | Float32Array
  indices: number[] | Uint32Array
}

export interface LegacyText3dMigration {
  operations: TinkerCraftOperation[]
  /** Были ли шаги text3d (объекты надо пересобрать из истории) */
  changed: boolean
}

/** Шаг — старый `text3d` (во входных данных из файла / IndexedDB). */
export function isLegacyText3dOp(op: unknown): op is LegacyText3DOperation {
  return !!op && typeof op === 'object' && (op as { type?: unknown }).type === 'text3d'
}

const toArray = (a: number[] | Float32Array | Uint32Array | undefined): number[] =>
  a === undefined ? [] : Array.isArray(a) ? a : Array.from(a)

/** `text3d` → `import_mesh` с текстом; остальные шаги — как есть. */
export function migrateLegacyText3d(ops: readonly TinkerCraftOperation[]): LegacyText3dMigration {
  const raw = ops as readonly unknown[]
  if (!raw.some(isLegacyText3dOp)) return { operations: ops as TinkerCraftOperation[], changed: false }
  const operations = raw.map((op): TinkerCraftOperation => {
    if (!isLegacyText3dOp(op)) return op as TinkerCraftOperation
    const out: ImportMeshOperation = {
      type: 'import_mesh',
      id: op.id,
      name: op.name,
      color: op.color,
      transform: { ...op.transform },
      vertices: toArray(op.vertices),
      indices: toArray(op.indices),
      text: textFromName(op.name),
    }
    return out
  })
  return { operations, changed: true }
}
