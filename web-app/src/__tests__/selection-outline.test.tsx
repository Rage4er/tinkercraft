// ============================================================
// selection-outline.test.tsx — SELECTION-OUTLINE: кайма выделенных объектов
// ============================================================
// Выделенный объект — синяя кайма ~3 px (OutlinePass поверх канваса); не выделен — каймы нет;
// несколько выделенных — кайма у всех. Скрытый объект каймы не получает. Ничего не выделено —
// кадр как раньше (один renderer.render, проходы каймы не идут). Гизмо и размеры — поверх каймы.
// Кайма видна и на светлой теме (обычное смешивание, не аддитивное), перспектива ↔ орто — маска
// под тип камеры. Браузер (кайма на экране, клик / клик в пусто, рамка, тема, FPS) —
// e2e/selection-outline.mjs.

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  SELECTION_OUTLINE, DRAW_OVER_OUTLINE, SelectionOutlinePass, renderWithSelectionOutline, selectionOutlineTargets,
} from '../components/selection-outline'

type Entry = { mesh: THREE.Mesh; pivot: THREE.Object3D }

/** Сцена как во вьюпорте: объект = pivot (Object3D) → mesh; гизмо и размеры — накладки. */
function makeScene(ids: string[]) {
  const scene = new THREE.Scene()
  const map = new Map<string, Entry>()
  for (const id of ids) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial())
    const pivot = new THREE.Object3D()
    pivot.add(mesh)
    scene.add(pivot)
    map.set(id, { mesh, pivot })
  }
  const gizmo = new THREE.Object3D()
  gizmo.userData[DRAW_OVER_OUTLINE] = true
  scene.add(gizmo)
  const dims = new THREE.Group()
  dims.userData[DRAW_OVER_OUTLINE] = true
  scene.add(dims)
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 10000)
  return { scene, map, gizmo, dims, camera }
}

/** Рендерер-заглушка: записывает, что и в каком порядке рисуется (WebGL в jsdom нет). */
function makeRenderer() {
  const log: string[] = []
  const renderer = {
    autoClear: true,
    shadowMap: { autoUpdate: true },
    render: vi.fn((obj: THREE.Object3D) => {
      log.push(obj instanceof THREE.Scene ? 'scene' : obj.userData[DRAW_OVER_OUTLINE] ? 'overlay' : 'other')
    }),
  }
  return { renderer, gl: renderer as unknown as THREE.WebGLRenderer, log }
}

/** Проход каймы с подменённым render (запись: сцена без накладок, тени не пересчитываются). */
function makePass(scene: THREE.Scene, camera: THREE.Camera, log: string[], gizmo: THREE.Object3D, renderer: { shadowMap: { autoUpdate: boolean } }) {
  const pass = new SelectionOutlinePass(800, 600, scene, camera)
  const passRender = vi.spyOn(pass, 'render').mockImplementation(() => {
    log.push(`outline(${pass.selectedObjects.length}; gizmo ${gizmo.visible ? 'on' : 'off'}; shadows ${renderer.shadowMap.autoUpdate ? 'on' : 'off'})`)
  })
  return { pass, passRender }
}

afterEach(() => { vi.restoreAllMocks() })

describe('SELECTION-OUTLINE — кайма у выделенного', () => {
  it('выделен один — его меш в кайме; кадр: сцена → кайма → гизмо и размеры поверх', () => {
    const { scene, map, gizmo, dims, camera } = makeScene(['a', 'b'])
    const { renderer, gl, log } = makeRenderer()
    const { pass, passRender } = makePass(scene, camera, log, gizmo, renderer)
    selectionOutlineTargets(new Set(['a']), map, pass.selectedObjects)
    expect(pass.selectedObjects).toEqual([map.get('a')!.mesh])
    expect(renderWithSelectionOutline(gl, scene, camera, pass)).toBe(true)
    expect(passRender).toHaveBeenCalledTimes(1)
    // гизмо скрыт на время сцены и каймы, тени на время каймы не пересчитываются
    expect(log).toEqual(['scene', 'outline(1; gizmo off; shadows off)', 'overlay', 'overlay'])
    expect(gizmo.visible).toBe(true)
    expect(dims.visible).toBe(true)
    expect(renderer.shadowMap.autoUpdate).toBe(true)
    expect(renderer.autoClear).toBe(true)
  })

  it('кайма заметная: синяя, ~3 px, без свечения; видна на светлой теме (не аддитивная)', () => {
    const { scene, camera } = makeScene([])
    const pass = new SelectionOutlinePass(800, 600, scene, camera)
    const blue = new THREE.Color(SELECTION_OUTLINE.color)
    expect(blue.b).toBeGreaterThan(0.9)                                // насыщенный синий
    expect(blue.r).toBeLessThan(0.1)
    expect(pass.visibleEdgeColor.getHex()).toBe(SELECTION_OUTLINE.color)
    expect(pass.hiddenEdgeColor.getHex()).toBe(SELECTION_OUTLINE.hiddenColor)
    expect(pass.edgeStrength).toBeGreaterThanOrEqual(3)
    expect(pass.edgeThickness).toBeGreaterThanOrEqual(1)
    expect(pass.edgeGlow).toBe(0)
    expect(pass.pulsePeriod).toBe(0)
    // штатная кайма OutlinePass — AdditiveBlending: на светлом фоне выцветает в белый
    expect(pass.overlayMaterial.blending).toBe(THREE.NormalBlending)
    expect(pass.overlayMaterial.fragmentShader).toContain('#include <colorspace_fragment>')
  })

  it('перспектива ↔ орто: маска пересобирается под тип глубины камеры', () => {
    const { scene, camera } = makeScene([])
    const pass = new SelectionOutlinePass(800, 600, scene, camera)
    expect(pass.prepareMaskMaterial.fragmentShader).toContain('perspectiveDepthToViewZ')
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000)
    pass.setCamera(ortho)
    expect(pass.renderCamera).toBe(ortho)
    expect(pass.prepareMaskMaterial.fragmentShader).toContain('orthographicDepthToViewZ')
    expect(pass.prepareMaskMaterial.fragmentShader).not.toContain('DEPTH_TO_VIEW_Z')
    expect(pass.prepareMaskMaterial.side).toBe(THREE.DoubleSide)
    pass.setCamera(camera)
    expect(pass.prepareMaskMaterial.fragmentShader).toContain('perspectiveDepthToViewZ')
  })
})

