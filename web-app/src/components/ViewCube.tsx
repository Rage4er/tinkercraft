// ============================================================
// ViewCube — навигационный куб в углу вьюпорта
// Click on face → animated camera fly-to
// Drag → плавное вращение основной камеры (Z-up)
// ============================================================

import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

interface Props {
  mainCamera: THREE.PerspectiveCamera | null
  mainControls: { target: THREE.Vector3; update: () => void } | null
}

// Z-up coordinate system:
//   X = right, Y = depth (forward), Z = up (height)
// normal = direction FROM WHICH the camera looks at origin
// up     = camera.up at that view
const FACES: { label: string; normal: [number, number, number]; up: [number, number, number]; color: string }[] = [
  { label: 'Перед', normal: [0, 1, 0], up: [0, 0, 1], color: '#4a9eff' },
  { label: 'Зад', normal: [0, -1, 0], up: [0, 0, 1], color: '#3a8eef' },
  { label: 'Лево', normal: [-1, 0, 0], up: [0, 0, 1], color: '#5ba8ff' },
  { label: 'Право', normal: [1, 0, 0], up: [0, 0, 1], color: '#5ba8ff' },
  { label: 'Верх', normal: [0, 0, 1], up: [0, 1, 0], color: '#6abcff' },
  { label: 'Низ', normal: [0, 0, -1], up: [0, 1, 0], color: '#3a8eef' },
]

// Global animation generation counter — prevents stale closure issues
// when user clicks rapidly on different ViewCube faces.
let _animGen = 0

