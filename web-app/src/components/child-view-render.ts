// ============================================================
// child-view-render.ts — CHILD-VIEW на основном renderer/scene
// ============================================================
// Второй WebGLRenderer/сцена не создаются. Маленькое окно рисуется тем же
// renderer в прямоугольнике тела окна (setViewport + scissor):
//   • ребёнок — реалистичная заливка (мировые координаты: трансформ узла
//     относительно корня CSG + поправка от системы создания);
//   • остальной CSG и другие объекты — ЧИСТЫЙ каркас (curved-wireframe:
//     окружности/образующие/меридианы; плоские — EdgesGeometry), а не
//     плотная треугольная сетка.
// Камера — своя (снимок основной ориентации + fitView сцены), OrbitControls
// привязан к телу окна.

import { useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ExtractedMesh, TransformNR } from '../csg/types'
import { useChildViewSource } from '../store/child-view-source'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { getNode, nodeWorldTransform, rebuildNodeForView } from '../csg/history-tree'
import { CHILD_VIEW_CONTROLS } from './child-view'
import { CURVED_WIREFRAME, curvedWireframeGeometry, threadWireframe } from './curved-wireframe'

export interface RectLike { left: number; top: number; right: number; bottom: number; width: number; height: number }

/** Прямоугольник окна в координатах canvas (WebGL: origin — левый нижний). */
export function childViewportRect(canvas: RectLike, host: RectLike): { x: number; y: number; width: number; height: number } {
  return {
    x: host.left - canvas.left,
    y: canvas.bottom - host.bottom,
    width: Math.max(0, host.width),
    height: Math.max(0, host.height),
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

/** Материалы окна (документация/тесты): ребёнок — standard, мир — clean wireframe. */
export const CHILD_VIEW_MATERIALS = { child: 'standard', world: 'clean-wireframe' } as const

const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

function matrixOf(t: TransformNR | undefined): THREE.Matrix4 {
  const u = t ?? IDENTITY
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(u.rotX), THREE.MathUtils.degToRad(u.rotY), THREE.MathUtils.degToRad(u.rotZ),
  ))
  return new THREE.Matrix4().compose(
    new THREE.Vector3(u.x, u.y, u.z), q, new THREE.Vector3(u.scaleX, u.scaleY, u.scaleZ),
  )
}

/** Матрица TRS трансформа (мировые координаты; экспорт — для тестов и диагностики). */
export function childViewWorldMatrix(rootTransform: TransformNR | undefined): THREE.Matrix4 {
  return matrixOf(rootTransform)
}

/** Поправка: текущий мировой трансформ узла от запечённого в его геометрии. */
function correctionMatrix(world: TransformNR | null, baked: TransformNR | undefined): THREE.Matrix4 {
  return (world ? matrixOf(world) : new THREE.Matrix4()).multiply(matrixOf(baked).invert())
}

function geometryOfMesh(vertices: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  g.setIndex(new THREE.BufferAttribute(indices, 1))
  return g
}

