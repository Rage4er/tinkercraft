# TinkerCraft: план миграции Java/JavaFX → Web (Three.js)

> Составлен: июнь 2026  
> Проект: TinkerCraft-Application  
> Цель: полное воспроизведение UI и функциональности в браузере

---

## Общая оценка масштаба

| Метрика | Значение |
|---|---|
| Исходный код (только CaDoodle) | ~17 600 строк Java |
| Зависимость BowlerStudio | ~100 000+ строк Java |
| Ключевых подсистем | 8 |
| Оценочный объём JS/TS кода | ~35 000–50 000 строк |
| Реалистичные сроки (команда 2–3 чел.) | 12–18 месяцев |
| MVP без Robot Lab | 8–11 месяцев |

---

## Формат файла `.doodle`

Файл `.doodle` — это **ZIP-архив** с JSON внутри. Это нативный формат приложения: всё, что пользователь создаёт в CaDoodle, сохраняется в `.doodle`. `CaDoodleFile` сериализуется через Gson (Java). Полная совместимость с оригинальным форматом обязательна.

### TypeScript-типизация файла

```typescript
interface CaDoodleFile {
  version: string;
  operations: CaDoodleOperation[];
  thumbnail?: string; // base64 PNG
}

type CaDoodleOperation =
  | AddShapeOperation
  | MoveOperation
  | ResizeOperation
  | FilletOperation
  | MirrorOperation
  | AlignOperation
  | GroupOperation
  | DeleteOperation
  | HideShowOperation
  | ColorOperation;

interface AddShapeOperation {
  type: 'add_shape';
  id: string;
  shapeType: string;
  params: Record<string, number>;
  color: string; // hex
  transform: TransformNR;
}

interface MoveOperation {
  type: 'move';
  ids: string[];
  delta: { x: number; y: number; z: number };
}

interface ResizeOperation {
  type: 'resize';
  ids: string[];
  scale: { x: number; y: number; z: number };
  anchor: AnchorPoint;
}

interface FilletOperation {
  type: 'fillet';
  id: string;
  radius: number;
}

interface MirrorOperation {
  type: 'mirror';
  ids: string[];
  plane: 'XY' | 'XZ' | 'YZ';
}

interface AlignOperation {
  type: 'align';
  ids: string[];
  axis: 'X' | 'Y' | 'Z';
  anchor: 'min' | 'center' | 'max';
}

interface GroupOperation {
  type: 'group';
  ids: string[];
  isHull: boolean;
  isIntersect: boolean;
}

interface DeleteOperation   { type: 'delete';     ids: string[]; }
interface HideShowOperation { type: 'visibility'; ids: string[]; visible: boolean; }
interface ColorOperation    { type: 'color';      ids: string[]; color: string; }

interface TransformNR {
  x: number; y: number; z: number;
  rotX: number; rotY: number; rotZ: number;
}
```

---

## Стек технологий

| Java/JavaFX | Web-замена | Обоснование |
|---|---|---|
| JavaFX UI (FXML) | **React + TypeScript** | Компонентная модель близка к JavaFX Controller/FXML |
| BowlerStudio3dEngine | **Three.js** | Де-факто стандарт 3D в браузере |
| JCSG (CSG геометрия) | **manifold-3d (WASM)** | Google-проект, единственная JS-библиотека с производительностью уровня JCSG |
| JavaFX Affine/Transform | **Three.js Matrix4 + Quaternion** | Прямое математическое соответствие |
| Thread pool (ExecutorService) | **Web Workers + Comlink** | WASM CSG в воркере — UI не блокируется |
| ConfigurationDatabase | **IndexedDB (idb-keyval)** | Персистентные настройки без сервера |
| File I/O (File, Path) | **File System Access API + JSZip** | Чтение/запись `.doodle` файлов |
| STL/SVG/3MF импорт | **Three.js Loaders** | STLLoader, SVGLoader, ThreeMFLoader — встроены |
| Gradle + Java | **Vite + pnpm + TypeScript** | Быстрая сборка, HMR при разработке |

---

## Соответствие Java-классов TypeScript-аналогам