function animateTo(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  toPos: THREE.Vector3,
  toUp: THREE.Vector3,
  duration = 500,
) {
  const gen = ++_animGen // Capture current generation
  const fromPos = camera.position.clone()
  const fromUp = camera.up.clone()
  const target = controls.target.clone()
  const start = performance.now()

  function tick() {
    // FIX (MED-18-29): Skip if a newer animation has started
    if (gen !== _animGen) return
    const t = Math.min((performance.now() - start) / duration, 1)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    camera.position.lerpVectors(fromPos, toPos, e)
    camera.up.lerpVectors(fromUp, toUp, e).normalize()
    camera.lookAt(target)
    controls.update()
    if (t < 1) requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

export default function ViewCube({ mainCamera, mainControls }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cubeCamRef = useRef<THREE.PerspectiveCamera | null>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const rafRef = useRef<number | null>(null)
  const hoverRef = useRef<THREE.Mesh | null>(null)
  // FIX (LOW-18-25): Cache Raycaster to avoid allocation on every mouse move
  const raycasterRef = useRef(new THREE.Raycaster())

  // Drag state
  const pointerDownRef = useRef(false)
  const isDraggingRef = useRef(false)
  const dragLastRef = useRef({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0 })

  // Stable refs for main camera / controls (avoid stale closures in RAF loop)
  const mainCameraRef = useRef(mainCamera)
  const mainControlsRef = useRef(mainControls)
  useEffect(() => { mainCameraRef.current = mainCamera }, [mainCamera])
  useEffect(() => { mainControlsRef.current = mainControls }, [mainControls])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(100, 100)
    rendRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Mini camera — position doesn't matter much; quaternion is copied from main each frame
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.up.set(0, 0, 1)
    camera.position.set(0, -3.5, 0)
    camera.lookAt(0, 0, 0)
    cubeCamRef.current = camera

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(3, -2, 5)
    scene.add(dir)

    const meshes: THREE.Mesh[] = []
    FACES.forEach((face, i) => {
      const geo = new THREE.BoxGeometry(0.9, 0.9, 0.1)
      const mat = new THREE.MeshStandardMaterial({
        color: face.color, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.92,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.userData.faceIndex = i
      const [nx, ny, nz] = face.normal
      mesh.position.set(nx * 0.5, ny * 0.5, nz * 0.5)

      // Orient face panel perpendicular to its normal
      const faceNormal = new THREE.Vector3(nx, ny, nz)
      const defaultNormal = new THREE.Vector3(0, 0, 1)
      mesh.quaternion.setFromUnitVectors(defaultNormal, faceNormal)

      scene.add(mesh)
      meshes.push(mesh)
    })

    scene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: '#1e2d4a' }),
    ))
    scene.add(new THREE.AxesHelper(0.6))
    meshesRef.current = meshes

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const mc = mainCameraRef.current
      if (mc) {
        // Copy main camera quaternion so the cube mirrors the viewport orientation
        camera.quaternion.copy(mc.quaternion)
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(mc.quaternion)
        camera.position.copy(back).multiplyScalar(3.5)
      }
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // FIX (HIGH-18-17): Dispose all Three.js resources to prevent WebGL leaks
      renderer.dispose()
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            if (obj.geometry) obj.geometry.dispose()
            if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat.dispose())
            else obj.material.dispose()
          }
          if (obj instanceof THREE.LineSegments) {
            if (obj.geometry) obj.geometry.dispose()
            obj.material.dispose()
          }
        })
        sceneRef.current.clear()
      }
    }
  }, [])

  // ---- Hover helper ----
  const updateHover = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const camera = cubeCamRef.current
    const scene = sceneRef.current
    if (!canvas || !camera || !scene) return

    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    // FIX (LOW-18-25): Use cached Raycaster instead of creating new one
    const ray = raycasterRef.current
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(meshesRef.current, false)

    if (hoverRef.current) {
      (hoverRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
      hoverRef.current = null
    }
    if (hits.length) {
      const mesh = hits[0].object as THREE.Mesh
        ; (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x446688)
      hoverRef.current = mesh
    }
  }, [])

  // ---- Click: animate camera to clicked face ----
  const triggerFaceClick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const camera = cubeCamRef.current
    const scene = sceneRef.current
    const mc = mainCameraRef.current
    const controls = mainControlsRef.current
    if (!canvas || !camera || !scene || !mc || !controls) return

    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(meshesRef.current, false)
    if (!hits.length) return

    const fi = hits[0].object.userData.faceIndex as number
    const face = FACES[fi]
    const [nx, ny, nz] = face.normal
    const [ux, uy, uz] = face.up
    const target = controls.target.clone()
    const dist = mc.position.distanceTo(target) || 200
    const toPos = target.clone().add(new THREE.Vector3(nx, ny, nz).multiplyScalar(dist))
    const toUp = new THREE.Vector3(ux, uy, uz)
    animateTo(mc, controls, toPos, toUp)
  }, [])

  // ---- Drag: rotate main camera in Z-up spherical coordinates ----
  const applyDragDelta = useCallback((dx: number, dy: number) => {
    const mc = mainCameraRef.current
    const controls = mainControlsRef.current
    if (!mc || !controls) return

    const sensitivity = 0.007
    const offset = mc.position.clone().sub(controls.target)
    const r = offset.length()
    if (r < 0.001) return

    // Z-up spherical: θ = azimuth around Z, φ = elevation above XY plane
    const phi = Math.asin(Math.max(-1, Math.min(1, offset.z / r)))
    const theta = Math.atan2(offset.y, offset.x)

    const newTheta = theta - dx * sensitivity
    // Drag up (negative dy on screen) → clientY decreases → ddy < 0 → phi + ddy decreases
    // Invert: phi - ddy so dragging up raises the camera (phi increases)
    const newPhi = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, phi + dy * sensitivity))

    mc.position.set(
      controls.target.x + r * Math.cos(newPhi) * Math.cos(newTheta),
      controls.target.y + r * Math.cos(newPhi) * Math.sin(newTheta),
      controls.target.z + r * Math.sin(newPhi),
    )
    mc.up.set(0, 0, 1)
    mc.lookAt(controls.target)
    controls.update()
  }, [])

  // ---- Pointer events ----
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    ; (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    pointerDownRef.current = true
    isDraggingRef.current = false
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    dragLastRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerDownRef.current) {
      updateHover(e.clientX, e.clientY)
      return
    }
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) > 4) {
      isDraggingRef.current = true
    }
    if (isDraggingRef.current) {
      const ddx = e.clientX - dragLastRef.current.x
      const ddy = e.clientY - dragLastRef.current.y
      applyDragDelta(ddx, ddy)
      dragLastRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [updateHover, applyDragDelta])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasDragging = isDraggingRef.current
    pointerDownRef.current = false
    isDraggingRef.current = false
    if (!wasDragging) {
      triggerFaceClick(e.clientX, e.clientY)
    }
    // Clear hover highlight on release
    if (hoverRef.current) {
      (hoverRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
      hoverRef.current = null
    }
  }, [triggerFaceClick])

  const handlePointerLeave = useCallback(() => {
    if (hoverRef.current) {
      (hoverRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
      hoverRef.current = null
    }
  }, [])

  return (
    <div className="viewcube-container">
      <canvas
        ref={canvasRef}
        width={100}
        height={100}
        className="viewcube-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />
      <div className="viewcube-label">ViewCube</div>
    </div>
  )
}
