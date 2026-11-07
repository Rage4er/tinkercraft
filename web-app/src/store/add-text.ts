// ============================================================
// add-text — 3D-текст в сцену (UX-AUDIT-3/6/10)
// ============================================================
//
// Было в App.handleAddText: ошибка генерации уходила только в console.error — модалка
// оставалась открытой, пользователь не знал почему (UX-AUDIT-10). Теперь любая ошибка
// построения меша → уведомление «Не удалось создать текст: <причина>».

import { buildTextMesh, TextMeshError, type TextMesh, type TextMeshOptions } from '../io/text-mesh'
import { useDocumentStore } from './document-store'
import { notify } from './notifications'
import i18n from '../i18n'

/** Причина ошибки для уведомления: известная — переводом, прочая — сообщением ошибки. */
function reasonOf(e: unknown): string {
  if (e instanceof TextMeshError) return i18n.t(e.reasonKey)
  return e instanceof Error ? e.message : String(e)
}

/**
 * Добавить 3D-текст: меш (сварка вершин, UX-AUDIT-3) → объект «Текст: …» (UX-AUDIT-6).
 * Пустая строка → «Text». true — объект добавлен (модалку можно закрыть).
 * `build` — подмена построителя для тестов.
 */
export async function addTextObject(
  input: string,
  opts: TextMeshOptions,
  build: (text: string, opts: TextMeshOptions) => Promise<TextMesh> = buildTextMesh,
): Promise<boolean> {
  const text = input.trim() || 'Text'
  let mesh: TextMesh
  try {
    mesh = await build(text, opts)
  } catch (e) {
    console.warn('addTextObject:', e)   // ошибка обработана — уведомление ниже
    notify(i18n.t('errors.textFailed', { reason: reasonOf(e) }), 'error')
    return false
  }
  const store = useDocumentStore.getState()
  const before = Object.keys(store.objects).length
  // ошибки построения в воркере addRawMesh сообщает сам (errors.importMeshFailed)
  await store.addRawMesh(i18n.t('textModal.objectName', { text }), mesh.vertices, mesh.indices)
  return Object.keys(useDocumentStore.getState().objects).length > before
}
