// ============================================================
// ChildViewScene.tsx — CSG-CHILD-VIEW: копия основного вида
// ============================================================
// Та же сцена/координаты и та же камера, что в основном вьюпорте (снимок на
// момент открытия): корневой CSG — каркас, выбранный ребёнок — реалистичной
// заливкой, остальные объекты сцены — каркасом. Никакой отдельной центровки:
// всё в мировых координатах, OrbitControls — свободная навигация.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ExtractedMesh, ShapeParams, ShapeType, TransformNR } from '../csg/types'
import { CHILD_VIEW_CONTROLS, snapshotMainView } from './child-view'
import { CURVED_WIREFRAME, curvedWireframeGeometry } from './curved-wireframe'

export interface ChildViewObject {
  id: string
  vertices: Float32Array
  indices: Uint32Array
  shapeType: ShapeType
  params: ShapeParams
  transform: TransformNR
  color?: string
}

export interface ChildViewSceneProps {
  child: ExtractedMesh | null
  /** Корневой CSG-объект (каркас + система координат ребёнка) */
  root: ChildViewObject | null
  /** Остальные объекты сцены — каркасом */
  others: ChildViewObject[]
  /** Камера основного вида — стартовая для окна */
  mainCamera: THREE.Camera | null
  mainTarget: THREE.Vector3 | null
  color?: string
}

function geometryOf(vertices: Float32Array, indices: Uint32Array, normals?: Float32Array | null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  g.setIndex(new THREE.BufferAttribute(indices, 1))
  if (normals && normals.length === vertices.length) g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  else g.computeVertexNormals()
  return g
}

function applyTransform(obj: THREE.Object3D, t: TransformNR): void {
  obj.position.set(t.x, t.y, t.z)
  obj.rotation.set(
    THREE.MathUtils.degToRad(t.rotX),
    THREE.MathUtils.degToRad(t.rotY),
    THREE.MathUtils.degToRad(t.rotZ),
  )
  obj.scale.set(t.scaleX, t.scaleY, t.scaleZ)
}

function wireGeometryFor(obj: ChildViewObject): THREE.BufferGeometry | null {
  if (CURVED_WIREFRAME.has(obj.shapeType)) return curvedWireframeGeometry(obj.shapeType, obj.params)
  const geo = geometryOf(obj.vertices, obj.indices)
  const edges = new THREE.EdgesGeometry(geo, 30)
  geo.dispose()
  return edges
}

