// ============================================================
// project-file — «Открыть» проекта в yandex-games: .3dtc (как в main) и старые .doodle (yandex-only)
// ============================================================
//
// До v1.4.0 кнопки «Открыть» / «Сохранить» тулбара yandex-games работали с .doodle (только
// история, без объектов и без слоя размеров). С v1.4.0 — как в main: формат проекта .3dtc.
// Сохранения игроков в .doodle не теряются: при открытии такой файл КОНВЕРТИРУЕТСЯ в документ
// .3dtc — история из .doodle (в сторе — та же миграция, что у .3dtc: text3d, fillet), объекты
// пересобираются из неё, имя файла — «имя.3dtc»; «Сохранить» запишет .3dtc (с размерами).
// Диалог «Открыть» — `open3dtcFilePicker` (3dtc-io: принимает и .doodle).
// Определение формата: расширение .doodle; .zip / прочее — .3dtc, а если это не .3dtc, но .doodle
// разбирается, — .doodle (старый файл, переименованный в .zip).
// ============================================================

import { parse3dtc, type ThreeDtcDocument } from './3dtc-io'
import { parseDoodle } from './doodle-io'

export interface OpenedProjectFile extends ThreeDtcDocument {
  /** Файл был .doodle — объектов в нём нет (пересобрать из истории), документ не сохранён */
  fromDoodle: boolean
  /** Имя документа: .3dtc — как у файла; .doodle — «имя.3dtc» (так его запишет «Сохранить») */
  fileName: string
}

/** «Имя.doodle» → «Имя.3dtc» (остальные имена — без изменений) */
export function doodleToProjectName(name: string): string {
  return /\.doodle$/i.test(name) ? name.replace(/\.doodle$/i, '.3dtc') : name
}

/** Разобрать выбранный файл проекта: .3dtc как есть, .doodle — конвертация в документ .3dtc. */
export async function parseProjectFile(picked: { file: File; buffer: ArrayBuffer }): Promise<OpenedProjectFile> {
  const name = picked.file.name
  const fromDoodle = async (): Promise<OpenedProjectFile> => {
    const d = await parseDoodle(picked.buffer)
    return {
      objects: {}, operations: d.operations, operationsTrimmed: false, dimensions: [],
      fromDoodle: true, fileName: doodleToProjectName(name).replace(/\.zip$/i, '.3dtc'),
    }
  }
  if (/\.doodle$/i.test(name)) return fromDoodle()
  try {
    const doc = await parse3dtc(picked.buffer)
    return { ...doc, fromDoodle: false, fileName: name }
  } catch (e3dtc) {
    try { return await fromDoodle() } catch { throw e3dtc }   // не .doodle — ошибка .3dtc, как раньше
  }
}