function sceneBox(scene: THREE.Scene, meshMap: Map<string, { mesh: THREE.Mesh }>): THREE.Box3 {
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3()
  for (const entry of meshMap.values()) {
    const g = entry.mesh.geometry
    if (!g.boundingBox) g.computeBoundingBox()
    if (g.boundingBox) box.union(g.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld))
  }
  return box
}

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
  const objects = useDocumentStore((s) => s.objects)
  const selectedChild = useUiStore((s) => s.selectedChild)
  const selectedNodeId = selectedChild?.nodeId ?? null

  useEffect(() => {
    if (!opts.sceneReady || !child || !rootId || !host) {
      opts.afterRenderRef.current = null
      return
    }
    const scene = opts.sceneRef.current
    const mainCamera = opts.cameraRef.current
    const rootEntry = opts.meshMapRef.current.get(rootId)
    const rootObj = objects[rootId]
    if (!scene || !mainCamera || !rootEntry || !rootObj) return

    let alive = true
    const rootNode = getNode(rootId)
    const miniGroup = new THREE.Group()
    miniGroup.visible = false
    scene.add(miniGroup)
    const childGroup = new THREE.Group()
    childGroup.visible = false
    scene.add(childGroup)

    // ── Ребёнок: меш из дерева → текущие мировые координаты сцены ──
    const childGeo = geometryOfMesh(child.vertices, child.indices)
    if (child.normals && child.normals.length === child.vertices.length) {
      childGeo.setAttribute('normal', new THREE.BufferAttribute(child.normals, 3))
    } else {
      childGeo.computeVertexNormals()
    }
    const childMat = new THREE.MeshStandardMaterial({ color: '#89b4fa', roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide })
    const childMesh = new THREE.Mesh(childGeo, childMat)
    childGroup.add(childMesh)
    const selectedNode = selectedNodeId ? getNode(selectedNodeId) : null
    const selectedWorld = selectedNodeId ? nodeWorldTransform(rootId, selectedNodeId) : null
    childGroup.matrix.copy(correctionMatrix(selectedWorld, selectedNode?.localTransform))
    childGroup.matrixAutoUpdate = false
    childGroup.updateMatrixWorld(true)

    // ── Чистый каркас: дети CSG, кроме выбранного, + другие объекты ──
    const wireMat = new THREE.LineBasicMaterial({ color: 0x9aa0b0, transparent: true, opacity: 0.65 })
    const addWire = (geo: THREE.BufferGeometry, transform?: TransformNR) => {
      const line = new THREE.LineSegments(geo, wireMat)
      if (transform) {
        line.matrix.copy(matrixOf(transform))
        line.matrixAutoUpdate = false
      }
      miniGroup.add(line)
    }
    for (const childId of rootNode?.children ?? []) {
      if (childId === selectedNodeId) continue
      const n = getNode(childId)
      if (!n) continue
      const w = nodeWorldTransform(rootId, childId) ?? rootObj.transform
      if (n.type === 'thread' && n.threadParams) {
        const g = threadWireframe(n.threadParams)
        if (g) addWire(g, w)
      } else if (n.type === 'primitive' && n.shapeType && CURVED_WIREFRAME.has(n.shapeType)) {
        const g = curvedWireframeGeometry(n.shapeType, n.params ?? {})
        if (g) addWire(g, w)
      } else {
        void rebuildNodeForView(childId).then((m) => {
          if (!alive) return
          const g = geometryOfMesh(m.vertices, m.indices)
          const lines = new THREE.EdgesGeometry(g, 30)
          g.dispose()
          const line = new THREE.LineSegments(lines, wireMat)
          line.matrix.copy(correctionMatrix(w, n.localTransform))
          line.matrixAutoUpdate = false
          miniGroup.add(line)
        }).catch(() => { /* ребёнок не построился — без каркаса */ })
      }
    }
    for (const obj of Object.values(objects)) {
      if (obj.id === rootId) continue
      let g: THREE.BufferGeometry | null = null
      if (obj.thread) g = threadWireframe(obj.thread)
      else if (CURVED_WIREFRAME.has(obj.shapeType)) g = curvedWireframeGeometry(obj.shapeType, obj.params)
      if (!g) {
        const base = geometryOfMesh(obj.vertices, obj.indices)
        g = new THREE.EdgesGeometry(base, 30)
        base.dispose()
      }
      addWire(g, obj.transform)
    }

    // ── Камера: снимок ориентации основной + fitView сцены ──
    const camera = new THREE.PerspectiveCamera(45, Math.max(0.2, host.clientWidth / Math.max(1, host.clientHeight)), 0.1, 100000)
    const box = sceneBox(scene, opts.meshMapRef.current).union(new THREE.Box3().setFromObject(childGroup))
    const fitted = fitChildViewCamera(camera, box, mainCamera, opts.controlsRef.current?.target ?? null)
    const controls = new OrbitControls(camera, host)
    Object.assign(controls, CHILD_VIEW_CONTROLS)
    controls.target.copy(fitted.center)
    controls.update()

    host.dataset.childControls = '1'
    host.dataset.childRealistic = '1'
    host.dataset.othersWireframe = String((rootNode?.children?.length ?? 1) - 1 + Object.keys(objects).length - 1)
    host.dataset.rootTransform = [rootObj.transform.x, rootObj.transform.y, rootObj.transform.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
    host.dataset.mainCamera = [mainCamera.position.x, mainCamera.position.y, mainCamera.position.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
    host.dataset.fit = String(Math.round(fitted.distance * 100) / 100)
    host.dataset.sceneCenter = [fitted.center.x, fitted.center.y, fitted.center.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
    const childCenter = new THREE.Box3().setFromObject(childGroup).getCenter(new THREE.Vector3())
    host.dataset.childCenter = [childCenter.x, childCenter.y, childCenter.z]
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
      const hostRect = host.getBoundingClientRect()
      const rect = childViewportRect(canvasRect, hostRect)
      if (rect.width < 4 || rect.height < 4) return
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()

      const prevAutoClear = renderer.autoClear
      const prevClear = renderer.getClearColor(new THREE.Color())
      const prevAlpha = renderer.getClearAlpha()
      renderer.autoClear = false
      renderer.setScissorTest(true)
      renderer.setViewport(rect.x, rect.y, rect.width, rect.height)
      renderer.setScissor(rect.x, rect.y, rect.width, rect.height)
      if (sc.background instanceof THREE.Color) renderer.setClearColor(sc.background, 1)
      renderer.clear()

      // Прячем заливку основного мира; показываем чистый каркас + ребёнка
      const hidden: THREE.Material[] = []
      for (const entry of opts.meshMapRef.current.values()) {
        const m = entry.mesh.material as THREE.Material
        if (m && m.visible) { hidden.push(m); m.visible = false }
      }
      miniGroup.visible = true
      childGroup.visible = true
      renderer.render(sc, camera)
      miniGroup.visible = false
      childGroup.visible = false
      for (const m of hidden) m.visible = true

      renderer.setClearColor(prevClear, prevAlpha)
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, canvasRect.width, canvasRect.height)
      renderer.autoClear = prevAutoClear
    }
    opts.afterRenderRef.current = renderMini

    return () => {
      alive = false
      opts.afterRenderRef.current = null
      controls.removeEventListener('change', reportCamera)
      controls.dispose()
      scene.remove(miniGroup)
      scene.remove(childGroup)
      miniGroup.traverse((o) => {
        const l = o as THREE.LineSegments
        l.geometry?.dispose?.()
      })
      wireMat.dispose()
      childGeo.dispose()
      childMat.dispose()
      for (const k of ['childControls', 'childRealistic', 'othersWireframe', 'rootTransform', 'mainCamera', 'fit', 'sceneCenter', 'childCamera', 'childCenter']) {
        delete host.dataset[k]
      }
    }
  }, [opts.sceneReady, child, rootId, host, objects, selectedNodeId, opts.sceneRef, opts.cameraRef, opts.controlsRef, opts.meshMapRef, opts.afterRenderRef])
}