export default function ChildViewScene({ child, root, others, mainCamera, mainTarget, color = '#89b4fa' }: ChildViewSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !root || root.vertices.length < 9) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(host.clientWidth || 320, host.clientHeight || 240)
    renderer.domElement.className = 'child-view-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const aspect = (host.clientWidth || 320) / (host.clientHeight || 240)
    const view = mainCamera && mainTarget
      ? snapshotMainView(mainCamera, { x: mainTarget.x, y: mainTarget.y, z: mainTarget.z })
      : null
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
    if (view?.kind === 'orthographic' && view.ortho) {
      const o = view.ortho
      camera = new THREE.OrthographicCamera(o.left, o.right, o.top, o.bottom, 0.1, 100000)
      camera.zoom = view.zoom ?? 1
    } else {
      camera = new THREE.PerspectiveCamera(view?.fov ?? 45, aspect, 0.1, 10000)
    }
    camera.up.set(view?.up.x ?? 0, view?.up.y ?? 0, view?.up.z ?? 1)
    camera.position.set(view?.position.x ?? 120, view?.position.y ?? -120, view?.position.z ?? 90)
    const target = new THREE.Vector3(view?.target.x ?? 0, view?.target.y ?? 0, view?.target.z ?? 0)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    host.dataset.mainCamera = [camera.position.x, camera.position.y, camera.position.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
    host.dataset.mainTarget = [target.x, target.y, target.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dir = new THREE.DirectionalLight(0xffffff, 1.0)
    dir.position.set(60, -80, 120)
    scene.add(dir)

    // Корневой CSG — в своих мировых координатах (та же система, что в основном виде)
    const rootGroup = new THREE.Group()
    applyTransform(rootGroup, root.transform)
    scene.add(rootGroup)
    host.dataset.rootTransform = [root.transform.x, root.transform.y, root.transform.z]
      .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')

    // Остальной CSG — каркасом
    const rootGeo = geometryOf(root.vertices, root.indices)
    const rootWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(rootGeo, 30),
      new THREE.LineBasicMaterial({ color: 0x6c7086, transparent: true, opacity: 0.5 }),
    )
    rootGroup.add(rootWire)
    rootGeo.dispose()

    // Выбранный ребёнок — реалистичной заливкой
    if (child && child.vertices.length >= 9) {
      const childGeo = geometryOf(child.vertices, child.indices, child.normals)
      const mesh = new THREE.Mesh(childGeo, new THREE.MeshStandardMaterial({
        color, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide,
      }))
      rootGroup.add(mesh)
      const childEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(childGeo, 25),
        new THREE.LineBasicMaterial({ color: 0x1b1b2b, transparent: true, opacity: 0.75 }),
      )
      rootGroup.add(childEdges)
      host.dataset.childRealistic = '1'
    }

    // Остальные объекты сцены — каркасом, в своих координатах
    for (const obj of others) {
      if (obj.vertices.length < 9) continue
      const geo = wireGeometryFor(obj)
      if (!geo) continue
      const wire = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(obj.color ?? '#6c7086').multiplyScalar(0.8),
          transparent: true,
          opacity: 0.5,
        }),
      )
      const group = new THREE.Group()
      applyTransform(group, obj.transform)
      group.add(wire)
      scene.add(group)
    }
    host.dataset.othersWireframe = String(others.length)

    // Вписать всю сцену в окно (как F в основном виде): ориентация — от основной
    // камеры, но расстояние — по рамке сцены и соотношению сторон маленького окна.
    const sceneBox = new THREE.Box3().setFromObject(scene)
    if (!sceneBox.isEmpty()) {
      const center = sceneBox.getCenter(new THREE.Vector3())
      const radius = Math.max(1, sceneBox.getSize(new THREE.Vector3()).length() / 2)
      const dir = view
        ? new THREE.Vector3(view.position.x - view.target.x, view.position.y - view.target.y, view.position.z - view.target.z)
        : new THREE.Vector3(0.5, -0.9, 0.6)
      if (dir.lengthSq() < 1e-9) dir.set(0.5, -0.9, 0.6)
      dir.normalize()
      if (camera instanceof THREE.PerspectiveCamera) {
        const halfV = (camera.fov * Math.PI) / 360
        const halfH = Math.atan(Math.tan(halfV) * Math.max(aspect, 1e-3))
        const dist = (radius / Math.sin(Math.min(halfV, halfH))) * 1.05
        camera.position.copy(center).addScaledVector(dir, dist)
        host.dataset.fit = String(Math.round(dist * 100) / 100)
      } else {
        const o = camera as THREE.OrthographicCamera
        const halfH = (o.top - o.bottom) / 2 / (o.zoom || 1)
        const dist = (radius / halfH) * 2 * 1.05
        camera.position.copy(center).addScaledVector(dir, Math.max(1, dist))
        o.zoom = 1
        host.dataset.fit = String(Math.round(dist * 100) / 100)
      }
      camera.lookAt(center)
      target.copy(center)
      host.dataset.sceneCenter = [center.x, center.y, center.z]
        .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    Object.assign(controls, CHILD_VIEW_CONTROLS)
    controls.target.copy(target)
    controls.update()

    host.dataset.childControls = '1'
    let lastCam = ''
    const tick = () => {
      controls.update()
      const cam = [camera.position.x, camera.position.y, camera.position.z]
        .map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(',')
      if (cam !== lastCam) { lastCam = cam; host.dataset.childCamera = cam }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    let raf = requestAnimationFrame(tick)

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w / h
      } else {
        const o = camera as THREE.OrthographicCamera
        const halfH = (o.top - o.bottom) / 2 / o.zoom
        const halfW = halfH * (w / h)
        o.left = -halfW; o.right = halfW; o.top = halfH; o.bottom = -halfH
      }
      camera.updateProjectionMatrix()
    })
    ro.observe(host)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      scene.traverse((o) => {
        const any = o as THREE.Mesh
        any.geometry?.dispose?.()
        const mat = any.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [child, root, others, mainCamera, mainTarget, color])

  return <div ref={hostRef} className="child-view-canvas-host" data-testid="child-view-scene" />
}