| Java класс | Строк | TypeScript аналог | Примечание |
|---|---|---|---|
| `SelectionSession.java` | 2998 | `SelectionSession.ts` + `useSelectionStore` | Разбивается на сервис и Zustand-стор |
| `MainController.java` | 1910 | `<App>` + `<Toolbar>` + `<ConfigPanel>` | Разбивается на 3+ компонента |
| `ResizeSessionManager.java` | 1098 | `ResizeHandle.ts` | Handles поверх Three.js |
| `ActiveProject.java` | 976 | `CaDoodleDocument.ts` + `useCaDoodleStore` | Иммутабельный стор + сервис |
| `ControlSprites.java` | 863 | `TransformGizmo.ts` | Three.js TransformControls как основа |
| `WorkplaneManager.java` | 734 | `WorkplaneManager.ts` | Three.js GridHelper + snap |
| `SettingsManager.java` | 720 | `<SettingsPanel>` + `useSettingsStore` | |
| `TimelineManager.java` | 663 | `<Timeline>` + `<TimelineButton>` | React компоненты |
| `ComponentTreePanel.java` | 675 | `<ComponentTree>` | React дерево |
| `RobotLab.java` | 593 | `<RobotLab>` | **Отложить на Фазу 6** |
| `ShapesPallet.java` | 407 | `<ShapesPalette>` | |
| `Main.java` | 404 | `main.tsx` + `App.tsx` | Точка входа |
| `MirrorHandle.java` | 377 | `MirrorTool.ts` | |
| `RotationHandle.java` | 375 | `RotationHandle.ts` | |
| `AlignHandle.java` | 353 | `AlignTool.ts` | |
| `ResizingHandle.java` | 431 | `ResizeHandle.ts` | |
| `ThreedNumber.java` | 414 | `<DimensionInput>` | React компонент |
| `ProjectManager.java` | 336 | `<ProjectManager>` | |
| `ExportManager.java` | 299 | `<ExportDialog>` + `exportService.ts` | |
| `RulerManager.java` | — | `RulerManager.ts` | CSS2DRenderer overlay |
| `SelectionBox.java` | 343 | Drag-select в SelectionSession | |

---

## Структура монорепозитория

```
cadoodle-web/
├── packages/
│   ├── csg-engine/           # manifold-3d обёртка + Web Worker
│   │   ├── src/
│   │   │   ├── csg-worker.ts         # Web Worker с manifold-3d
│   │   │   ├── CaDoodleDocument.ts   # двигатель операций + история
│   │   │   ├── operations/           # реализация каждого типа операции
│   │   │   │   ├── AddShape.ts
│   │   │   │   ├── Move.ts
│   │   │   │   ├── Resize.ts
│   │   │   │   ├── Fillet.ts
│   │   │   │   ├── Mirror.ts
│   │   │   │   ├── Align.ts
│   │   │   │   ├── Group.ts
│   │   │   │   └── Delete.ts
│   │   │   └── shapes/               # генераторы примитивов (куб, сфера, ...)
│   │   └── package.json
│   │
│   ├── file-format/          # парсер/сериализатор .doodle
│   │   ├── src/
│   │   │   ├── parser.ts             # ZIP → CaDoodleDocument
│   │   │   ├── serializer.ts         # CaDoodleDocument → ZIP
│   │   │   └── types.ts             # TypeScript типы (см. выше)
│   │   └── package.json
│   │
│   ├── three-viewport/       # Three.js сцена, камера, инструменты
│   │   ├── src/
│   │   │   ├── Viewport.ts           # основной renderer
│   │   │   ├── ViewCube.ts           # навигационный куб
│   │   │   ├── WorkplaneManager.ts   # рабочая плоскость + snap
│   │   │   ├── RulerManager.ts       # линейка (CSS2DRenderer)
│   │   │   └── tools/
│   │   │       ├── SelectionSession.ts
│   │   │       ├── MoveHandle.ts
│   │   │       ├── ResizeHandle.ts
│   │   │       ├── RotationHandle.ts
│   │   │       ├── MirrorTool.ts
│   │   │       ├── AlignTool.ts
│   │   │       ├── FilletTool.ts
│   │   │       └── ExtrudeTool.ts
│   │   └── package.json
│   │
│   └── ui/                   # React приложение (главный пакет)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Toolbar/
│       │   │   ├── ShapesPalette/
│       │   │   ├── ConfigPanel/
│       │   │   ├── ComponentTree/
│       │   │   ├── Timeline/
│       │   │   ├── ProjectManager/
│       │   │   ├── ExportDialog/
│       │   │   └── RobotLab/        # Фаза 6
│       │   ├── store/
│       │   │   ├── caDoodleStore.ts  # Zustand: документ + история
│       │   │   └── selectionStore.ts # Zustand: выделение
│       │   └── hooks/
│       ├── index.html
│       └── package.json
│
├── vite.config.ts
├── tsconfig.json
└── pnpm-workspace.yaml
```

---

## Фазы миграции

---

### Фаза 0 — Подготовка и прототип

**Длительность:** 2–3 недели  
**Цель:** убедиться, что технический стек работает до начала основной разработки. Устранить ключевые риски.

#### 0.1 Анализ и документирование формата `.doodle`

