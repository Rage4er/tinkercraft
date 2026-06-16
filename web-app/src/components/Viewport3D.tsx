import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SceneObject } from '../csg/types'
import WebGLFallback from './WebGLFallback'

interface Props {
  objects: SceneObject[]
  selectedIds: Set<string>
  onSelect: (id: string | null, addToSelection: boolean) => void
  onFpsUpdate: (fps: number) => void
}

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return !!ctx
  } catch {
    return false
  }
}

export default function Viewport3D({ objects, selectedIds, onSelect, onFpsUpdate }: Props) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef  = useRef<OrbitControls | null>(null)
  const meshMapRef   = useRef<Map<string, THREE.Mesh>>(new Map())
  const rafRef       = useRef<number | null>(null)
  const fpsRef       = useRef({ last: performance.now(), frames: 0 })

  // ---- WebGL check ----
  useEffect(() => {
    setWebglOk(checkWebGL())
  }, [])

  // ---- Init Three.js ----
  useEffect(() => {
    if (!webglOk) return
    const container = containerRef.current
    if (!container) return

    const w = container.clientWidth
    const h = container.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      failIfMajorPerformanceCaveat: false,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x1e1e2e)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000)
    camera.position.set(80, 80, 120)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.45)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(100, 200, 150)
    sun.castShadow = true
    sun.shadow.mapSize.width  = 2048
    sun.shadow.mapSize.height = 2048
    sun.shadow.camera.near = 0.1
    sun.shadow.camera.far  = 1000
    sun.shadow.camera.left = sun.shadow.camera.bottom = -200
    sun.shadow.camera.right = sun.shadow.camera.top   =  200
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x8888ff, 0.4)
    fill.position.set(-100, 50, -80)
    scene.add(fill)

    // Grid (рабочая плоскость)
    const grid = new THREE.GridHelper(400, 40, 0x3a3a5c, 0x2a2a4a)
    grid.position.y = -0.5
    scene.add(grid)

    // Ground plane for shadows
    const groundGeo = new THREE.PlaneGeometry(400, 400)
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.5
    ground.receiveShadow = true
    scene.add(ground)

    // Axis helper (small, bottom-left)
    const axes = new THREE.AxesHelper(20)
    axes.position.set(-170, -0.4, -170)
    scene.add(axes)

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance   = 10
    controls.maxDistance   = 2000
    controls.maxPolarAngle = Math.PI / 2 + 0.1
    controlsRef.current = controls

    // Resize observer
    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      renderer.setSize(cw, ch)
      camera.aspect = cw / ch
      camera.updateProjectionMatrix()
    })
    ro.observe(container)

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)

      // FPS counter
      const now = performance.now()
      fpsRef.current.frames++
      if (now - fpsRef.current.last >= 500) {
        const fps = Math.round(fpsRef.current.frames * 1000 / (now - fpsRef.current.last))
        onFpsUpdate(fps)
        fpsRef.current = { last: now, frames: 0 }
      }
    }
    animate()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Click → raycast selection ----
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current
    const scene     = sceneRef.current
    const camera    = cameraRef.current
    if (!container || !scene || !camera) return

    const rect = container.getBoundingClientRect()
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)

    const meshes = [...meshMapRef.current.values()]
    const hits   = raycaster.intersectObjects(meshes, false)

    if (hits.length === 0) {
      onSelect(null, false)
    } else {
      const hitMesh = hits[0].object as THREE.Mesh
      const id = hitMesh.userData.objectId as string
      onSelect(id, e.shiftKey || e.ctrlKey || e.metaKey)
    }
  }, [onSelect])

  // ---- Sync objects → THREE meshes ----
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const map   = meshMapRef.current
    const inIds = new Set(objects.map(o => o.id))

    // Remove deleted
    for (const [id, mesh] of map) {
      if (!inIds.has(id)) {
        scene.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        map.delete(id)
      }
    }

    // Add or update
    for (const obj of objects) {
      if (!obj.visible) {
        if (map.has(obj.id)) {
          map.get(obj.id)!.visible = false
        }
        continue
      }

      const isSelected = selectedIds.has(obj.id)
      const baseColor  = new THREE.Color(obj.color)
      const emissive   = isSelected ? new THREE.Color(0x4444ff) : new THREE.Color(0x000000)

      if (map.has(obj.id)) {
        const mesh = map.get(obj.id)!
        mesh.visible = true

        // Update geometry if vertices changed
        const geo = mesh.geometry
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
        if (posAttr.array !== obj.vertices) {
          geo.setAttribute('position', new THREE.BufferAttribute(obj.vertices, 3))
          geo.setIndex(new THREE.BufferAttribute(obj.indices, 1))
          geo.computeVertexNormals()
          geo.computeBoundingBox()
        }

        const mat = mesh.material as THREE.MeshPhongMaterial
        mat.color.set(baseColor)
        mat.emissive.set(emissive)
      } else {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(obj.vertices, 3))
        geo.setIndex(new THREE.BufferAttribute(obj.indices, 1))
        geo.computeVertexNormals()
        geo.computeBoundingBox()

        const mat = new THREE.MeshPhongMaterial({
          color:    baseColor,
          emissive: emissive,
          specular: new THREE.Color(0x333333),
          shininess: 40,
          side: THREE.DoubleSide,
        })

        const mesh = new THREE.Mesh(geo, mat)
        mesh.castShadow    = true
        mesh.receiveShadow = true
        mesh.userData.objectId = obj.id
        scene.add(mesh)
        map.set(obj.id, mesh)
      }
    }
  }, [objects, selectedIds])

  if (webglOk === false) {
    return <WebGLFallback />
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
    />
  )
}
