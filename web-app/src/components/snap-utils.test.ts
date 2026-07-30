import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  closestVertex,
  closestEdge,
  closestPointOnSegment,
  createSnapIndicator,
  removeSnapIndicators,
  snapLabel,
} from './snap-utils'

describe('closestPointOnSegment', () => {
  it('returns the from point when target is at from', () => {
    const from = new THREE.Vector3(0, 0, 0)
    const to = new THREE.Vector3(10, 0, 0)
    const target = new THREE.Vector3(0, 0, 0)
    const { point, distance } = closestPointOnSegment(from, to, target)
    expect(distance).toBe(0)
    expect(point.x).toBe(0)
    expect(point.y).toBe(0)
    expect(point.z).toBe(0)
  })

  it('returns the to point when target is at to', () => {
    const from = new THREE.Vector3(0, 0, 0)
    const to = new THREE.Vector3(10, 0, 0)
    const target = new THREE.Vector3(10, 0, 0)
    const { point, distance } = closestPointOnSegment(from, to, target)
    expect(distance).toBe(0)
    expect(point.x).toBe(10)
  })

  it('returns the midpoint when target is at midpoint', () => {
    const from = new THREE.Vector3(0, 0, 0)
    const to = new THREE.Vector3(10, 0, 0)
    const target = new THREE.Vector3(5, 5, 0)
    const { point, distance } = closestPointOnSegment(from, to, target)
    expect(point.x).toBe(5)
    expect(point.y).toBe(0)
    expect(distance).toBeCloseTo(5, 4)
  })

  it('clamps to segment endpoints when target is outside', () => {
    const from = new THREE.Vector3(0, 0, 0)
    const to = new THREE.Vector3(10, 0, 0)
    const target = new THREE.Vector3(20, 0, 0)
    const { point, distance } = closestPointOnSegment(from, to, target)
    expect(point.x).toBe(10)
    expect(distance).toBe(10)
  })

  it('handles degenerate segment (from === to)', () => {
    const from = new THREE.Vector3(5, 5, 5)
    const to = new THREE.Vector3(5, 5, 5)
    const target = new THREE.Vector3(0, 0, 0)
    const { point, distance } = closestPointOnSegment(from, to, target)
    expect(point.x).toBe(5)
    expect(point.y).toBe(5)
    expect(point.z).toBe(5)
    expect(distance).toBeCloseTo(Math.sqrt(75), 4)
  })
})

describe('closestVertex', () => {
  it('finds the closest vertex within threshold', () => {
    const verts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 10, 0),
    ]
    const target = new THREE.Vector3(0.5, 0.5, 0)
    const result = closestVertex(verts, target)
    expect(result).not.toBeNull()
    expect(result!.point.x).toBe(0)
    expect(result!.point.y).toBe(0)
    expect(result!.distance).toBeCloseTo(Math.sqrt(0.5), 4)
  })

  it('returns null when no vertex is within threshold', () => {
    const verts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, 0),
    ]
    const target = new THREE.Vector3(50, 0, 0)
    const result = closestVertex(verts, target)
    expect(result).toBeNull()
  })

  it('returns null for empty array', () => {
    const result = closestVertex([], new THREE.Vector3(0, 0, 0))
    expect(result).toBeNull()
  })
})

describe('closestEdge', () => {
  it('finds the closest point on the nearest edge', () => {
    const edges = [
      { from: new THREE.Vector3(0, 0, 0), to: new THREE.Vector3(10, 0, 0) },
      { from: new THREE.Vector3(0, 10, 0), to: new THREE.Vector3(10, 10, 0) },
    ]
    const target = new THREE.Vector3(5, 0.5, 0)
    const result = closestEdge(edges, target)
    expect(result).not.toBeNull()
    expect(result!.point.x).toBe(5)
    expect(result!.point.y).toBe(0)
    expect(result!.distance).toBeCloseTo(0.5, 4)
  })

  it('returns null when no edge is within threshold', () => {
    const edges = [
      { from: new THREE.Vector3(0, 0, 0), to: new THREE.Vector3(10, 0, 0) },
    ]
    const target = new THREE.Vector3(5, 100, 0)
    const result = closestEdge(edges, target)
    expect(result).toBeNull()
  })

  it('returns null for empty array', () => {
    const result = closestEdge([], new THREE.Vector3(0, 0, 0))
    expect(result).toBeNull()
  })
})

describe('snapLabel', () => {
  it('returns correct label for vertex', () => {
    expect(snapLabel('vertex')).toBe('Точка')
  })

  it('returns correct label for edge', () => {
    expect(snapLabel('edge')).toBe('Ребро')
  })

  it('returns correct label for face', () => {
    expect(snapLabel('face')).toBe('Грань')
  })

  it('returns correct label for circle', () => {
    expect(snapLabel('circle')).toBe('Центр')
  })

  it('returns empty string for null', () => {
    expect(snapLabel(null)).toBe('')
  })
})

describe('createSnapIndicator', () => {
  it('creates a mesh at the given point', () => {
    const point = new THREE.Vector3(1, 2, 3)
    const indicator = createSnapIndicator(point, 'vertex')
    expect(indicator.position.x).toBe(1)
    expect(indicator.position.y).toBe(2)
    expect(indicator.position.z).toBe(3)
    expect(indicator.userData.isSnapIndicator).toBe(true)
  })

  it('uses red color for vertex', () => {
    const indicator = createSnapIndicator(new THREE.Vector3(0, 0, 0), 'vertex')
    const mat = indicator.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(0xff4444)
  })

  it('uses green color for edge', () => {
    const indicator = createSnapIndicator(new THREE.Vector3(0, 0, 0), 'edge')
    const mat = indicator.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(0x44ff44)
  })

  it('uses blue color for circle', () => {
    const indicator = createSnapIndicator(new THREE.Vector3(0, 0, 0), 'circle')
    const mat = indicator.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(0x4488ff)
  })

  it('uses yellow color for face', () => {
    const indicator = createSnapIndicator(new THREE.Vector3(0, 0, 0), 'face')
    const mat = indicator.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(0xffff44)
  })

  it('uses white color for null type', () => {
    const indicator = createSnapIndicator(new THREE.Vector3(0, 0, 0), null)
    const mat = indicator.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(0xffffff)
  })
})

describe('removeSnapIndicators', () => {
  it('removes snap indicators from scene', () => {
    const scene = new THREE.Scene()
    const indicator = createSnapIndicator(new THREE.Vector3(0, 0, 0), 'vertex')
    scene.add(indicator)
    expect(scene.children.length).toBe(1)

    removeSnapIndicators(scene)
    expect(scene.children.length).toBe(0)
  })

  it('does nothing on null scene', () => {
    expect(() => removeSnapIndicators(null)).not.toThrow()
  })

  it('preserves non-indicator objects', () => {
    const scene = new THREE.Scene()
    const indicator = createSnapIndicator(new THREE.Vector3(0, 0, 0), 'vertex')
    const regularMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    )
    scene.add(indicator)
    scene.add(regularMesh)
    expect(scene.children.length).toBe(2)

    removeSnapIndicators(scene)
    expect(scene.children.length).toBe(1)
    expect(scene.children[0]).toBe(regularMesh)
  })
})
