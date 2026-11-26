// ============================================================
// child-view-render.ts — CHILD-VIEW на основном renderer/scene
// ============================================================
// Второй WebGLRenderer/сцена не создаются. Маленькое окно рисуется тем же
// renderer в прямоугольнике тела окна (setViewport + scissor):
//   1) весь мир — временным wireframe-материалом (scene.overrideMaterial);
//   2) выбранный ребёнок (layer 2) — реалистичной заливкой.
// Камера — своя (снимок основной ориентации + fitView сцены), OrbitControls
// привязан к телу окна.

import { useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ExtractedMesh } from '../csg/types'
import { useChildViewSource } from '../store/child-view-source'
import { CHILD_VIEW_CONTROLS } from './child-view'

export interface RectLike { left: number; top: number; right: number; bottom: number; width: number; height: number }

/** Прямоугольник окна в координатах canvas (WebGL: origin — левый нижний). */
export function childViewportRect(canvas: RectLike, host: RectLike): { x: number; y: number; width: number; height: number } {
  const width = Math.max(0, host.width)
  const height = Math.max(0, host.height)
  return {
    x: host.left - canvas.left,
    y: canvas.bottom - host.bottom,
    width,
    height,
  }
}

/** Вписать рамку сцены в камеру маленького окна (ориентация — от основной камеры). */
export function fitChildViewCamera(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  mainCamera: THREE.Camera | null,
  mainTarget: THREE.Vector3 | null,
): { center: THREE.Vector3; distance: number } {
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
  const radius = box.isEmpty() ? 1 : Math.max(1, box.getSize(new THREE.Vector3()).length() / 2)
  const dir = mainCamera && mainTarget
    ? new THREE.Vector3().subVectors(mainCamera.position, mainTarget)
    : new THREE.Vector3(0.5, -0.9, 0.6)
  if (dir.lengthSq() < 1e-9) dir.set(0.5, -0.9, 0.6)
  dir.normalize()
  const halfV = (camera.fov * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * Math.max(camera.aspect, 1e-3))
  const distance = (radius / Math.sin(Math.min(halfV, halfH))) * 1.05
  camera.position.copy(center).addScaledVector(dir, distance)
  camera.up.copy(mainCamera?.up ?? new THREE.Vector3(0, 0, 1))
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  return { center, distance }
}

function sceneBox(scene: THREE.Scene, rootId: string | null, meshMap: Map<string, { mesh: THREE.Mesh }>): THREE.Box3 {
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3()
  for (const [id, entry] of meshMap) {
    if (entry.mesh.visible !== false) {
      const g = entry.mesh.geometry
      if (!g.boundingBox) g.computeBoundingBox()
      if (g.boundingBox) box.union(g.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld))
    }
  }
  return box
}

interface MiniState {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  childMesh: THREE.Mesh
  rootId: string
  host: HTMLDivElement
}

/**
 * Рендер маленького окна в основном цикле. Вызывается из useThreeInit после
 * основного кадра; `afterRenderRef` — точка подключения.
 */
