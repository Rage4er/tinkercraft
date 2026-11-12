// ============================================================
// mesh-formats.ts — экспорт OBJ / 3MF / glTF, импорт OBJ / 3MF (FORMATS-OBJ-3MF-GLTF)
// ============================================================
// Все форматы — из тех же мировых сеток, что STL (`worldMeshes`: видимые объекты, world = R·S·v + pos,
// мм). Экспорт:
//   • OBJ  — текст: `o` на объект, `v` (мм), `f` (треугольники, индексы с 1);
//   • 3MF  — ZIP + XML (3D Manufacturing Format, unit = millimeter): объект на объект сцены,
//            цвета — basematerials (displaycolor) — для слайсеров;
//   • glTF — JSON с буфером внутри (`GLTFExporter`): Z-вверх → Y-вверх, мм → метры (корневой узел),
//            цвет — материал.
// Импорт — один меш `import_mesh`, как STL: OBJ (v / f, многоугольники — веером, индексы v/vt/vn
// и отрицательные), 3MF (сетки объектов + трансформы build-элементов). Лимиты — как у STL.

import * as THREE from 'three'
import JSZip from 'jszip'
import type { SceneObject, TransformNR } from '../csg/types'
import { applyTransformToVertices, MAX_TRIANGLES, StlTooLargeError } from './stl-export'
import { MAX_STL_FILE_SIZE, MAX_STL_TRIANGLES, type StlParseResult } from './stl-import'
import i18n from '../i18n'

export type ExportFormat = 'stl' | 'obj' | '3mf' | 'gltf'
export const EXPORT_FORMATS: readonly ExportFormat[] = ['stl', 'obj', '3mf', 'gltf']
export const FORMAT_EXT: Record<ExportFormat, string> = { stl: '.stl', obj: '.obj', '3mf': '.3mf', gltf: '.gltf' }
/** Что принимает «Импорт» */
export const IMPORT_ACCEPT = '.stl,.obj,.3mf'

export interface WorldMesh { name: string; color: string; vertices: Float32Array; indices: Uint32Array }

const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

/** Видимые объекты в мировых координатах (как STL); сцена сверх лимита — StlTooLargeError */
export function worldMeshes(objects: SceneObject[], maxTriangles = MAX_TRIANGLES): WorldMesh[] {
  const visible = objects.filter((o) => o.visible && o.indices.length >= 3)
  const tris = visible.reduce((n, o) => n + o.indices.length / 3, 0)
  if (tris > maxTriangles) throw new StlTooLargeError(tris, maxTriangles)
  return visible.map((o) => ({
    name: o.name ?? o.id,
    color: o.color,
    vertices: applyTransformToVertices(o.vertices, o.transform ?? IDENTITY),
    indices: o.indices instanceof Uint32Array ? o.indices : new Uint32Array(o.indices),
  }))
}

const num = (v: number) => { const s = (Math.round(v * 1e6) / 1e6 + 0).toString(); return s }
const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string))
const objName = (s: string) => s.replace(/\s+/g, '_') || 'object'

// ── OBJ ─────────────────────────────────────────────────────────────

/** OBJ-текст: объект на объект сцены, вершины — мм */
export function objText(meshes: WorldMesh[]): string {
  const out: string[] = ['# TinkerCraft Web — OBJ (units: mm)']
  let base = 1
  for (const m of meshes) {
    out.push(`o ${objName(m.name)}`)
    for (let i = 0; i < m.vertices.length; i += 3) out.push(`v ${num(m.vertices[i])} ${num(m.vertices[i + 1])} ${num(m.vertices[i + 2])}`)
    for (let i = 0; i < m.indices.length; i += 3) out.push(`f ${m.indices[i] + base} ${m.indices[i + 1] + base} ${m.indices[i + 2] + base}`)
    base += m.vertices.length / 3
  }
  return out.join('\n') + '\n'
}
export function exportToObj(objects: SceneObject[]): Blob {
  return new Blob([objText(worldMeshes(objects))], { type: 'text/plain' })
}

// ── 3MF ─────────────────────────────────────────────────────────────

const NS_CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'

