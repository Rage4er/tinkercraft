// ============================================================
// text-object — 3D-текст как объект сцены (UX-AUDIT-31)
// ============================================================
//
// Меш текста добавляется импортом (`addRawMesh` → шаг `import_mesh`, объект `import_mesh`), поэтому
// в истории он был «Импорт Текст: Привет» с иконкой импорта, в свойствах — «Тип: Импорт». Теперь у
// шага и объекта есть исходная строка (`text`): история — «Добавить текст: Привет», иконка текста,
// фильтр «Добавить»; свойства — «Тип: Текст». Старые проекты (поля нет): текст узнаётся по id
// `txt_N` — `addRawMesh` всегда давал тексту такой id, — строка — из имени «Текст: …» / «Text: …».

import type { ImportMeshOperation, SceneObject } from '../csg/types'
import i18n from '../i18n'

const LEGACY_TEXT_ID = /^txt_\d+$/

/** Строка текста из имени объекта «Текст: Привет» / «Text: Hi» (шаблон `textModal.objectName` ru/en). */
export function textFromName(name: string | undefined): string {
  if (!name) return ''
  for (const lng of ['ru', 'en']) {
    const tpl = i18n.getResource(lng, 'translation', 'textModal.objectName')
    const prefix = typeof tpl === 'string' ? tpl.split('{{text}}')[0] : ''
    if (prefix && name.startsWith(prefix)) return name.slice(prefix.length)
  }
  return name
}

/** Исходная строка 3D-текста шага импорта; не текст (STL) — undefined. */
export function textOfOp(op: Pick<ImportMeshOperation, 'id' | 'name' | 'text'>): string | undefined {
  if (op.text !== undefined) return op.text
  if (LEGACY_TEXT_ID.test(op.id)) return textFromName(op.name)
  return undefined
}

/** Объект — 3D-текст (а не импортированный STL). */
export function isTextObject(obj: Pick<SceneObject, 'id' | 'shapeType' | 'text'>): boolean {
  return obj.shapeType === 'import_mesh' && (obj.text !== undefined || LEGACY_TEXT_ID.test(obj.id))
}