- Распаковать реальные `.doodle` файлы из оригинального приложения
- Задокументировать JSON-схему всех операций
- Написать полную TypeScript-типизацию (см. раздел выше)
- Написать фаззинг-тесты парсера на реальных файлах

#### 0.2 Прототип CSG в браузере — критический риск

Производительность булевых CSG-операций в браузере нужно измерить до начала разработки.

```javascript
// proof-of-concept
import Manifold from 'manifold-3d';
const wasm = await Manifold();

const cube   = wasm.cube([20, 20, 20], true);
const sphere = wasm.sphere(12, 32);
const result = cube.subtract(sphere); // аналог JCSG difference()
```

**Критерии приемлемости производительности:**

| Сложность меша | Целевое время |
|---|---|
| Простые примитивы (~100 треугольников) | < 20 мс |
| Средние объекты (~5 000 треугольников) | < 200 мс |
| Сложные операции (~50 000 треугольников) | < 2 000 мс (с индикатором загрузки) |

Если результаты неудовлетворительные → рассмотреть серверный CSG (Node.js воркер).

#### 0.3 Решение по Fillet

В `manifold-3d` нет прямого API для скруглений (fillet). Нужно выбрать подход:

| Подход | Точность | Производительность | Размер |
|---|---|---|---|
| Minkowski sum с малой сферой | ≈ средняя | Быстро | Мало |
| OpenCascade.js | Точно | Медленно | ~40 МБ WASM |
| Собственный edge chamfering | Приемлемо | Средне | Мало |

Решение принимается в конце Фазы 0 и фиксируется в ADR (Architecture Decision Record).

#### 0.4 Настройка монорепозитория

```bash
pnpm init
pnpm add -w -D vite typescript react @types/react
# Настройка pnpm-workspace.yaml, tsconfig strict, ESLint, Prettier
# CI: GitHub Actions (lint + typecheck + test)
```

**Deliverables Фазы 0:**
- [x] Полная TypeScript-типизация формата `.doodle` — `web-app/src/csg/types.ts`
- [x] CSG proof-of-concept с замерами производительности — работает в браузере
- [ ] ADR по методу реализации Fillet — требует отдельного исследования
- [x] Настроенный монорепозиторий — pnpm + Vite 6 + React 18 + TS strict
- [x] Three.js вьюпорт (свет, тени, сетка, OrbitControls, raycast-выбор)
- [x] Базовый UI: toolbar, shape palette, properties panel, statusbar

---

### Фаза 1 — Ядро: движок операций и история

**Длительность:** 4–6 недель  
**Цель:** реализовать хранилище состояния, полную историю undo/redo без UI.

#### 1.1 CaDoodleDocument (аналог `CaDoodleFile.java`)

```typescript
class CaDoodleDocument {
  private operations: readonly CaDoodleOperation[] = [];
  private cursor: number = 0;

  async addOperation(op: CaDoodleOperation): Promise<void> {
    // Обрезать "будущее" если были undo
    const ops = this.operations.slice(0, this.cursor);
    this.operations = [...ops, op];
    this.cursor = this.operations.length;
    await this.regenerateFrom(this.cursor - 1);
  }

  async back(): Promise<void> {  // undo
    if (this.cursor > 0) { this.cursor--; await this.regenerateFrom(this.cursor); }
  }

  async forward(): Promise<void> {  // redo
    if (this.cursor < this.operations.length) { this.cursor++; await this.regenerateFrom(this.cursor); }
  }

  // Регенерация = применить все операции с 0 до cursor
  private async regenerateFrom(fromIndex: number): Promise<void> { ... }
}
```

#### 1.2 CSG Worker

```typescript
// csg-worker.ts — выполняется в Web Worker, не блокирует UI
import Manifold from 'manifold-3d';

const wasm = await Manifold();

self.onmessage = async ({ data }) => {
  const { type, operation, state } = data;
  switch (type) {
    case 'apply':
      self.postMessage({ type: 'result', data: applyOperation(wasm, operation, state) });
      break;
    case 'regenerate':
      self.postMessage({ type: 'state', data: regenerateAll(wasm, data.operations) });
      break;
  }
};
```

#### 1.3 Реализация всех типов операций

Каждая операция — чистая функция без побочных эффектов:

```typescript
// operations/Resize.ts
export function applyResize(
  state: CSGState,
  op: ResizeOperation,
  wasm: ManifoldModule
): CSGState {
  return {
    ...state,
    objects: Object.fromEntries(
      Object.entries(state.objects).map(([id, obj]) =>
        op.ids.includes(id)
          ? [id, { ...obj, manifold: scaleManifold(wasm, obj.manifold, op.scale, op.anchor) }]
          : [id, obj]
      )
    )
  };
}
```

