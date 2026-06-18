import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { SceneObject, TransformNR } from '../csg/types'
import WebGLFallback from './WebGLFallback'
import ViewCube from './ViewCube'

export type GizmoMode = 'translate' | 'rotate' | 'scale' | null

interface FitTarget { camPos: THREE.Vector3; target: THREE.Vector3 }
interface DragRect  { startX: number; startY: number; endX: number; endY: number }

interface Props {
  objects:          SceneObject[]
  selectedIds:      Set<string>
  onSelect:         (id: string | null, addToSelection: boolean) => void
  onMultiSelect?:   (ids: string[]) => void
  onFpsUpdate:      (fps: number) => void
  fitViewRef?:      React.MutableRefObject<(() => void) | null>
  resetViewRef?:    React.MutableRefObject<(() => void) | null>
  gizmoMode:        GizmoMode
  onTransformEnd:   (id: string, transform: TransformNR) => void
  snapValue:        number
  rulerMode?:       boolean
  onRulerMeasure?:  (dist: number) => void
}

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch { return false }
}

export default function Viewport3D({
  objects, selectedIds, onSelect, onMultiSelect, onFpsUpdate, fitViewRef, resetViewRef,
  gizmoMode, onTransformEnd, snapValue, rulerMode = false, onRulerMeasure,
}: Props) {
  const [webglOk,    setWebglOk]    = useState<boolean | null>(null)
  const [cubeCamera, setCubeCamera] = useState<THREE.PerspectiveCamera | null>(null)
  const [cubeCtrl,   setCubeCtrl]   = useState<OrbitControls | null>(null)
  const [dragRect,   setDragRect]   = useState<DragRect | null>(null)

  const containerRef   = useRef<HTMLDivElement>(null)
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef       = useRef<THREE.Scene | null>(null)
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef    = useRef<OrbitControls | null>(null)
  const transformCtRef = useRef<TransformControls | null>(null)
  const meshMapRef     = useRef<Map<string, THREE.Mesh>>(new Map())
  const rafRef         = useRef<number | null>(null)
  const fpsRef         = useRef({ last: performance.now(), frames: 0 })
  const fitTargetRef   = useRef<FitTarget | null>(null)

  // Ruler
  const rulerPointsRef    = useRef<THREE.Vector3[]>([])
  const rulerLineRef      = useRef<THREE.Line | null>(null)
  const rulerMarkersRef   = useRef<THREE.Mesh[]>([])
  const rulerModeRef      = useRef(rulerMode)
  const onRulerMeasureRef = useRef(onRulerMeasure)
  useEffect(() => { rulerModeRef.current = rulerMode }, [rulerMode])
  useEffect(() => { onRulerMeasureRef.current = onRulerMeasure }, [onRulerMeasure])

  const onTransformEndRef = useRef(onTransformEnd)
  useEffect(() => { onTransformEndRef.current = onTransformEnd }, [onTransformEnd])

  const snapValueRef = useRef(snapValue)
  useEffect(() => { snapValueRef.current = snapValue }, [snapValue])

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef  = useRef(false)

  useEffect(() => { setWebglOk(checkWebGL()) }, [])

  // ---- Init Three.js ----
  useEffect(() => {
    if (!webglOk) return
    const container = containerRef.current
    if (!container) return

    const w = container.clientWidth
    const h = container.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, failIfMajorPerformanceCaveat: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x1e1e2e)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000)
    camera.position.set(80, 80, 120)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    scene.add(new THREE.AmbientLight(0xffffff, 0.45))

    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(100, 200, 150)
    sun.castShadow = true
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048
    sun.shadow.camera.left = sun.shadow.camera.bottom = -200
    sun.shadow.camera.right = sun.shadow.camera.top   =  200
    sun.shadow.camera.near = 0.1; sun.shadow.camera.far = 1000
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x8888ff, 0.4)
    fill.position.set(-100, 50, -80)
    scene.add(fill)

    const grid = new THREE.GridHelper(400, 40, 0x3a3a5c, 0x2a2a4a)
    grid.position.y = -0.5
    scene.add(grid)

    const groundGeo = new THREE.PlaneGeometry(400, 400)
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; ground.receiveShadow = true
    scene.add(ground)

    const axes = new THREE.AxesHelper(20)
    axes.position.set(-170, -0.4, -170)
    scene.add(axes)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.08
    controls.minDistance = 10; controls.maxDistance = 2000
    controls.maxPolarAngle = Math.PI / 2 + 0.1
    controlsRef.current = controls
    setCubeCamera(camera); setCubeCtrl(controls)

    const tc = new TransformControls(camera, renderer.domElement)
    tc.setSize(0.8)
    tc.addEventListener('dragging-changed', (e: { value: unknown }) => { controls.enabled = !e.value })
    tc.addEventListener('mouseUp', () => {
      const obj = (tc as unknown as { object: THREE.Object3D | undefined }).object
      if (!obj) return
      const id = obj.userData.objectId as string
      const pos = obj.position; const rot = obj.rotation
      const snap = snapValueRef.current
      const sx = snap > 0 ? Math.round(pos.x / snap) * snap : pos.x
      const sy = snap > 0 ? Math.round(pos.y / snap) * snap : pos.y
      const sz = snap > 0 ? Math.round(pos.z / snap) * snap : pos.z
      if (!meshMapRef.current.get(id)) return
      onTransformEndRef.current(id, {
        x: sx, y: sy, z: sz,
        rotX: THREE.MathUtils.radToDeg(rot.x),
        rotY: THREE.MathUtils.radToDeg(rot.y),
        rotZ: THREE.MathUtils.radToDeg(rot.z),
      })
    })
    scene.add((tc as unknown as { getHelper(): THREE.Object3D }).getHelper())
    transformCtRef.current = tc

    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth; const ch = container.clientHeight
      renderer.setSize(cw, ch); camera.aspect = cw / ch; camera.updateProjectionMatrix()
    })
    ro.observe(container)

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      const ft = fitTargetRef.current
      if (ft) {
        camera.position.lerp(ft.camPos, 0.12)
        controls.target.lerp(ft.target, 0.12)
        controls.update()
        if (camera.position.distanceTo(ft.camPos) < 0.5 && controls.target.distanceTo(ft.target) < 0.5) {
          camera.position.copy(ft.camPos); controls.target.copy(ft.target); fitTargetRef.current = null
        }
      } else { controls.update() }
      renderer.render(scene, camera)
      const now = performance.now()
      fpsRef.current.frames++
      if (now - fpsRef.current.last >= 500) {
        onFpsUpdate(Math.round(fpsRef.current.frames * 1000 / (now - fpsRef.current.last)))
        fpsRef.current = { last: now, frames: 0 }
      }
    }
    animate()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      ro.disconnect(); renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglOk])

  // ---- Гизмо режим ----
  useEffect(() => {
    type TC = { detach(): void; attach(o: THREE.Object3D): void; setMode(m: string): void }
    const tc  = transformCtRef.current as unknown as TC | null
    if (!tc) return
    if (gizmoMode === null || selectedIds.size === 0) { tc.detach(); return }
    const mesh = meshMapRef.current.get([...selectedIds][0])
    if (!mesh) { tc.detach(); return }
    tc.setMode(gizmoMode); tc.attach(mesh)
  }, [gizmoMode, selectedIds])

  // ---- FitView ----
  useEffect(() => {
    if (!fitViewRef) return
    fitViewRef.current = () => {
      const camera = cameraRef.current; const controls = controlsRef.current; const map = meshMapRef.current
      if (!camera || !controls) return
      if (map.size === 0) {
        fitTargetRef.current = { camPos: new THREE.Vector3(80, 80, 120), target: new THREE.Vector3(0,0,0) }; return
      }
      const box = new THREE.Box3()
      for (const mesh of map.values()) {
        mesh.geometry.computeBoundingBox()
        const mb = mesh.geometry.boundingBox
        if (mb) box.union(mb.clone().applyMatrix4(mesh.matrixWorld))
      }
      const center = new THREE.Vector3(); const size = new THREE.Vector3()
      box.getCenter(center); box.getSize(size)
      const dist = Math.max(size.x, size.y, size.z, 1) * 2.5
      fitTargetRef.current = { camPos: new THREE.Vector3(center.x + dist*0.6, center.y + dist*0.5, center.z + dist*0.8), target: center.clone() }
    }
  }, [fitViewRef])

  // ---- ResetView ----
  useEffect(() => {
    if (!resetViewRef) return
    resetViewRef.current = () => { fitTargetRef.current = { camPos: new THREE.Vector3(80, 80, 120), target: new THREE.Vector3(0,0,0) } }
  }, [resetViewRef])

  // ---- Ruler helpers ----
  const clearRulerVisuals = useCallback(() => {
    const scene = sceneRef.current; if (!scene) return
    if (rulerLineRef.current) { scene.remove(rulerLineRef.current); rulerLineRef.current.geometry.dispose(); rulerLineRef.current = null }
    for (const m of rulerMarkersRef.current) { scene.remove(m); m.geometry.dispose() }
    rulerMarkersRef.current = []
  }, [])

  const updateRulerVisuals = useCallback((pts: THREE.Vector3[]) => {
    const scene = sceneRef.current; if (!scene) return
    clearRulerVisuals()
    const mat = new THREE.LineBasicMaterial({ color: '#facc15', linewidth: 2 })
    const geo = new THREE.BufferGeometry()
    const pos: number[] = pts.flatMap(p => [p.x, p.y, p.z])
    if (pts.length === 1) pos.push(pts[0].x, pts[0].y, pts[0].z) // degenerate line
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const line = new THREE.Line(geo, mat)
    scene.add(line); rulerLineRef.current = line

    for (const p of pts) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#facc15' }),
      )
      m.position.copy(p); scene.add(m); rulerMarkersRef.current.push(m)
    }
  }, [clearRulerVisuals])

  // Clear ruler when ruler mode turns off
  useEffect(() => {
    if (!rulerMode) {
      rulerPointsRef.current = []
      clearRulerVisuals()
    }
  }, [rulerMode, clearRulerVisuals])

  // ---- Drag-select helpers ----
  const performDragSelect = useCallback((rect: DragRect) => {
    const camera    = cameraRef.current
    const container = containerRef.current
    if (!camera || !container) return

    const cw = container.clientWidth, ch = container.clientHeight
    const minX = (Math.min(rect.startX, rect.endX) / cw) * 2 - 1
    const maxX = (Math.max(rect.startX, rect.endX) / cw) * 2 - 1
    const minY = -((Math.max(rect.startY, rect.endY) / ch) * 2 - 1)
    const maxY = -((Math.min(rect.startY, rect.endY) / ch) * 2 - 1)

    const selected: string[] = []
    for (const [id, mesh] of meshMapRef.current) {
      if (!mesh.visible) continue
      mesh.geometry.computeBoundingSphere()
      const sphere = mesh.geometry.boundingSphere
      if (!sphere) continue
      const center = sphere.center.clone().applyMatrix4(mesh.matrixWorld)
      const ndc    = center.project(camera)
      if (ndc.x >= minX && ndc.x <= maxX && ndc.y >= minY && ndc.y <= maxY) selected.push(id)
    }
    if (selected.length > 0) {
      if (onMultiSelect) onMultiSelect(selected)
      else onSelect(selected[0], false)
    }
  }, [onSelect, onMultiSelect])

  // ---- Click / Drag ----
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    pointerDownPos.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current  = false
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 || !pointerDownPos.current) return
    const dx = e.clientX - pointerDownPos.current.x
    const dy = e.clientY - pointerDownPos.current.y
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      isDraggingRef.current = true
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const tc = transformCtRef.current as unknown as { dragging?: boolean } | null
      if (tc?.dragging) return
      setDragRect({
        startX: pointerDownPos.current.x - rect.left,
        startY: pointerDownPos.current.y - rect.top,
        endX:   e.clientX - rect.left,
        endY:   e.clientY - rect.top,
      })
    }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (isDraggingRef.current && dragRect) {
      const w = Math.abs(dragRect.endX - dragRect.startX)
      const h = Math.abs(dragRect.endY - dragRect.startY)
      if (w > 10 && h > 10) performDragSelect(dragRect)
    }
    setDragRect(null)
    isDraggingRef.current = false
    pointerDownPos.current = null
  }, [dragRect, performDragSelect])

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!pointerDownPos.current) return
    if (isDraggingRef.current) return

    const container = containerRef.current; const scene = sceneRef.current; const camera = cameraRef.current
    if (!container || !scene || !camera) return

    const rect = container.getBoundingClientRect()
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)

    // ---- Ruler mode ----
    if (rulerModeRef.current) {
      let pt: THREE.Vector3 | null = null
      const hits = raycaster.intersectObjects([...meshMapRef.current.values()], false)
      if (hits.length > 0) {
        pt = hits[0].point.clone()
      } else {
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
        const gp = new THREE.Vector3()
        if (raycaster.ray.intersectPlane(groundPlane, gp)) pt = gp
      }
      if (!pt) return

      const pts = rulerPointsRef.current
      pts.push(pt)
      updateRulerVisuals(pts)

      if (pts.length >= 2) {
        const dist = pts[0].distanceTo(pts[1])
        onRulerMeasureRef.current?.(dist)
        setTimeout(() => {
          rulerPointsRef.current = []
          clearRulerVisuals()
        }, 4000)
      }
      return
    }

    // ---- Normal select ----
    const hits = raycaster.intersectObjects([...meshMapRef.current.values()], false)
    if (hits.length === 0) onSelect(null, false)
    else onSelect((hits[0].object as THREE.Mesh).userData.objectId as string, e.shiftKey || e.ctrlKey || e.metaKey)
  }, [onSelect, updateRulerVisuals, clearRulerVisuals])

  // ---- Sync objects → THREE meshes ----
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const map   = meshMapRef.current
    const inIds = new Set(objects.map(o => o.id))

    for (const [id, mesh] of map) {
      if (!inIds.has(id)) { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); map.delete(id) }
    }

    for (const obj of objects) {
      if (!obj.visible) { if (map.has(obj.id)) map.get(obj.id)!.visible = false; continue }
      const isSelected = selectedIds.has(obj.id)
      const baseColor  = new THREE.Color(obj.color)
      const emissive   = isSelected ? new THREE.Color(0x3333aa) : new THREE.Color(0x000000)

      if (map.has(obj.id)) {
        const mesh = map.get(obj.id)!
        mesh.visible = true
        const geo = mesh.geometry
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
        if (posAttr.array !== obj.vertices) {
          geo.setAttribute('position', new THREE.BufferAttribute(obj.vertices, 3))
          geo.setIndex(new THREE.BufferAttribute(obj.indices, 1))
          geo.computeVertexNormals(); geo.computeBoundingBox()
        }
        const mat = mesh.material as THREE.MeshPhongMaterial
        mat.color.set(baseColor); mat.emissive.set(emissive)
      } else {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(obj.vertices, 3))
        geo.setIndex(new THREE.BufferAttribute(obj.indices, 1))
        geo.computeVertexNormals(); geo.computeBoundingBox()
        const mat = new THREE.MeshPhongMaterial({ color: baseColor, emissive, specular: new THREE.Color(0x333333), shininess: 40, side: THREE.DoubleSide })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.objectId = obj.id
        scene.add(mesh); map.set(obj.id, mesh)
      }
    }
  }, [objects, selectedIds])

  if (webglOk === false) return <WebGLFallback />

  const rectStyle = dragRect ? {
    left:   Math.min(dragRect.startX, dragRect.endX),
    top:    Math.min(dragRect.startY, dragRect.endY),
    width:  Math.abs(dragRect.endX - dragRect.startX),
    height: Math.abs(dragRect.endY - dragRect.startY),
  } : null

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        style={{ width: '100%', height: '100%', cursor: rulerMode ? 'crosshair' : 'default' }}
      />

      {/* Drag-select overlay */}
      {rectStyle && (
        <div style={{
          position: 'absolute', pointerEvents: 'none',
          border: '1px dashed rgba(137,180,250,0.8)', background: 'rgba(137,180,250,0.07)',
          borderRadius: 2, ...rectStyle,
        }} />
      )}

      {/* Ruler hint overlay */}
      {rulerMode && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(19,19,31,0.85)', border: '1px solid rgba(250,204,21,0.5)',
          borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#facc15',
          pointerEvents: 'none',
        }}>
          📏 Линейка: нажмите две точки для измерения
        </div>
      )}

      {cubeCamera && cubeCtrl && (
        <ViewCube mainCamera={cubeCamera} mainControls={cubeCtrl} />
      )}
    </div>
  )
}