describe('SELECTION-OUTLINE — не выделен — нет каймы', () => {
  it('ничего не выделено: каймы нет, кадр как раньше — один renderer.render', () => {
    const { scene, map, gizmo, camera } = makeScene(['a', 'b'])
    const { renderer, gl, log } = makeRenderer()
    const { pass, passRender } = makePass(scene, camera, log, gizmo, renderer)
    selectionOutlineTargets(new Set(), map, pass.selectedObjects)
    expect(pass.selectedObjects).toEqual([])
    expect(renderWithSelectionOutline(gl, scene, camera, pass)).toBe(false)
    expect(passRender).not.toHaveBeenCalled()
    expect(log).toEqual(['scene'])
  })

  it('выделение снято — кайма снята (тот же массив прохода, без хвостов)', () => {
    const { scene, map, camera } = makeScene(['a', 'b'])
    const pass = new SelectionOutlinePass(800, 600, scene, camera)
    selectionOutlineTargets(new Set(['a', 'b']), map, pass.selectedObjects)
    expect(pass.selectedObjects).toHaveLength(2)
    selectionOutlineTargets(new Set(), map, pass.selectedObjects)
    expect(pass.selectedObjects).toHaveLength(0)
  })

  it('выделен, но скрыт — каймы нет; id, которого нет в сцене, — пропущен', () => {
    const { scene, map, camera } = makeScene(['a', 'b'])
    map.get('a')!.mesh.visible = false
    const pass = new SelectionOutlinePass(800, 600, scene, camera)
    selectionOutlineTargets(new Set(['a', 'gone']), map, pass.selectedObjects)
    expect(pass.selectedObjects).toEqual([])
  })
})

describe('SELECTION-OUTLINE — множественное (2+) — кайма у всех', () => {
  it('три из четырёх выделены — в кайме все три, невыделенный — нет', () => {
    const { scene, map, gizmo, camera } = makeScene(['a', 'b', 'c', 'd'])
    const { renderer, gl, log } = makeRenderer()
    const { pass } = makePass(scene, camera, log, gizmo, renderer)
    selectionOutlineTargets(new Set(['a', 'c', 'd']), map, pass.selectedObjects)
    expect(pass.selectedObjects).toEqual([map.get('a')!.mesh, map.get('c')!.mesh, map.get('d')!.mesh])
    expect(pass.selectedObjects).not.toContain(map.get('b')!.mesh)
    expect(renderWithSelectionOutline(gl, scene, camera, pass)).toBe(true)
    expect(log).toEqual(['scene', 'outline(3; gizmo off; shadows off)', 'overlay', 'overlay'])
  })

  it('выделение меняется каждый кадр — кайма следует (добавили, убрали)', () => {
    const { scene, map, camera } = makeScene(['a', 'b', 'c'])
    const pass = new SelectionOutlinePass(800, 600, scene, camera)
    const frames = [['a'], ['a', 'b'], ['a', 'b', 'c'], ['c']]
    const got = frames.map((ids) => selectionOutlineTargets(new Set(ids), map, pass.selectedObjects).length)
    expect(got).toEqual([1, 2, 3, 1])
    expect(pass.selectedObjects).toEqual([map.get('c')!.mesh])
  })
})