**Deliverables Фазы 1:**
- [ ] `CaDoodleDocument` с полным undo/redo
- [ ] CSG Worker со всеми 10 типами операций
- [ ] Парсер `.doodle` (файлы Java-версии открываются корректно)
- [ ] Сериализатор `.doodle` (созданные файлы открываются Java-версией)
- [ ] 100% покрытие unit-тестами движка операций

---

### Фаза 2 — 3D Вьюпорт

**Длительность:** 3–4 недели  
**Цель:** Three.js сцена, камера, навигация.

#### 2.1 Основная сцена (аналог `BowlerStudio3dEngine`)

```typescript
class CaDoodleViewport {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;      // аналог VirtualCameraMobileBase
  private workplane: WorkplaneGrid;
  private meshRegistry: Map<string, THREE.Mesh>;

  updateFromCSGState(state: CSGResult[]): void;  // перерисовать объекты
  setSelectedObjects(ids: string[]): void;         // highlight выделенных
  fitView(): void;                                 // аналог session.getFocusCenter()
  resetView(): void;                               // аналог homeViewButton
  getSnapshot(): string;                           // PNG base64 для thumbnail
}
```

#### 2.2 Конвертация manifold → Three.js Mesh

```typescript
function manifoldToThreeMesh(m: ManifoldObject): THREE.BufferGeometry {
  const mesh = m.getMesh();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
  geo.setIndex(Array.from(mesh.triVerts));
  geo.computeVertexNormals();
  return geo;
}
```

#### 2.3 Навигационный куб (аналог `ViewCube.java`)

Отдельный `<canvas>` 120×120px в углу. Второй маленький renderer, синхронизированный с камерой основной сцены.

```typescript
class ViewCube {
  private renderer: THREE.WebGLRenderer; // отдельный canvas
  private camera: THREE.OrthographicCamera;

  syncWithCamera(mainCamera: THREE.PerspectiveCamera): void;
  onClick(face: CubeFace): void; // плавный перелёт камеры к виду спереди/сзади/сверху
}
```

#### 2.4 Рабочая плоскость (аналог `WorkplaneManager.java`)

```typescript
class WorkplaneManager {
  private grid: THREE.GridHelper;
  private snapValue: number = 1.0; // мм

  snapToGrid(point: THREE.Vector3): THREE.Vector3;
  setSnapValue(mm: number): void;  // 0.1 / 0.5 / 1 / 5 / 10 мм
  attachToObject(id: string): void; // аналог onObjectWorkplane()
  resetToWorld(): void;
}
```

**Deliverables Фазы 2:**
- [x] Three.js сцена со светом и тенью
- [x] OrbitControls (вращение, панорамирование, зум)
- [x] Навигационный куб с анимированным перелётом
- [ ] Рабочая плоскость с настраиваемым snap
- [ ] Отражение теней от объектов на ground
- [ ] FitView / ResetView с анимацией

---

### Фаза 3 — Интерактивные инструменты

**Длительность:** 6–8 недель  
**Самая трудоёмкая фаза.**

#### 3.1 Выделение объектов (аналог `SelectionSession.java`, 2998 строк)

```typescript
class SelectionSession {
  private selected: Set<string> = new Set();
  private raycaster: THREE.Raycaster;

  onMouseClick(event: MouseEvent): void;        // клик → выделить
  onCtrlClick(event: MouseEvent): void;         // Ctrl+клик → добавить к выделению
  onDragSelect(start: Vector2, end: Vector2): void; // прямоугольное выделение

  addSelectionListener(cb: (ids: string[]) => void): void;
  clearSelection(): void;
}
```

#### 3.2 Инструмент перемещения (Move)

```typescript
class MoveHandle {
  // 3 стрелки (X=красный, Y=зелёный, Z=синий)
  // + 3 квадрата для перемещения в плоскости XY/XZ/YZ

  attach(ids: string[]): void;
  detach(): void;
  onAxisDrag(axis: 'X'|'Y'|'Z', delta: number): void;
  commit(): MoveOperation; // записать в историю
}
```

#### 3.3 Масштабирование — Resize (аналог `ResizeSessionManager.java`, 1098 строк)

Самый сложный handle — 8 угловых + 6 граневых ручек.

```typescript
class ResizeHandle {
  private handles: Map<HandlePosition, THREE.Mesh>;
  private boundingBox: THREE.Box3;

  // "Live mode" — preview без записи в историю (аналог Java resizeLiveMode)
  setLiveMode(enabled: boolean): void;
  onHandleDrag(position: HandlePosition, delta: THREE.Vector3): void;
  commit(): ResizeOperation;
}

type HandlePosition =
  'top-left-front' | 'top-right-front' | 'bottom-left-front' | 'bottom-right-front' |
  'top-left-back'  | 'top-right-back'  | 'bottom-left-back'  | 'bottom-right-back'  |
  'top-center' | 'bottom-center' | 'left-center' | 'right-center' | 'front-center' | 'back-center';
```