export function useChildViewport(opts: {
  sceneReady: boolean
  sceneRef: React.MutableRefObject<THREE.Scene | null>
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>
  controlsRef: React.MutableRefObject<OrbitControls | null>
  meshMapRef: React.MutableRefObject<Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D }>>
  afterRenderRef: React.MutableRefObject<((renderer: THREE.WebGLRenderer, scene: THREE.Scene) => void) | null>
}): void {
  const child = useChildViewSource((s) => s.child)
  const rootId = useChildViewSource((s) => s.rootId)
  const host = useChildViewSource((s) => s.host)

  useEffect(() => {
    if (!opts.sceneReady || !child || !rootId || !host) {
      opts.afterRenderRef.current = null
      return
    }
    const scene = opts.sceneRef.current
    const mainCamera = opts.cameraRef.current
    const rootEntry = opts.meshMapRef.current.get(rootId)
    if (!scene || !mainCamera || !rootEntry) return

    const root = rootEntry.pivot
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(child.vertices, 3))
    geo.setIndex(new THREE.BufferAttribute(child.indices, 1))
    if (child.normals && child.normals.length === child.vertices.length) {
      geo.setAttribute('normal', new THREE.BufferAttribute(child.normals, 3))
    } else {
      geo.computeVertexNormals()
    }
    const mat = new THREE.MeshStandardMaterial({ color: '#89b4fa', roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide })
    const childMesh = new THREE.Mesh(geo, mat)
    childMesh.visible = false   // показываем только в маленьком окне (main рисуется раньше)
    root.add(childMesh)

    const camera = new THREE.PerspectiveCamera(45, Math.max(0.2, host.clientWidth / Math.max(1, host.clientHeight)), 0.1, 100000)
    const box = sceneBox(scene, rootId, opts.meshMapRef.current)
    const fitted = fitChildViewCamera(camera, box, mainCamera, opts.controlsRef.current?.target ?? null)
    const controls = new OrbitControls(camera, host)
    Object.assign(controls, CHILD_VIEW_CONTROLS)
    controls.target.copy(fitted.center)
    controls.update()

    const state: MiniState = { camera, controls, childMesh, rootId, host }

    host.dataset.childControls = '1'
    host.dataset.childRealistic = '1'
    host.dataset.othersWireframe = String(Math.max(0, opts.meshMapRef.current.size - 1))
    host.dataset.rootTransform = [root.position.x, root.position.y, root.position.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
    host.dataset.mainCamera = [mainCamera.position.x, mainCamera.position.y, mainCamera.position.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
    host.dataset.fit = String(Math.round(fitted.distance * 100) / 100)
    host.dataset.sceneCenter = [fitted.center.x, fitted.center.y, fitted.center.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')

    let lastCam = ''
    const reportCamera = () => {
      const cam = [camera.position.x, camera.position.y, camera.position.z]
        .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
      if (cam !== lastCam) { lastCam = cam; host.dataset.childCamera = cam }
    }
    reportCamera()
    controls.addEventListener('change', reportCamera)

    const renderMini = (renderer: THREE.WebGLRenderer, sc: THREE.Scene) => {
      const canvasRect = renderer.domElement.getBoundingClientRect()
      const hostRect = state.host.getBoundingClientRect()
      const rect = childViewportRect(canvasRect, hostRect)
      if (rect.width < 4 || rect.height < 4) return
      state.camera.aspect = rect.width / rect.height
      state.camera.updateProjectionMatrix()

      const prevAutoClear = renderer.autoClear
      const prevClear = renderer.getClearColor(new THREE.Color())
      const prevAlpha = renderer.getClearAlpha()
      renderer.autoClear = false
      renderer.setScissorTest(true)
      renderer.setViewport(rect.x, rect.y, rect.width, rect.height)
      renderer.setScissor(rect.x, rect.y, rect.width, rect.height)
      if (sc.background instanceof THREE.Color) renderer.setClearColor(sc.background, 1)
      renderer.clear()

      // Временные материалы: остальной мир — каркасом, ребёнок — реалистичный.
      // Один проход: свет/тени работают, без overrideMaterial (он гасит свет).
      type Saved = { mat: THREE.MeshStandardMaterial; wireframe: boolean; depthWrite: boolean; color: number; transparent: boolean; opacity: number }
      const saved: Saved[] = []
      for (const entry of opts.meshMapRef.current.values()) {
        const m = entry.mesh.material as THREE.MeshStandardMaterial
        if (!m || !('wireframe' in m)) continue
        saved.push({ mat: m, wireframe: m.wireframe, depthWrite: m.depthWrite, color: m.color.getHex(), transparent: m.transparent, opacity: m.opacity })
        m.wireframe = true
        m.depthWrite = false
        m.transparent = true
        m.opacity = 0.55
        m.color.set(0x9aa0b0)
      }
      state.childMesh.visible = true
      renderer.render(sc, state.camera)
      state.childMesh.visible = false
      for (const s2 of saved) {
        s2.mat.wireframe = s2.wireframe
        s2.mat.depthWrite = s2.depthWrite
        s2.mat.color.setHex(s2.color)
        s2.mat.transparent = s2.transparent
        s2.mat.opacity = s2.opacity
      }

      renderer.setClearColor(prevClear, prevAlpha)
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, canvasRect.width, canvasRect.height)
      renderer.autoClear = prevAutoClear
    }
    opts.afterRenderRef.current = renderMini

    return () => {
      opts.afterRenderRef.current = null
      controls.removeEventListener('change', reportCamera)
      controls.dispose()
      root.remove(state.childMesh)
      geo.dispose()
      mat.dispose()
      delete state.host.dataset.childControls
      delete state.host.dataset.childRealistic
      delete state.host.dataset.othersWireframe
      delete state.host.dataset.rootTransform
      delete state.host.dataset.mainCamera
      delete state.host.dataset.fit
      delete state.host.dataset.sceneCenter
      delete state.host.dataset.childCamera
    }
  }, [opts.sceneReady, child, rootId, host, opts.sceneRef, opts.cameraRef, opts.controlsRef, opts.meshMapRef, opts.afterRenderRef])
}

/** Роли материалов в маленьком окне (документация/тесты). */
export const CHILD_VIEW_MATERIALS = { child: 'standard', world: 'wireframe' } as const