/** XML модели 3MF (3D/3dmodel.model): материалы-цвета, объекты, build */
export function threeMfModelXml(meshes: WorldMesh[]): string {
  const colors = meshes.map((m) => `<base name="${xmlEscape(m.name)}" displaycolor="${/^#[0-9a-f]{6}$/i.test(m.color) ? m.color.toUpperCase() : '#808080'}FF"/>`)
  const objs = meshes.map((m, k) => {
    const vs: string[] = []
    for (let i = 0; i < m.vertices.length; i += 3) vs.push(`<vertex x="${num(m.vertices[i])}" y="${num(m.vertices[i + 1])}" z="${num(m.vertices[i + 2])}"/>`)
    const ts: string[] = []
    for (let i = 0; i < m.indices.length; i += 3) ts.push(`<triangle v1="${m.indices[i]}" v2="${m.indices[i + 1]}" v3="${m.indices[i + 2]}"/>`)
    return `<object id="${k + 2}" type="model" name="${xmlEscape(m.name)}" pid="1" pindex="${k}"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`
  })
  const items = meshes.map((_, k) => `<item objectid="${k + 2}"/>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="${NS_CORE}"><metadata name="Application">TinkerCraft Web</metadata><resources><basematerials id="1">${colors.join('')}</basematerials>${objs.join('')}</resources><build>${items.join('')}</build></model>`
}
export async function exportTo3mf(objects: SceneObject[]): Promise<Blob> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('_rels/.rels', RELS)
  zip.file('3D/3dmodel.model', threeMfModelXml(worldMeshes(objects)))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml', compression: 'DEFLATE' })
}

// ── glTF ────────────────────────────────────────────────────────────

/** Сцена Three.js для glTF: корень — Z-вверх → Y-вверх и мм → м; меш на объект, цвет — материал */
export function gltfScene(meshes: WorldMesh[]): THREE.Scene {
  const scene = new THREE.Scene()
  const root = new THREE.Group()
  root.name = 'TinkerCraft'
  root.rotation.x = -Math.PI / 2
  root.scale.setScalar(0.001)
  for (const m of meshes) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(m.vertices, 3))
    g.setIndex(new THREE.BufferAttribute(m.indices, 1))
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(m.color), name: m.name }))
    mesh.name = m.name
    root.add(mesh)
  }
  scene.add(root)
  return scene
}
export async function exportToGltf(objects: SceneObject[]): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const json = await new GLTFExporter().parseAsync(gltfScene(worldMeshes(objects)), { binary: false })
  return new Blob([JSON.stringify(json)], { type: 'model/gltf+json' })
}

/** Экспорт сцены в формат (не STL — STL пишет `exportToStl`) */
export async function exportToFormat(objects: SceneObject[], format: Exclude<ExportFormat, 'stl'>): Promise<Blob> {
  if (format === 'obj') return exportToObj(objects)
  if (format === '3mf') return exportTo3mf(objects)
  return exportToGltf(objects)
}

// ── Импорт ──────────────────────────────────────────────────────────

type MeshResult = StlParseResult
const ok = (vertices: number[], indices: number[], name: string): MeshResult => {
  if (indices.length < 3 || vertices.length < 9) return { success: false, error: i18n.t('errors.meshEmpty') }
  if (indices.length / 3 > MAX_STL_TRIANGLES) return { success: false, error: i18n.t('errors.stlTooManyTris', { count: (indices.length / 3).toLocaleString(), max: MAX_STL_TRIANGLES.toLocaleString() }) }
  return { success: true, vertices: new Float32Array(vertices), indices: new Uint32Array(indices), transform: { ...IDENTITY }, name }
}