#### 3.4 Вращение (аналог `RotationHandle.java`)

```typescript
class RotationHandle {
  // 3 кольца — X (красное), Y (зелёное), Z (синее)
  attach(ids: string[]): void;
  onRingDrag(axis: THREE.Vector3, angleDeg: number): void;
  commit(): RotateOperation;
}
```

#### 3.5 Зеркалирование (аналог `MirrorHandle.java`)

```typescript
class MirrorTool {
  // Полупрозрачная плоскость + preview отражённого объекта
  showMirrorPlane(plane: 'XY'|'XZ'|'YZ'): void;
  hideMirrorPlane(): void;
  applyMirror(): MirrorOperation;
}
```

#### 3.6 Выравнивание (аналог `AlignHandle.java`)

```typescript
class AlignTool {
  // 9 позиций: лево/центр/право × низ/центр/верх × перед/центр/зад
  showAlignUI(ids: string[], container: HTMLElement): void;
  align(axis: 'X'|'Y'|'Z', anchor: 'min'|'center'|'max'): AlignOperation;
  distribute(axis: 'X'|'Y'|'Z'): AlignOperation;
}
```

#### 3.7 Скругление — Fillet (аналог `FilletUIManager`)

Подход определяется в Фазе 0 (ADR).

```typescript
class FilletTool {
  showFilletUI(objectId: string, container: HTMLElement): void;
  previewFillet(radius: number): void; // live preview без записи в историю
  applyFillet(radius: number): FilletOperation;
}
```

#### 3.8 Экструзия (аналог `ExtrudeUIManager`)

```typescript
class ExtrudeTool {
  selectFace(mesh: THREE.Mesh, faceIndex: number): void;
  showExtrudePreview(depth: number): void;
  applyExtrude(depth: number): ExtrudeOperation;
}
```

#### 3.9 Линейка (аналог `RulerManager`)

```typescript
// CSS2DRenderer для 2D-меток поверх 3D
class RulerManager {
  private labelRenderer: CSS2DRenderer;
  startMeasure(): void;
  stopMeasure(): void;
  showDistance(p1: THREE.Vector3, p2: THREE.Vector3): void;
  clear(): void;
}
```

#### 3.10 Клавиатурные привязки

| Клавиша | Действие | Java аналог |
|---|---|---|
| `Del` | Удалить выделенное | `onDelete` |
| `Ctrl+Z` | Undo | `onUndo` |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo | `onRedo` |
| `Ctrl+C` | Копировать | `onCopy` |
| `Ctrl+V` | Вставить | `onPaste` |
| `Ctrl+G` | Сгруппировать | `onGroup` |
| `Escape` | Снять выделение | — |
| `F` | Fit View | `onFitView` |

**Deliverables Фазы 3:**
- [ ] Выделение: клик, Ctrl+клик, drag-select
- [ ] Move handle с snap к сетке
- [ ] Resize handle (8 углов + 6 граней)
- [ ] Rotation handle (3 кольца)
- [ ] Mirror tool с preview
- [ ] Align tool (9 позиций)
- [ ] Fillet tool
- [ ] Extrude tool
- [ ] Линейка
- [ ] Все клавиатурные привязки

---

### Фаза 4 — UI Панели

**Длительность:** 4–5 недель  
**Цель:** полностью воспроизвести интерфейс оригинала.

#### 4.1 Структура React-компонентов (аналог `MainController.java`)

```
<App>
├── <Toolbar>               — верхняя панель
│   ├── <UndoRedoButtons>
│   ├── <ClipboardButtons>  (copy/paste/delete)
│   ├── <BooleanOpsMenu>    (Union/Intersection/XOR/Hull)
│   ├── <GroupButtons>      (group/ungroup)
│   ├── <TransformButtons>  (move/resize/rotate)
│   ├── <ToolButtons>       (fillet/extrude/mirror/align/ruler)
│   └── <ViewButtons>       (fitView/homeView/zoom+/zoom-)
├── <ShapesPalette>         — левый ящик с фигурами
│   ├── <CategorySelect>
│   ├── <SearchField>
│   └── <ShapeGrid>
│       └── <ShapeButton>   — превью в маленьком Three.js canvas
├── <Viewport3D>            — центральная 3D-область
│   ├── <ThreeCanvas>
│   ├── <ViewCube>
│   ├── <SnapGridSelector>
│   └── <MemoryIndicator>
├── <ConfigPanel>           — правая панель (когда объект выделен)
│   ├── <DimensionInputs>   (X/Y/Z позиция, W/H/D размер)
│   ├── <ColorPicker>
│   ├── <LockButton>
│   └── <VisibilityButton>
├── <ComponentTree>         — дерево компонентов
│   └── <TreeNode>
├── <Timeline>              — история операций
│   ├── <TimelineFilters>   — чекбоксы по типу операций
│   └── <TimelineScroll>
│       └── <TimelineButton>
└── Модальные диалоги:
    ├── <ProjectManager>
    └── <ExportDialog>
```

