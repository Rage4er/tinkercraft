// ============================================================
// ChildViewScene.tsx — CSG-CHILD-VIEW: маленький 3D-вид ребёнка CSG
// ============================================================
// Своя сцена/камера/renderer: выбранный ребёнок — заливкой, остальной CSG —
// каркасом (EdgesGeometry), камера вписана в ребёнка. OrbitControls — вращение.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ExtractedMesh } from '../csg/types'

export interface ChildViewSceneProps {
  child: ExtractedMesh | null
  /** Меш всего CSG-результата (для каркаса остального) */
  root: { vertices: Float32Array; indices: Uint32Array } | null
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

export default function ChildViewScene({ child, root, color = '#89b4fa' }: ChildViewSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !child || child.vertices.length < 9) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(host.clientWidth || 320, host.clientHeight || 240)
    renderer.domElement.className = 'child-view-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, (host.clientWidth || 320) / (host.clientHeight || 240), 0.1, 10000)
    camera.up.set(0, 0, 1)

    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(4, -6, 8)
    scene.add(dir)

    // Ребёнок — заливка + рёбра
    const childGeo = geometryOf(child.vertices, child.indices, child.normals)
    const mesh = new THREE.Mesh(childGeo, new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide,
    }))
    scene.add(mesh)
    const childEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(childGeo, 25),
      new THREE.LineBasicMaterial({ color: 0x1b1b2b, transparent: true, opacity: 0.75 }),
    )
    scene.add(childEdges)

    // Остальной CSG — каркас
    if (root && root.vertices.length >= 9 && root.indices.length >= 3) {
      const rootGeo = geometryOf(root.vertices, root.indices)
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(rootGeo, 25),
        new THREE.LineBasicMaterial({ color: 0x6c7086, transparent: true, opacity: 0.45 }),
      )
      scene.add(wire)
      rootGeo.dispose()
    }

    // Камера — по рамке ребёнка
    childGeo.computeBoundingBox()
    const box = childGeo.boundingBox ?? new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10))
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2)
    camera.position.set(center.x + radius * 2.2, center.y - radius * 2.2, center.z + radius * 1.8)
    camera.lookAt(center)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.update()

    let raf = 0
    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
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
  }, [child, root, color])

  return <div ref={hostRef} className="child-view-canvas-host" data-testid="child-view-scene" data-child-tris={child ? child.indices.length / 3 : 0} data-root-wireframe={root ? 1 : 0} />
}
