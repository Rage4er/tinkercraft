// ============================================================
// add-svg — SVG-EXTRUDE: тело из SVG-контура в сцену
// ============================================================
//
// Пайплайн как у 3D-текста (`store/add-text.ts`): меш (`io/svg-extrude.ts`) → объект `import_mesh`
// через `addRawMesh` — история, undo/redo, Build Tree (baked), CSG — всё как у импорта STL.
// Имя — «SVG: <файл>». Ошибка построения → уведомление, модалка остаётся открытой.

import { buildSvgMesh, svgErrorMessage, type SvgExtrudeOptions } from '../io/svg-extrude'
import { useDocumentStore } from './document-store'
import { notify } from './notifications'
import i18n from '../i18n'

/**
 * Создать 3D-тело из SVG: контур (2D) → глубина/масштаб → `import_mesh`.
 * true — объект добавлен (модалку можно закрыть). `build` — подмена построителя для тестов.
 */
export async function addSvgObject(
  svgText: string,
  fileName: string,
  opts: SvgExtrudeOptions,
  build: (svgText: string, opts: SvgExtrudeOptions) => Promise<{ vertices: number[]; indices: number[] }> = buildSvgMesh,
): Promise<boolean> {
  let mesh: { vertices: number[]; indices: number[] }
  try {
    mesh = await build(svgText, opts)
  } catch (e) {
    console.warn('addSvgObject:', e)   // ошибка обработана — уведомление ниже
    notify(i18n.t('errors.svgFailed', { reason: svgErrorMessage(e) }), 'error')
    return false
  }
  const store = useDocumentStore.getState()
  const before = Object.keys(store.objects).length
  // ошибки построения в воркере addRawMesh сообщает сам (errors.importMeshFailed)
  await store.addRawMesh(i18n.t('svgModal.objectName', { name: fileName }), mesh.vertices, mesh.indices, undefined, 'svg')
  return Object.keys(useDocumentStore.getState().objects).length > before
}
