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

// Грани куба: название, нормаль направления взгляда
const FACES: { label: string; normal: [number, number, number]; color: string }[] = [
  { label: 'Перед',  normal: [0,  0,  1], color: '#4a9eff' },
  { label: 'Зад',    normal: [0,  0, -1], color: '#3a8eef' },
  { label: 'Лево',   normal: [-1, 0,  0], color: '#5ba8ff' },
  { label: 'Право',  normal: [1,  0,  0], color: '#5ba8ff' },
  { label: 'Верх',   normal: [0,  1,  0], color: '#6abcff' },
  { label: 'Низ',    normal: [0, -1,  0], color: '#3a8eef' },
]

// Плавный перелёт камеры к новой позиции
function animateTo(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  toPos: THREE.Vector3,
  duration = 500,
) {
  const fromPos = camera.position.clone()
  const target  = controls.target.clone()
  const start   = performance.now()

  function tick() {
    const t = Math.min((performance.now() - start) / duration, 1)
    // easeInOut cubic
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    camera.position.lerpVectors(fromPos, toPos, e)
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
  const camRef     = useRef<THREE.PerspectiveCamera | null>(null)
  const meshesRef  = useRef<THREE.Mesh[]>([])
  const rafRef     = useRef<number | null>(null)
  const hoverRef   = useRef<THREE.Mesh | null>(null)

  // Инициализация mini-renderer
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
    camera.position.set(2, 2, 2)
    camera.lookAt(0, 0, 0)
    camRef.current = camera

    // Свет
    const amb = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(amb)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(3, 5, 3)
    scene.add(dir)

    // Грани куба (6 тонких боксов)
    const meshes: THREE.Mesh[] = []
    FACES.forEach((face, i) => {
      const geo = new THREE.BoxGeometry(0.9, 0.9, 0.1)
      const mat = new THREE.MeshStandardMaterial({
        color: face.color,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.userData.faceIndex = i

      // Размещаем каждую грань на нужной стороне
      const [nx, ny, nz] = face.normal
      mesh.position.set(nx * 0.5, ny * 0.5, nz * 0.5)

      // Ориентируем перпендикулярно нормали
      if (nx !== 0) mesh.rotation.y = Math.PI / 2
      else if (ny !== 0) mesh.rotation.x = Math.PI / 2

      scene.add(mesh)
      meshes.push(mesh)
    })

    // Рёбра куба
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: '#1e2d4a', linewidth: 1 }),
    )
    scene.add(edges)

    // Оси
    const axes = new THREE.AxesHelper(0.6)
    scene.add(axes)

    meshesRef.current = meshes

    // Рендер-луп
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)

      // Синхронизируем вращение с основной камерой
      if (mainCamera) {
        const dir = mainCamera.position.clone().sub(
          mainCamera.getWorldDirection(new THREE.Vector3()).negate(),
        ).normalize()
        camera.position.copy(
          mainCamera.position.clone().normalize().multiplyScalar(3.5),
        )
        camera.lookAt(0, 0, 0)
      }

      renderer.render(scene, camera)
    }
    loop()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      renderer.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Обновляем ссылку на mainCamera в рендер-лупе — через ref не нужен перезапуск
  const mainCameraRef = useRef(mainCamera)
  useEffect(() => { mainCameraRef.current = mainCamera }, [mainCamera])

  // Raycast при клике
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const camera = camRef.current
    const scene  = sceneRef.current
    if (!canvas || !camera || !scene || !mainCamera || !mainControls) return

    const rect = canvas.getBoundingClientRect()
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(meshesRef.current, false)
    if (!hits.length) return

    const fi = hits[0].object.userData.faceIndex as number
    const [nx, ny, nz] = FACES[fi].normal
    const target = mainControls.target.clone()
    const dist   = mainCamera.position.distanceTo(target) || 200
    const toPos  = target.clone().add(new THREE.Vector3(nx, ny, nz).multiplyScalar(dist))
    animateTo(mainCamera, mainControls, toPos)
  }, [mainCamera, mainControls])

  // Подсветка при hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const camera = camRef.current
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

    // Сброс предыдущего hover
    if (hoverRef.current) {
      const mat = hoverRef.current.material as THREE.MeshStandardMaterial
      mat.emissive.setHex(0x000000)
      hoverRef.current = null
    }

    if (hits.length) {
      const mesh = hits[0].object as THREE.Mesh
      const mat  = mesh.material as THREE.MeshStandardMaterial
      mat.emissive.setHex(0x446688)
      hoverRef.current = mesh
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverRef.current) {
      const mat = hoverRef.current.material as THREE.MeshStandardMaterial
      mat.emissive.setHex(0x000000)
      hoverRef.current = null
    }
  }, [])

  return (
    <div style={{
      position: 'absolute',
      bottom: 40,
      right: 8,
      width: 100,
      height: 100,
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid rgba(58,58,92,0.6)',
      background: 'rgba(19,19,31,0.7)',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      zIndex: 10,
    }}>
      <canvas
        ref={canvasRef}
        width={100}
        height={100}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      />
      {/* Подписи граней */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        textAlign: 'center', fontSize: 9, color: 'rgba(137,180,250,0.8)',
        padding: '2px 0', background: 'rgba(19,19,31,0.5)',
        letterSpacing: '0.05em',
      }}>
        Навигация
      </div>
    </div>
  )
}
