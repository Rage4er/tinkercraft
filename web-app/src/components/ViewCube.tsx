// ============================================================
// ViewCube — навигационный куб в углу вьюпорта
// Клик на грань → анимированный перелёт камеры
// ============================================================

import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

interface Props {
  mainCamera: THREE.PerspectiveCamera | null
  mainControls: { target: THREE.Vector3; update: () => void } | null
}

const FACES: { label: string; normal: [number, number, number]; up: [number, number, number]; color: string }[] = [
  { label: 'Перед',  normal: [0,  0,  1], up: [0, 1, 0], color: '#4a9eff' },
  { label: 'Зад',    normal: [0,  0, -1], up: [0, 1, 0], color: '#3a8eef' },
  { label: 'Лево',   normal: [-1, 0,  0], up: [0, 1, 0], color: '#5ba8ff' },
  { label: 'Право',  normal: [1,  0,  0], up: [0, 1, 0], color: '#5ba8ff' },
  { label: 'Верх',   normal: [0,  1,  0], up: [0, 0, -1], color: '#6abcff' },
  { label: 'Низ',    normal: [0, -1,  0], up: [0, 0,  1], color: '#3a8eef' },
]

function animateTo(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  toPos: THREE.Vector3,
  toUp: THREE.Vector3,
  duration = 500,
) {
  const fromPos = camera.position.clone()
  const fromUp  = camera.up.clone()
  const target  = controls.target.clone()
  const start   = performance.now()

  function tick() {
    const t = Math.min((performance.now() - start) / duration, 1)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    camera.position.lerpVectors(fromPos, toPos, e)
    camera.up.lerpVectors(fromUp, toUp, e).normalize()
    camera.lookAt(target)
    controls.update()
    if (t < 1) requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

export default function ViewCube({ mainCamera, mainControls }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rendRef    = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef   = useRef<THREE.Scene | null>(null)
  const cubeCamRef = useRef<THREE.PerspectiveCamera | null>(null)
  const meshesRef  = useRef<THREE.Mesh[]>([])
  const rafRef     = useRef<number | null>(null)
  const hoverRef   = useRef<THREE.Mesh | null>(null)

  // Храним актуальные refs — избегаем stale closure в рендер-лупе
  const mainCameraRef   = useRef(mainCamera)
  const mainControlsRef = useRef(mainControls)
  useEffect(() => { mainCameraRef.current   = mainCamera },   [mainCamera])
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

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 3.5)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
    cubeCamRef.current = camera

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(3, 5, 3)
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

      // Orient face panel perpendicular to its normal using quaternion
      const faceNormal = new THREE.Vector3(nx, ny, nz)
      const defaultNormal = new THREE.Vector3(0, 0, 1) // BoxGeometry faces +Z by default
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
        // ---- Правильная синхронизация: копируем кватернион ----
        // Это исключает gimbal lock при виде сверху/снизу
        camera.quaternion.copy(mc.quaternion)
        // Располагаем мини-камеру на расстоянии 3.5 по направлению взгляда основной
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(mc.quaternion)
        camera.position.copy(back).multiplyScalar(3.5)
      }
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      renderer.dispose()
    }
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas   = canvasRef.current
    const camera   = cubeCamRef.current
    const scene    = sceneRef.current
    const mc       = mainCameraRef.current
    const controls = mainControlsRef.current
    if (!canvas || !camera || !scene || !mc || !controls) return

    const rect = canvas.getBoundingClientRect()
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(meshesRef.current, false)
    if (!hits.length) return

    const fi   = hits[0].object.userData.faceIndex as number
    const face = FACES[fi]
    const [nx, ny, nz] = face.normal
    const [ux, uy, uz] = face.up
    const target = controls.target.clone()
    const dist   = mc.position.distanceTo(target) || 200
    const toPos  = target.clone().add(new THREE.Vector3(nx, ny, nz).multiplyScalar(dist))
    const toUp   = new THREE.Vector3(ux, uy, uz)
    animateTo(mc, controls, toPos, toUp)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const camera = cubeCamRef.current
    const scene  = sceneRef.current
    if (!canvas || !camera || !scene) return

    const rect = canvas.getBoundingClientRect()
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(meshesRef.current, false)

    if (hoverRef.current) {
      (hoverRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
      hoverRef.current = null
    }
    if (hits.length) {
      const mesh = hits[0].object as THREE.Mesh
      ;(mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x446688)
      hoverRef.current = mesh
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverRef.current) {
      (hoverRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
      hoverRef.current = null
    }
  }, [])

  return (
    <div style={{
      position: 'absolute', bottom: 40, right: 8, width: 100, height: 100,
      borderRadius: 8, overflow: 'hidden',
      border: '1px solid rgba(58,58,92,0.6)', background: 'rgba(19,19,31,0.7)',
      cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', zIndex: 10,
    }}>
      <canvas ref={canvasRef} width={100} height={100}
        onClick={handleClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        textAlign: 'center', fontSize: 9, color: 'rgba(137,180,250,0.8)',
        padding: '2px 0', background: 'rgba(19,19,31,0.5)', letterSpacing: '0.05em',
      }}>
        {FACES.map((f, i) => (
          <span key={i} style={{ display: 'none' }}>{f.label}</span>
        ))}
        ViewCube
      </div>
    </div>
  )
}