#### 4.2 Timeline (аналог `TimelineManager.java`, 663 строки)

```tsx
const Timeline: React.FC = () => {
  const { operations, cursor, jumpTo, filters } = useCaDoodleStore();

  const visibleOps = operations.filter(op => filters[op.type] !== false);

  return (
    <div className="timeline">
      <TimelineFilters />
      <div className="timeline-scroll">
        {visibleOps.map((op, i) => (
          <TimelineButton
            key={op.id}
            operation={op}
            isActive={i < cursor}
            isCurrent={i === cursor - 1}
            onClick={() => jumpTo(i + 1)}
          />
        ))}
      </div>
    </div>
  );
};
```

#### 4.3 Параметрические поля (аналог `ThreedNumber.java`, 414 строк)

```tsx
const DimensionInput: React.FC<{
  label: string;
  value: number;
  unit?: 'mm' | 'deg';
  min?: number;
  max?: number;
  onChange?: (v: number) => void;  // live preview
  onCommit: (v: number) => void;   // записать в историю
}> = ({ label, value, unit = 'mm', min = -9999, max = 9999, onChange, onCommit }) => {
  const [local, setLocal] = useState(value.toString());

  return (
    <div className="dimension-input">
      <label>{label}</label>
      <input
        type="number" value={local}
        onChange={e => { setLocal(e.target.value); onChange?.(parseFloat(e.target.value)); }}
        onBlur={() => onCommit(clamp(parseFloat(local), min, max))}
        onKeyDown={e => e.key === 'Enter' && onCommit(clamp(parseFloat(local), min, max))}
      />
      <span className="unit">{unit}</span>
    </div>
  );
};
```

#### 4.4 Zustand store (аналог `ActiveProject.java`)

```typescript
interface CaDoodleState {
  document: CaDoodleDocument | null;
  operations: CaDoodleOperation[];
  cursor: number;
  selection: string[];
  timelineFilters: Record<string, boolean>;

  addOperation: (op: CaDoodleOperation) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setSelection: (ids: string[]) => void;
  openFile: (file: File) => Promise<void>;
  saveFile: () => Promise<void>;
  newProject: () => void;
}

export const useCaDoodleStore = create<CaDoodleState>()(...);
```

**Deliverables Фазы 4:**
- [ ] Toolbar со всеми действиями
- [ ] ShapesPalette с категориями и поиском
- [ ] ConfigPanel (размеры + цвет + блокировка + видимость)
- [ ] ComponentTree
- [ ] Timeline с фильтрацией и переходом по клику
- [ ] Все панели сворачиваются/разворачиваются
- [ ] Тёмный / светлый режим (аналог CSS-стили JavaFX)

---

### Фаза 5 — Файловая система и экспорт

**Длительность:** 2–3 недели

#### 5.1 Открытие/сохранение `.doodle` файлов

```typescript
// Открыть файл (File System Access API)
async function openDoodleFile(): Promise<CaDoodleDocument> {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'CaDoodle File', accept: { 'application/zip': ['.doodle'] } }]
  });
  const file = await handle.getFile();
  const zip = await JSZip.loadAsync(file);
  const json = JSON.parse(await zip.file('model.json')!.async('string'));
  return parseDoodleDocument(json);
}

// Сохранить файл
async function saveDoodleFile(doc: CaDoodleDocument, viewport: CaDoodleViewport) {
  const zip = new JSZip();
  zip.file('model.json', JSON.stringify(serializeDoodleDocument(doc)));
  zip.file('thumbnail.png', viewport.getSnapshot().split(',')[1], { base64: true });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  if ('showSaveFilePicker' in window) {
    const h = await window.showSaveFilePicker({ suggestedName: 'project.doodle' });
    const w = await h.createWritable();
    await w.write(blob); await w.close();
  } else {
    // Fallback: браузерное скачивание
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: 'project.doodle'
    });
    a.click();
  }
}
```

#### 5.2 Экспорт

