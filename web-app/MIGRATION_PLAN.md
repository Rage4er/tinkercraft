# TinkerCraft Web — Migration Plan
> Java/JavaFX CaDoodle → Browser (Three.js + React + TypeScript + manifold-3d WASM)

## Phases Checklist

### ✅ Phase 0 — Project Bootstrap
- [x] Vite + React + TypeScript scaffold in `web-app/`
- [x] pnpm workspace, port 5000
- [x] Three.js r170 dependency
- [x] manifold-3d 3.0.1 WASM dependency
- [x] Zustand 5 state management
- [x] COOP/COEP headers for SharedArrayBuffer (WASM worker)
- [x] ErrorBoundary + WebGL fallback component

### ✅ Phase 1 — Core 3D Viewport
- [x] Three.js WebGLRenderer with antialias + shadows
- [x] PerspectiveCamera (FOV 45, near 0.1, far 10 000)
- [x] OrbitControls with damping + polar-angle limits
- [x] Grid + AxesHelper + shadow ground plane
- [x] Directional sun + fill lights
- [x] FPS counter (500 ms rolling average)
- [x] ViewCube overlay (face click → orbit → fixed view)
- [x] ViewCube gimbal-lock fix (quaternion copy, no lookAt)
- [x] ResizeObserver → renderer + camera aspect update
- [x] Fit-to-view (AABB, lerp animation)
- [x] Reset-view button (H key)

### ✅ Phase 2 — Primitive Shapes (CSG Worker)
- [x] Dedicated Web Worker running manifold-3d WASM
- [x] Correct `Manifold.cube([w,h,d])` axis order (Y-up)
- [x] Cube, sphere, cylinder, cone primitives
- [x] Worker → main-thread Float32Array + Uint32Array mesh transfer
- [x] Dynamic Three.js mesh creation from manifold output
- [x] Shape palette UI (icons + grid layout)
- [x] Shape search filter

### ✅ Phase 3 — Scene Management & Selection
- [x] Zustand DocumentStore (operations log + historyIndex)
- [x] Single-click raycasting for object selection
- [x] Shift/Ctrl multi-select
- [x] Drag-rectangle lasso select (NDC AABB)
- [x] TransformControls (translate/rotate/scale, G/R/S hotkeys)
- [x] Grid snap (0 / 0.1 / 0.5 / 1 / 5 / 10 mm)
- [x] Properties panel (X/Y/Z position, rotX/Y/Z, color picker, visibility)
- [x] Resize dims panel (W/H/D for cubes; radius, height for cylinder/cone/sphere)

### ✅ Phase 4 — CSG Boolean Operations
- [x] Union / Subtract / Intersect via worker CSG
- [x] Worker rebuilds manifold from operation log (rebuildScene)
- [x] Undo / Redo (historyIndex + rebuildFromHistory)
- [x] History timeline with per-type filter checkboxes
- [x] Jump-to-history (click on timeline step)
- [x] Copy / Paste (clipboard buffer in store)
- [x] Delete selected (Del / Backspace)

### ✅ Phase 5 — Advanced Operations
- [x] Mirror (YZ / XZ / XY planes)
- [x] Align selected objects (X/Y/Z, min/center/max anchor)
- [x] Fillet (cube only, radius slider)
- [x] Extrude (extend selected object ±X/Y/Z by depth, CSG union slab)
- [x] STL import (parseSTLFile, binary + ASCII)
- [x] STL export (binary, all visible objects merged)
- [x] .doodle file save/load (JSZip JSON serialisation)
- [x] Autosave to IndexedDB (session restore on reload)

### ✅ Phase 6 — UI Polish & Features
- [x] ComponentTree (object tree with rename on dblclick, visibility toggle, delete)
- [x] Object list tabs: flat list ↔ ComponentTree
- [x] ProjectManagerModal (IndexedDB multi-project CRUD: save/open/delete)
- [x] Ruler tool (two-click 3D distance measurement, Three.js line overlay, 4 s auto-clear)
- [x] Keyboard shortcuts: Ctrl+Z/Y, Del, F, H, G, R, S, Ctrl+A, Ctrl+C/V/S/O, Esc
- [x] Dark / Light theme toggle
- [x] PWA manifest.json + theme-color meta tag
- [x] Statusbar: CSG status, object count, triangle count, history, FPS, ruler mode, project status

### 🔜 Phase 7 — Future Work
- [ ] Torus, prism, pyramid primitives (manifold wrappers)
- [ ] Text → 3D extrusion (opentype.js)
- [ ] Perspective ↔ Orthographic projection toggle
- [ ] Dimensions / annotations overlay
- [ ] Collaborative editing (CRDT / WebSocket)
- [ ] STEP / IGES export (OpenCascade.js)
- [ ] Physical simulation (Rapier WASM)

---

## Architecture Notes

| Layer | Technology |
|---|---|
| UI / State | React 18 + Zustand 5 |
| 3D Render | Three.js r170 |
| CSG | manifold-3d 3.0.1 (WASM, dedicated Worker) |
| Persistence | IndexedDB (autosave + multi-project), JSZip (.doodle) |
| PWA | Vite + manifest.json + COOP/COEP headers |

## File Map
```
web-app/src/
  App.tsx                    ← main UI (toolbar, panels, viewport)
  App.css                    ← dark/light CSS variables + all component styles
  main.tsx                   ← React root
  csg/
    worker.ts                ← manifold-3d WASM worker (runs in Worker thread)
    worker-client.ts         ← typed RPC client for the worker
    types.ts                 ← all operation + scene-object types
  store/
    document-store.ts        ← Zustand store with full undo/redo + all actions
  components/
    Viewport3D.tsx           ← Three.js canvas, OrbitControls, TransformControls, ruler
    ViewCube.tsx             ← ViewCube overlay (fixed gimbal-lock)
    ComponentTree.tsx        ← object tree with rename/visibility/delete
    ProjectManagerModal.tsx  ← project CRUD modal (IndexedDB)
    ErrorBoundary.tsx        ← React error boundary
    WebGLFallback.tsx        ← shown when WebGL unavailable
  io/
    doodle-io.ts             ← .doodle JSZip serialisation
    stl-export.ts            ← binary STL export
    stl-import.ts            ← binary + ASCII STL import
    autosave.ts              ← IndexedDB session autosave
    project-manager.ts       ← IndexedDB multi-project CRUD
```
