// ============================================================
// ortho-raycast.test.tsx — ORTHO-RAYCAST: луч из курсора по камере вида
// ============================================================
// Вид — как во вьюпорте (viewport-hooks.useThreeInit): перспективная камера (FOV 45°, up = Z) ведёт,
// ортографическая каждый кадр копирует её положение и поворот, полувысота = расстояние до цели ×
// tan 22,5°. В ортографии точка под курсором — по лучу ОРТО-камеры (линейка, гизмо). Раньше линейка
// брала перспективную камеру и формулу «направление от позиции камеры»: у края вида — промах.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { rayFromCamera, groundPointOnRay, syncGizmoCamera, ndcFromClient } from '../components/view-ray'

const W = 880, H = 776
const TARGET = new THREE.Vector3(0, 0, 0)

/** Вид как во вьюпорте; `from` — позиция камеры (по умолчанию — стартовый вид (150, −200, 120)). */
function cameras(from = new THREE.Vector3(150, -200, 120)) {
  const persp = new THREE.PerspectiveCamera(45, W / H, 0.1, 10000)
  persp.up.set(0, 0, 1)
  persp.position.copy(from)
  persp.lookAt(TARGET)
  persp.updateMatrixWorld(); persp.updateProjectionMatrix()
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000)
  ortho.up.set(0, 0, 1)
  ortho.position.copy(persp.position)
  ortho.quaternion.copy(persp.quaternion)
  const halfH = persp.position.distanceTo(TARGET) * Math.tan(THREE.MathUtils.degToRad(22.5))
  ortho.left = -halfH * (W / H); ortho.right = halfH * (W / H); ortho.top = halfH; ortho.bottom = -halfH
  ortho.updateProjectionMatrix(); ortho.updateMatrixWorld()
  return { persp, ortho }
}
const ndcOf = (p: THREE.Vector3, cam: THREE.Camera) => { const v = p.clone().project(cam); return new THREE.Vector2(v.x, v.y) }
/** Прежняя формула линейки: точка NDC на плоскости z = 0 «от позиции камеры» (верна только для перспективы). */
function oldGroundPoint(ndc: THREE.Vector2, camera: THREE.Camera): THREE.Vector3 | null {
  const p = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(camera)
  const dir = p.sub(camera.position).normalize()
  const d = (0 - camera.position.z) / dir.z
  return Number.isFinite(d) && d >= 0 ? camera.position.clone().add(dir.multiplyScalar(d)) : null
}

describe('rayFromCamera / groundPointOnRay — ортография', () => {
  it.each([
    ['центр вида', new THREE.Vector3(0, 0, 0)],
    ['край вида (слева)', new THREE.Vector3(-110, -60, 0)],
    ['край вида (справа)', new THREE.Vector3(100, 80, 0)],
  ])('%s: точка сетки под курсором — та же точка', (_n, P) => {
    const { ortho } = cameras()
    const ndc = ndcOf(P, ortho)
    expect(Math.abs(ndc.x)).toBeGreaterThan(_n === 'центр вида' ? -1 : 0.6)   // у края: |x| > 0,6
    expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
    const g = groundPointOnRay(rayFromCamera(ndc, ortho), 0)!
    expect(g.distanceTo(P)).toBeLessThan(1e-6)
  })

  it('луч орто попадает в точку на высоте (верх объекта у края), не только на сетке', () => {
    const { ortho } = cameras()
    const P = new THREE.Vector3(-150, -40, 40)
    const ray = rayFromCamera(ndcOf(P, ortho), ortho).ray
    expect(ray.distanceToPoint(P)).toBeLessThan(1e-6)
  })

  it('было: перспективная камера в орто-виде — промах растёт к краю (в центре — точно)', () => {
    const { persp, ortho } = cameras()
    const miss = (P: THREE.Vector3) => groundPointOnRay(rayFromCamera(ndcOf(P, ortho), persp), 0)!.distanceTo(P)
    expect(miss(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-6)
    const mid = miss(new THREE.Vector3(-80, -30, 0))
    const edge = miss(new THREE.Vector3(-110, -60, 0))
    expect(mid).toBeGreaterThan(5)
    expect(edge).toBeGreaterThan(mid)
  })

  it('было: формула «от позиции камеры» с орто-камерой — промах у края; сейчас — 0', () => {
    const { ortho } = cameras()
    const P = new THREE.Vector3(100, 80, 0)
    const ndc = ndcOf(P, ortho)
    const old = oldGroundPoint(ndc, ortho)
    expect(old === null || old.distanceTo(P) > 5).toBe(true)
    expect(groundPointOnRay(rayFromCamera(ndc, ortho), 0)!.distanceTo(P)).toBeLessThan(1e-6)
  })

  it('перспектива — как раньше: новая и прежняя формула совпадают', () => {
    const { persp } = cameras()
    const P = new THREE.Vector3(-120, 70, 0)
    const ndc = ndcOf(P, persp)
    const g = groundPointOnRay(rayFromCamera(ndc, persp), 0)!
    expect(g.distanceTo(P)).toBeLessThan(1e-6)
    expect(g.distanceTo(oldGroundPoint(ndc, persp)!)).toBeLessThan(1e-6)
  })

  it('плоскость позади камеры — null (линейка не ставит точку)', () => {
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)
    cam.position.set(0, 0, 10); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 100); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
    expect(groundPointOnRay(rayFromCamera(new THREE.Vector2(0.3, 0.5), cam), 0)).toBeNull()
  })

  it('ndcFromClient: углы и центр прямоугольника вида', () => {
    const rect = { left: 320, top: 50, width: W, height: H }
    expect(ndcFromClient(320, 50, rect).toArray()).toEqual([-1, 1])
    expect(ndcFromClient(320 + W, 50 + H, rect).toArray()).toEqual([1, -1])
    expect(ndcFromClient(320 + W / 2, 50 + H / 2, rect).toArray()).toEqual([0, 0])
  })
})