```typescript
import { STLExporter  } from 'three/examples/jsm/exporters/STLExporter';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

class ExportService {
  exportSTL(objects: THREE.Object3D[]): ArrayBuffer;         // двоичный STL
  exportGLTF(objects: THREE.Object3D[]): Promise<ArrayBuffer>; // GLTF/GLB (бонус)
  exportOBJ(objects: THREE.Object3D[]): string;
}
```

#### 5.3 Импорт

```typescript
import { STLLoader   } from 'three/examples/jsm/loaders/STLLoader';
import { SVGLoader   } from 'three/examples/jsm/loaders/SVGLoader';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader';

class ImportService {
  async importSTL(file: File): Promise<AddShapeOperation>;
  async importSVG(file: File): Promise<AddShapeOperation>;
  async import3MF(file: File): Promise<AddShapeOperation>;
}
```

#### 5.4 Автосохранение в IndexedDB

```typescript
// Автосохранение каждые 30 сек при наличии несохранённых изменений
class AutosaveService {
  async initialize(): Promise<void>;
  async save(doc: CaDoodleDocument): Promise<void>;
  async restore(): Promise<CaDoodleDocument | null>;
}
```

**Deliverables Фазы 5:**
- [ ] Открытие `.doodle` (совместимость с Java-версией подтверждена)
- [ ] Сохранение `.doodle` (Java-версия открывает файл)
- [ ] Автосохранение в IndexedDB
- [ ] Экспорт в STL (двоичный)
- [ ] Импорт STL / SVG / 3MF
- [ ] Менеджер проектов (аналог `ProjectManager.java`)

---

### Фаза 6 — Robot Lab (опциональный модуль)

**Длительность:** 4–6 недель  
**Рекомендация: реализовать после MVP.**

Аналог `RobotLab.java` (593 стр.) + `LimbControlManager.java` — полностью самостоятельный модуль. Включает конструктор роботов (корпус, конечности, колёса, руки, ноги), конфигурацию степеней свободы, кинематику.

---

### Фаза 7 — Тестирование, производительность, деплой

**Длительность:** 3–4 недели

#### 7.1 Unit-тесты

```typescript
describe('CaDoodleDocument', () => {
  it('undo/redo работает корректно', async () => {
    const doc = new CaDoodleDocument();
    await doc.addOperation(addCubeOp);
    await doc.addOperation(moveOp);
    expect(doc.cursor).toBe(2);
    await doc.back();
    expect(doc.cursor).toBe(1);
    await doc.forward();
    expect(doc.cursor).toBe(2);
  });
});
```

#### 7.2 Визуальные регрессионные тесты (Playwright)

```typescript
test('Добавить куб', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-shape="cube"]');
  await expect(page).toHaveScreenshot('add-cube.png', { threshold: 0.01 });
});
```

#### 7.3 Оптимизация производительности

| Проблема | Решение |
|---|---|
| CSG на сложных мешах (>10к треугольников) | manifold-3d WASM в Web Worker |
| Частая перерисовка сцены | `requestAnimationFrame` только при изменениях |
| Много объектов в сцене | `THREE.InstancedMesh` для повторяющихся примитивов |
| Загрузка WASM (~2 МБ) | Service Worker кеширование, прогресс при старте |
| Большие `.doodle` файлы | Стриминговая распаковка через JSZip |

#### 7.4 PWA и деплой

```
GitHub Actions
  → vite build
  → Lighthouse CI (score > 90)
  → Playwright визуальные тесты
  → Deploy → Cloudflare Pages / Vercel

PWA:
  → Service Worker (offline режим)
  → File Handlers API (открывать .doodle через приложение)
  → display: standalone
```

---

## Критические риски

| Риск | Вероятность | Митигация |
|---|---|---|
| Fillet не реализуем через manifold-3d | Средняя | Исследовать в Фазе 0; fallback — OpenCascade.js |
| CSG слишком медленный в WASM | Низкая | Web Worker; опциональный серверный CSG |
| Несовместимость формата `.doodle` | Низкая | Фаззинг-тесты на реальных файлах в Фазе 0 |
| File System Access API не поддерживается | Средняя | Fallback через `<input type="file">` и download-link |
| Robot Lab слишком сложен для порта | Высокая | MVP без Robot Lab; отдельный релиз |
| Three.js TransformControls отличаются от Java gizmo | Средняя | Собственная реализация handles поверх Three.js |

---

## Общий roadmap