/** OBJ-текст → один меш: v, f (многоугольник — веером; «v/vt/vn», отрицательные индексы) */
export function parseObjText(text: string, name: string): MeshResult {
  const vertices: number[] = []
  const indices: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('v ')) {
      const p = line.slice(2).trim().split(/\s+/).map(Number)
      if (p.length < 3 || p.slice(0, 3).some((x) => !Number.isFinite(x))) return { success: false, error: i18n.t('errors.objBadLine', { line: line.slice(0, 40) }) }
      vertices.push(p[0], p[1], p[2])
    } else if (line.startsWith('f ')) {
      const n = vertices.length / 3
      const ids = line.slice(2).trim().split(/\s+/).map((tok) => { const i = parseInt(tok.split('/')[0], 10); return i < 0 ? n + i : i - 1 })
      if (ids.length < 3 || ids.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) return { success: false, error: i18n.t('errors.objBadLine', { line: line.slice(0, 40) }) }
      for (let k = 1; k + 1 < ids.length; k++) indices.push(ids[0], ids[k], ids[k + 1])
    }
  }
  return ok(vertices, indices, name)
}

/** 3MF: сетки объектов + трансформы элементов build (3×4, «m00 m01 m02 m10 … m32») → один меш */
export async function parse3mf(buffer: ArrayBuffer, name: string): Promise<MeshResult> {
  let zip: JSZip
  try { zip = await JSZip.loadAsync(buffer) } catch { return { success: false, error: i18n.t('errors.threeMfBad') } }
  const modelFile = Object.values(zip.files).find((f) => !f.dir && /\.model$/i.test(f.name))
  if (!modelFile) return { success: false, error: i18n.t('errors.threeMfBad') }
  const doc = new DOMParser().parseFromString(await modelFile.async('string'), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return { success: false, error: i18n.t('errors.threeMfBad') }
  const scale = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }[doc.documentElement.getAttribute('unit') ?? 'millimeter'] ?? 1
  const meshes = new Map<string, { v: number[]; t: number[] }>()
  for (const o of Array.from(doc.getElementsByTagNameNS('*', 'object'))) {
    const mesh = o.getElementsByTagNameNS('*', 'mesh')[0]
    if (!mesh) continue
    const v: number[] = []
    for (const e of Array.from(mesh.getElementsByTagNameNS('*', 'vertex'))) v.push(+e.getAttribute('x')!, +e.getAttribute('y')!, +e.getAttribute('z')!)
    const t: number[] = []
    for (const e of Array.from(mesh.getElementsByTagNameNS('*', 'triangle'))) t.push(+e.getAttribute('v1')!, +e.getAttribute('v2')!, +e.getAttribute('v3')!)
    meshes.set(o.getAttribute('id') ?? '', { v, t })
  }
  const items = Array.from(doc.getElementsByTagNameNS('*', 'item'))
  const vertices: number[] = []
  const indices: number[] = []
  const add = (m: { v: number[]; t: number[] }, tr: string | null) => {
    const k = (tr ?? '1 0 0 0 1 0 0 0 1 0 0 0').trim().split(/\s+/).map(Number)
    const base = vertices.length / 3
    for (let i = 0; i < m.v.length; i += 3) {
      const [x, y, z] = [m.v[i], m.v[i + 1], m.v[i + 2]]
      vertices.push((x * k[0] + y * k[3] + z * k[6] + k[9]) * scale, (x * k[1] + y * k[4] + z * k[7] + k[10]) * scale, (x * k[2] + y * k[5] + z * k[8] + k[11]) * scale)
    }
    for (const i of m.t) indices.push(i + base)
  }
  if (items.length) for (const it of items) { const m = meshes.get(it.getAttribute('objectid') ?? ''); if (m) add(m, it.getAttribute('transform')) }
  else for (const m of meshes.values()) add(m, null)
  if (indices.some((i) => !Number.isInteger(i) || i < 0 || i >= vertices.length / 3)) return { success: false, error: i18n.t('errors.threeMfBad') }
  return ok(vertices, indices, name)
}

/** Файл импорта → меш по расширению: .obj, .3mf; остальное — `null` (STL — прежний разбор) */
export async function parseMeshFile(file: File): Promise<MeshResult | null> {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext !== 'obj' && ext !== '3mf') return null
  if (file.size > MAX_STL_FILE_SIZE) return { success: false, error: i18n.t('errors.stlTooLarge', { size: Math.round(file.size / 1024 / 1024), max: MAX_STL_FILE_SIZE / 1024 / 1024 }) }
  if (ext === 'obj') return parseObjText(await file.text(), file.name)
  return parse3mf(await file.arrayBuffer(), file.name)
}