describe('syncGizmoCamera — гизмо на камере вида', () => {
  function gizmoAt(pos: THREE.Vector3, camera: THREE.Camera) {
    const tc = new TransformControls(camera, document.createElement('div'))
    tc.setSize(0.8); tc.setSpace('world')
    const obj = new THREE.Object3D(); obj.position.copy(pos)
    const scene = new THREE.Scene(); scene.add(obj)
    const helper = (tc as unknown as { getHelper(): THREE.Object3D }).getHelper()
    scene.add(helper)
    tc.attach(obj)
    return { tc, helper, scene }
  }
  type Pointer = { x: number; y: number; button: number }
  type TcApi = { pointerHover(p: Pointer): void; pointerDown(p: Pointer): void; pointerMove(p: Pointer): void; pointerUp(p: Pointer): void; axis: string | null }
  /**
   * Перетаскивание ручки X в орто-виде на `d` (NDC) вдоль экранного направления оси X: ручка — первая
   * точка от центра объекта, где гизмо ловит ось X. Возвращает, на сколько (NDC) сдвинулся объект на
   * экране вдоль той же оси — куб «за мышью», если ≈ d.
   */
  function dragX(tc: TransformControls, helper: THREE.Object3D, obj: THREE.Object3D, viewCam: THREE.Camera, d: number): number | null {
    const api = tc as unknown as TcApi
    helper.updateMatrixWorld(true)
    const c0 = ndcOf(obj.position, viewCam)
    const dir = ndcOf(obj.position.clone().add(new THREE.Vector3(1, 0, 0)), viewCam).sub(c0).normalize()
    let p: THREE.Vector2 | null = null
    for (let s = 0.01; s < 0.4 && !p; s += 0.005) {
      const q = c0.clone().addScaledVector(dir, s)
      api.pointerHover({ x: q.x, y: q.y, button: 0 })
      if (api.axis === 'X') p = q
    }
    if (!p) return null
    api.pointerDown({ x: p.x, y: p.y, button: 0 })
    // перетаскивание — button −1 (кнопка зажата, как getPointer у TransformControls)
    for (let k = 1; k <= 10; k++) api.pointerMove({ x: p.x + (dir.x * d * k) / 10, y: p.y + (dir.y * d * k) / 10, button: -1 })
    api.pointerUp({ x: p.x + dir.x * d, y: p.y + dir.y * d, button: 0 })
    obj.updateMatrixWorld()
    return ndcOf(obj.position, viewCam).sub(c0).dot(dir)
  }

  it('камера гизмо переключается на орто и обратно; повтор — без изменений', () => {
    const { persp, ortho } = cameras()
    const { tc } = gizmoAt(new THREE.Vector3(), persp)
    const g = tc as unknown as { camera: THREE.Camera }
    expect(syncGizmoCamera(g, ortho)).toBe(true)
    expect(g.camera).toBe(ortho)
    expect(syncGizmoCamera(g, ortho)).toBe(false)
    expect(syncGizmoCamera(g, persp)).toBe(true)
    expect(g.camera).toBe(persp)
    expect(syncGizmoCamera(null, ortho)).toBe(false)
  })

  // Вид спереди (ось X параллельна экрану — сдвиг вдоль X на экране = сдвигу мыши), объект у левого
  // края и глубже цели камеры (y = 80): там масштаб перспективы ≠ масштабу орто
  const FRONT = new THREE.Vector3(0, -300, 0)
  const AT = new THREE.Vector3(-90, 80, 30)

  it('орто-вид, объект у края: ручка X ловится, объект идёт за мышью (камера гизмо — орто)', () => {
    const { persp, ortho } = cameras(FRONT)
    expect(ndcOf(AT, ortho).x).toBeLessThan(-0.6)
    const { tc, helper } = gizmoAt(AT.clone(), persp)
    syncGizmoCamera(tc as unknown as { camera: THREE.Camera }, ortho)
    const obj = (tc as unknown as { object: THREE.Object3D }).object
    const shift = dragX(tc, helper, obj, ortho, 0.2)
    expect(shift).not.toBeNull()
    expect(Math.abs(shift! - 0.2)).toBeLessThan(1e-3)
  })

  it('было: гизмо на перспективной камере в орто-виде — объект НЕ за мышью', () => {
    const { persp, ortho } = cameras(FRONT)
    const { tc, helper } = gizmoAt(AT.clone(), persp)
    const obj = (tc as unknown as { object: THREE.Object3D }).object
    const shift = dragX(tc, helper, obj, ortho, 0.2)
    expect(shift).not.toBeNull()                                  // ручка ловится, но…
    expect(Math.abs(shift! - 0.2)).toBeGreaterThan(0.02)            // …объект не за мышью
  })
})