```
Фаза 0  ████░░░░░░░░░░░░░░  2–3 нед.   Прототип + анализ формата + CSG PoC
Фаза 1  ████████░░░░░░░░░░  4–6 нед.   Движок операций + история
Фаза 2  ██████░░░░░░░░░░░░  3–4 нед.   Three.js вьюпорт + камера
Фаза 3  ████████████░░░░░░  6–8 нед.   Все инструменты (move/resize/...)
Фаза 4  ████████░░░░░░░░░░  4–5 нед.   UI панели (React)
Фаза 5  ████░░░░░░░░░░░░░░  2–3 нед.   Файлы + экспорт
Фаза 6  ████████░░░░░░░░░░  4–6 нед.   Robot Lab (опционально)
Фаза 7  ██████░░░░░░░░░░░░  3–4 нед.   Тесты + деплой
─────────────────────────────────────────────────────────
ИТОГО                       12–18 мес. (команда 2–3 чел.)
MVP (фазы 0–5 + 7)          8–11 мес.
```

---

## Чеклист MVP

### Фаза 0
- [x] TypeScript-типизация формата `.doodle` задокументирована — `web-app/src/csg/types.ts`
- [x] CSG proof-of-concept с замерами производительности — manifold-3d инициализируется, cube/sphere/cylinder/cone, union/subtract/intersect, timing в ms в статусбаре
- [ ] ADR по методу реализации Fillet зафиксирован
- [x] Монорепозиторий настроен (pnpm + Vite + TypeScript strict) — `web-app/`, Vite 6, React 18, Three.js r170, manifold-3d 3.5.1
- [x] Three.js вьюпорт с освещением, тенями, сеткой — `web-app/src/components/Viewport3D.tsx`
- [x] OrbitControls (вращение, панорамирование, зум) — встроено в Viewport3D
- [x] Базовый UI (toolbar + shape palette + properties panel + statusbar) — `web-app/src/App.tsx`
- [x] Выбор объектов (клик, Shift+клик) через raycast

### Фаза 1
- [x] `CaDoodleDocument` с полным undo/redo — Zustand store, `historyIndex` + `operations[]`, replay через воркер
- [x] CSG Web Worker — manifold-3d в отдельном потоке, Promise-based bridge, кэш manifold-объектов
- [x] Парсер `.doodle` — JSZip + JSON, совместимость с Java-форматом (массив / `{version, operations}`)
- [x] Сериализатор `.doodle` — ZIP с `model.json` + `thumbnail.png`, скачивается через File API
- [x] Клавиатурные сочетания: Ctrl+Z/Y, Del, Ctrl+A, Ctrl+S, Ctrl+O
- [ ] 100% unit-тесты движка операций — отложено до Фазы 7

### Фаза 2
- [x] Three.js сцена со светом и тенью — `Viewport3D.tsx`
- [x] OrbitControls (вращение, панорамирование, зум) — `Viewport3D.tsx`
- [x] FitView (F / кнопка «Fit») — автоматический framing по bbox сцены
- [x] Числовые поля позиции/вращения в панели свойств (X/Y/Z, rotX/Y/Z)
- [x] Color picker для выбранного объекта
- [x] Кнопка показать/скрыть объект
- [x] Экспорт STL (бинарный, multi-object merge) — `stl-export.ts`
- [x] Навигационный куб (ViewCube) — клик по грани → анимированный перелёт камеры
- [ ] Рабочая плоскость с настраиваемым snap

### Фаза 3
- [x] Выделение: клик + Ctrl+клик (Shift+клик) — raycast в Viewport3D
- [x] Move gizmo (TransformControls, режим translate, клавиша G)
- [x] Rotation gizmo (TransformControls, режим rotate, клавиша R)
- [x] Scale gizmo (TransformControls, режим scale, клавиша S)
- [x] Гизмо сохраняет позицию/поворот в store через moveObject + undo/redo
- [x] Список объектов в левой панели (клик → выбор, Shift/Ctrl → мульти)
- [ ] Resize gizmo по граням/углам (точный resize)
- [ ] Drag-select (рамка выделения)
- [ ] Mirror с preview
- [ ] Align (9 позиций)
- [ ] Fillet
- [ ] Extrude
- [ ] Все клавиатурные привязки

### Фаза 4
- [ ] Toolbar со всеми действиями
- [ ] ShapesPalette с категориями и поиском
- [ ] ConfigPanel (размеры + цвет + блокировка + видимость)
- [ ] ComponentTree
- [ ] Timeline с фильтрацией и переходом
- [ ] Все панели сворачиваются
- [ ] Тёмный/светлый режим

### Фаза 5
- [x] Открытие `.doodle` файлов — File API + JSZip
- [x] Сохранение `.doodle` файлов — JSZip + download
- [x] Экспорт STL — бинарный, multi-object
- [ ] Автосохранение в IndexedDB
- [ ] Импорт STL / SVG / 3MF
- [ ] Менеджер проектов
