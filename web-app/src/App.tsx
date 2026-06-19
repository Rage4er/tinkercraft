import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Viewport3D, { type GizmoMode } from "./components/Viewport3D";
import ErrorBoundary from "./components/ErrorBoundary";
import WebGLFallback from "./components/WebGLFallback";
import ComponentTree from "./components/ComponentTree";
import ProjectManagerModal from "./components/ProjectManagerModal";
import { useDocumentStore } from "./store/document-store";
import { isWorkerReady } from "./csg/worker-client";
import type {
  ShapeType,
  TransformNR,
  TinkerCraftOperation,
  ShapeParams,
} from "./csg/types";

// ---- Фигуры ----
const ALL_SHAPES: {
  type: ShapeType;
  label: string;
  icon: string;
  category: string;
}[] = [
  { type: "cube", label: "Куб", icon: "⬛", category: "Основные" },
  { type: "sphere", label: "Сфера", icon: "🔵", category: "Основные" },
  { type: "cylinder", label: "Цилиндр", icon: "🥫", category: "Основные" },
  { type: "cone", label: "Конус", icon: "🔺", category: "Основные" },
];

const SNAP_VALUES: { label: string; value: number }[] = [
  { label: "Откл", value: 0 },
  { label: "0.1", value: 0.1 },
  { label: "0.5", value: 0.5 },
  { label: "1", value: 1 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
];

const OP_FILTER_LABELS: Record<string, string> = {
  add_shape: "Добавить",
  import_mesh: "Импорт",
  move: "Move",
  resize_dims: "Resize",
  fillet: "Fillet",
  mirror: "Зеркало",
  align: "Выровнять",
  group: "CSG",
  delete: "Удалить",
  visibility: "Видимость",
  color: "Цвет",
  rename: "Имя",
};

function opIcon(op: TinkerCraftOperation): string {
  switch (op.type) {
    case "add_shape":
      return "⊕";
    case "import_mesh":
      return "📥";
    case "move":
      return "⤢";
    case "resize":
      return "⤡";
    case "resize_dims":
      return "⤡";
    case "fillet":
      return "◌";
    case "mirror":
      return "⟺";
    case "align":
      return "⊞";
    case "group":
      return (op as { isIntersect?: boolean; subtractOp?: boolean }).isIntersect
        ? "∩"
        : (op as { subtractOp?: boolean }).subtractOp
          ? "−"
          : "∪";
    case "delete":
      return "✕";
    case "visibility":
      return "👁";
    case "color":
      return "🎨";
    case "rename":
      return "✏";
    default:
      return "?";
  }
}

function opLabel(op: TinkerCraftOperation): string {
  switch (op.type) {
    case "add_shape":
      return `Добавить ${op.shapeType}`;
    case "import_mesh":
      return `Импорт ${(op as { name?: string }).name ?? "STL"}`;
    case "move":
      return "Переместить";
    case "resize_dims":
      return "Изменить размер";
    case "fillet":
      return `Fillet r=${op.radius}`;
    case "mirror":
      return `Зеркало ${op.plane}`;
    case "align":
      return `Выровнять ${op.axis}`;
    case "group":
      return (op as { isIntersect?: boolean; subtractOp?: boolean }).isIntersect
        ? "Пересечение"
        : (op as { subtractOp?: boolean }).subtractOp
          ? "Вычитание"
          : "Объединение";
    case "delete":
      return "Удалить";
    case "visibility":
      return "Видимость";
    case "color":
      return "Цвет";
    case "rename":
      return `Переименовать`;
    default:
      return "";
  }
}

// ---- NumInput ----
function NumInput({
  label,
  value,
  disabled,
  unit = "мм",
  min,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  unit?: string;
  min?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value.toFixed(1));
  useEffect(() => {
    setDraft(value.toFixed(1));
  }, [value]);
  return (
    <div className="props-row">
      <span className="props-label">{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <input
          className="props-input"
          type="number"
          step="1"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            let v = parseFloat(draft);
            if (isNaN(v)) {
              setDraft(value.toFixed(1));
              return;
            }
            if (min !== undefined) v = Math.max(min, v);
            onChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(value.toFixed(1));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span style={{ fontSize: 9, color: "var(--text-muted)", width: 18 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// ---- Collapsible section ----
function Section({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-title" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginLeft: "auto",
            marginRight: 4,
          }}
        >
          {badge !== undefined && <span className="badge">{badge}</span>}
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </div>
      <div className={`section-body${open ? "" : " collapsed"}`}>
        {children}
      </div>
    </div>
  );
}

// ---- Timeline ----
function Timeline({
  operations,
  historyIndex,
  busy,
  onJump,
  filters,
}: {
  operations: TinkerCraftOperation[];
  historyIndex: number;
  busy: boolean;
  onJump: (index: number) => void;
  filters: Record<string, boolean>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current
      .querySelector(".tl-item.current")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [historyIndex]);

  const visible = operations
    .map((op, i) => ({ op, i }))
    .filter(({ op }) => filters[op.type] !== false);
  if (visible.length === 0) return <div className="tl-empty">Пусто</div>;

  return (
    <div className="tl-list" ref={listRef}>
      {visible.map(({ op, i }) => {
        const idx = i + 1;
        return (
          <div
            key={i}
            className={`tl-item${idx <= historyIndex ? " active" : ""}${idx === historyIndex ? " current" : ""}`}
            title={`Перейти к шагу ${idx}`}
            onClick={() => !busy && onJump(idx)}
          >
            <span className="tl-icon">{opIcon(op)}</span>
            <span className="tl-label">{opLabel(op)}</span>
            <span className="tl-idx">{idx}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- App ----
const DEFAULT_FILTERS = Object.fromEntries(
  Object.keys(OP_FILTER_LABELS).map((k) => [k, true]),
);

export default function App() {
  const [fps, setFps] = useState(0);
  const [workerOk, setWorkerOk] = useState(false);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>(null);
  const [snapValue, setSnapValue] = useState(1);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tlFilters, setTlFilters] =
    useState<Record<string, boolean>>(DEFAULT_FILTERS);
  const [filletRadius, setFilletRadius] = useState(2);
  const [restoreMsg, setRestoreMsg] = useState(false);
  const [shapeSearch, setShapeSearch] = useState("");
  const [rulerActive, setRulerActive] = useState(false);
  const [rulerDist, setRulerDist] = useState<number | null>(null);
  const [showPM, setShowPM] = useState(false);
  const [extrudeAxis, setExtrudeAxis] = useState<"X" | "Y" | "Z">("Y");
  const [extrudeDepth, setExtrudeDepth] = useState(10);
  const [activeTab, setActiveTab] = useState<"objects" | "tree">("objects");

  const fitViewRef = useRef<(() => void) | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    objects,
    selectedIds,
    operations,
    historyIndex,
    busy,
    lastCsgMs,
    fileName,
    modified,
    clipboard,
    currentProjectId,
    addShape,
    importStl,
    deleteSelected,
    selectObjects,
    clearSelection,
    csgBoolean,
    undo,
    redo,
    jumpToHistory,
    clearScene,
    openDoodle,
    saveDoodle,
    moveObject,
    resizeObject,
    extrudeSelected,
    renameObject,
    setColor,
    toggleVisible,
    exportStl,
    mirrorSelected,
    alignSelected,
    applyFillet,
    copySelected,
    pasteClipboard,
    triggerAutosave,
    restoreAutosave,
    saveToProject,
    loadFromProject,
  } = useDocumentStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (workerOk) return;
    const iv = setInterval(() => {
      if (isWorkerReady()) {
        setWorkerOk(true);
        clearInterval(iv);
      }
    }, 300);
    import("./csg/worker-client").then((m) =>
      m.workerClearAll().catch(() => {}),
    );
    return () => clearInterval(iv);
  }, [workerOk]);

  useEffect(() => {
    restoreAutosave().then((ok) => {
      if (ok) setRestoreMsg(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (operations.length === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      triggerAutosave();
    }, 3000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations, historyIndex]);

  // Клавиатурные сочетания
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if (ctrl && e.key === "a") {
        e.preventDefault();
        selectObjects(Object.keys(objects), false);
      }
      if (ctrl && e.key === "s") {
        e.preventDefault();
        saveDoodle();
      }
      if (ctrl && e.key === "o") {
        e.preventDefault();
        openDoodle();
      }
      if (ctrl && e.key === "c") {
        e.preventDefault();
        copySelected();
      }
      if (ctrl && e.key === "v") {
        e.preventDefault();
        pasteClipboard();
      }
      if (!ctrl && e.key === "f") {
        e.preventDefault();
        fitViewRef.current?.();
      }
      if (!ctrl && e.key === "h") {
        e.preventDefault();
        resetViewRef.current?.();
      }
      if (!ctrl && e.key === "g") {
        e.preventDefault();
        setGizmoMode((m) => (m === "translate" ? null : "translate"));
      }
      if (!ctrl && e.key === "r") {
        e.preventDefault();
        setGizmoMode((m) => (m === "rotate" ? null : "rotate"));
      }
      if (!ctrl && e.key === "s") {
        e.preventDefault();
        setGizmoMode((m) => (m === "scale" ? null : "scale"));
      }
      if (e.key === "Escape") {
        setGizmoMode(null);
        clearSelection();
        setRulerActive(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    objects,
    deleteSelected,
    undo,
    redo,
    selectObjects,
    saveDoodle,
    openDoodle,
    clearSelection,
    copySelected,
    pasteClipboard,
  ]);

  const handleTransformEnd = useCallback(
    (id: string, t: TransformNR) => {
      moveObject(id, t);
    },
    [moveObject],
  );
  const handleSelect = useCallback(
    (id: string | null, add: boolean) => {
      if (!id) clearSelection();
      else selectObjects([id], add);
    },
    [clearSelection, selectObjects],
  );
  const handleMultiSelect = useCallback(
    (ids: string[]) => {
      selectObjects(ids, false);
    },
    [selectObjects],
  );
  const handleRulerMeasure = useCallback((dist: number) => {
    setRulerDist(dist);
    setTimeout(() => setRulerDist(null), 4500);
  }, []);

  const objectList = useMemo(() => Object.values(objects), [objects]);
  const selSet = new Set(selectedIds);
  const firstSelected = selectedIds.length > 0 ? objects[selectedIds[0]] : null;
  const totalTris = objectList.reduce((s, o) => s + o.indices.length / 3, 0);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < operations.length;
  const canCsg = selectedIds.length === 2 && !busy;
  const canMirror = selectedIds.length > 0 && !busy;
  const canAlign = selectedIds.length >= 2 && !busy;
  const canFillet =
    selectedIds.length === 1 && firstSelected?.shapeType === "cube" && !busy;
  const canResize =
    selectedIds.length === 1 &&
    firstSelected?.shapeType !== "import_mesh" &&
    !busy;
  const canExtrude = selectedIds.length === 1 && !busy;
  const hasCopied = clipboard.length > 0;

  const handleMoveAxis = useCallback(
    (axis: "x" | "y" | "z", val: number) => {
      if (firstSelected)
        moveObject(firstSelected.id, {
          ...firstSelected.transform,
          [axis]: val,
        });
    },
    [firstSelected, moveObject],
  );
  const handleRotAxis = useCallback(
    (axis: "rotX" | "rotY" | "rotZ", val: number) => {
      if (firstSelected)
        moveObject(firstSelected.id, {
          ...firstSelected.transform,
          [axis]: val,
        });
    },
    [firstSelected, moveObject],
  );
  const handleResizeDim = useCallback(
    (dim: "width" | "height" | "depth", val: number) => {
      if (firstSelected)
        resizeObject(firstSelected.id, {
          [dim]: Math.max(0.1, val),
        } as ShapeParams);
    },
    [firstSelected, resizeObject],
  );

  const filteredShapes = shapeSearch.trim()
    ? ALL_SHAPES.filter((s) =>
        s.label.toLowerCase().includes(shapeSearch.toLowerCase()),
      )
    : ALL_SHAPES;

  const titleSuffix = fileName
    ? ` — ${fileName}${modified ? " •" : ""}`
    : modified
      ? " — без имени •"
      : "";

  return (
    <div className="app">
      {/* ── Restore banner ── */}
      {restoreMsg && (
        <div className="restore-banner">
          <span>Восстановить сессию из автосохранения?</span>
          <button
            className="btn"
            onClick={() => {
              restoreAutosave();
              setRestoreMsg(false);
            }}
          >
            Восстановить
          </button>
          <button className="btn" onClick={() => setRestoreMsg(false)}>
            Нет
          </button>
        </div>
      )}

      {/* ── Ruler distance display ── */}
      {rulerDist !== null && (
        <div className="ruler-display">
          📏 Расстояние: <strong>{rulerDist.toFixed(2)} мм</strong>
        </div>
      )}

      {/* ── Project Manager Modal ── */}
      {showPM && (
        <ProjectManagerModal
          onClose={() => setShowPM(false)}
          onLoad={async (ops) => {
            await loadFromProject("_direct");
            void ops;
          }}
          onSave={saveToProject}
          currentProjectId={currentProjectId ?? undefined}
          setCurrentProjectId={() => {}}
        />
      )}

      {/* ── TOOLBAR ── */}
      <div className="toolbar">
        <span className="toolbar-logo">⬛ TinkerCraft{titleSuffix}</span>
        <div className="toolbar-divider" />

        {/* Файл */}
        <button
          className="btn"
          onClick={openDoodle}
          title="Открыть .doodle (Ctrl+O)"
        >
          📂 Открыть
        </button>
        <button
          className="btn"
          onClick={saveDoodle}
          title="Сохранить .doodle (Ctrl+S)"
        >
          💾 Сохранить
        </button>
        <button
          className="btn"
          onClick={exportStl}
          disabled={objectList.length === 0}
          title="Экспорт STL"
        >
          📐 STL
        </button>
        <button
          className="btn"
          onClick={importStl}
          disabled={busy}
          title="Импорт STL"
        >
          📥 Импорт
        </button>
        <button
          className="btn"
          onClick={() => setShowPM(true)}
          title="Менеджер проектов"
        >
          📁 Проекты
        </button>

        <div className="toolbar-divider" />

        {/* Undo/Redo */}
        <button
          className="btn"
          onClick={undo}
          disabled={!canUndo || busy}
          title="Отменить (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          className="btn"
          onClick={redo}
          disabled={!canRedo || busy}
          title="Повторить (Ctrl+Y)"
        >
          ↪ Redo
        </button>

        <div className="toolbar-divider" />

        {/* Copy/Paste */}
        <button
          className="btn"
          onClick={copySelected}
          disabled={selectedIds.length === 0}
          title="Копировать (Ctrl+C)"
        >
          ⧉ Copy
        </button>
        <button
          className="btn"
          onClick={pasteClipboard}
          disabled={!hasCopied || busy}
          title="Вставить (Ctrl+V)"
        >
          📋 Paste
        </button>
        <button
          className="btn"
          onClick={deleteSelected}
          disabled={selectedIds.length === 0 || busy}
          title="Удалить (Del)"
        >
          🗑 Del
        </button>

        <div className="toolbar-divider" />

        {/* Вид */}
        <button
          className="btn"
          onClick={() => fitViewRef.current?.()}
          title="Fit view (F)"
        >
          🔍 Fit
        </button>
        <button
          className="btn"
          onClick={() => resetViewRef.current?.()}
          title="Сброс вида (H)"
        >
          🏠 Home
        </button>

        <div className="toolbar-divider" />

        {/* Гизмо */}
        <button
          className={`btn${gizmoMode === "translate" ? " active" : ""}`}
          disabled={selectedIds.length === 0}
          onClick={() =>
            setGizmoMode((m) => (m === "translate" ? null : "translate"))
          }
          title="Переместить (G)"
        >
          ⤢ Move
        </button>
        <button
          className={`btn${gizmoMode === "rotate" ? " active" : ""}`}
          disabled={selectedIds.length === 0}
          onClick={() =>
            setGizmoMode((m) => (m === "rotate" ? null : "rotate"))
          }
          title="Повернуть (R)"
        >
          ↻ Rotate
        </button>
        <button
          className={`btn${gizmoMode === "scale" ? " active" : ""}`}
          disabled={selectedIds.length === 0}
          onClick={() => setGizmoMode((m) => (m === "scale" ? null : "scale"))}
          title="Масштаб (S)"
        >
          ⤡ Scale
        </button>
        {gizmoMode !== null && (
          <button
            className="btn danger"
            onClick={() => setGizmoMode(null)}
            title="Выйти (Esc)"
          >
            ✕
          </button>
        )}

        <div className="toolbar-divider" />

        {/* Линейка */}
        <button
          className={`btn${rulerActive ? " active" : ""}`}
          onClick={() => {
            setRulerActive((r) => !r);
            setRulerDist(null);
          }}
          title="Линейка — 2 клика для измерения расстояния"
        >
          📏 Линейка
        </button>

        <div className="toolbar-divider" />

        {/* Зеркало */}
        <button
          className="btn"
          disabled={!canMirror}
          onClick={() => mirrorSelected("YZ")}
          title="Зеркало YZ"
        >
          ⟺YZ
        </button>
        <button
          className="btn"
          disabled={!canMirror}
          onClick={() => mirrorSelected("XZ")}
          title="Зеркало XZ"
        >
          ⟺XZ
        </button>
        <button
          className="btn"
          disabled={!canMirror}
          onClick={() => mirrorSelected("XY")}
          title="Зеркало XY"
        >
          ⟺XY
        </button>

        <div className="toolbar-divider" />

        {/* Выравнивание */}
        <button
          className="btn"
          disabled={!canAlign}
          onClick={() => alignSelected("X", "min")}
          title="◧X"
        >
          ◧X
        </button>
        <button
          className="btn"
          disabled={!canAlign}
          onClick={() => alignSelected("X", "center")}
          title="⊡X"
        >
          ⊡X
        </button>
        <button
          className="btn"
          disabled={!canAlign}
          onClick={() => alignSelected("X", "max")}
          title="◨X"
        >
          ◨X
        </button>
        <button
          className="btn"
          disabled={!canAlign}
          onClick={() => alignSelected("Y", "center")}
          title="⊡Y"
        >
          ⊡Y
        </button>
        <button
          className="btn"
          disabled={!canAlign}
          onClick={() => alignSelected("Z", "center")}
          title="⊡Z"
        >
          ⊡Z
        </button>

        <div className="toolbar-divider" />

        {/* CSG */}
        <button
          className="btn primary"
          disabled={!canCsg}
          onClick={() => csgBoolean("union")}
        >
          ∪
        </button>
        <button
          className="btn primary"
          disabled={!canCsg}
          onClick={() => csgBoolean("subtract")}
        >
          −
        </button>
        <button
          className="btn primary"
          disabled={!canCsg}
          onClick={() => csgBoolean("intersect")}
        >
          ∩
        </button>

        <div className="toolbar-divider" />

        {/* Тема */}
        <button
          className="btn"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title="Сменить тему"
        >
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>

        <button
          className="btn danger"
          onClick={clearScene}
          disabled={busy}
          title="Очистить сцену"
          style={{ marginLeft: "auto" }}
        >
          ✖ Clear
        </button>
      </div>

      {/* ── MAIN ── */}
      <div className="main">
        {/* ── Левая панель ── */}
        <div className="panel-left">
          {/* Фигуры с поиском */}
          <Section title="Фигуры">
            <div className="search-wrap">
              <input
                className="search-input"
                type="text"
                placeholder="🔍 Поиск фигуры…"
                value={shapeSearch}
                onChange={(e) => setShapeSearch(e.target.value)}
              />
            </div>
            <div className="shape-grid">
              {filteredShapes.length === 0 && (
                <div className="ct-empty" style={{ gridColumn: "1/-1" }}>
                  Не найдено
                </div>
              )}
              {filteredShapes.map((s) => (
                <button
                  key={s.type}
                  className="shape-btn"
                  title={`Добавить ${s.label}`}
                  disabled={!workerOk || busy}
                  onClick={() => addShape(s.type)}
                >
                  <span className="shape-icon">{s.icon}</span>
                  <span className="shape-lbl">{s.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Объекты / ComponentTree — переключатель вкладок */}
          <Section title="Объекты" badge={objectList.length}>
            <div className="tab-bar">
              <button
                className={`tab-btn${activeTab === "objects" ? " active" : ""}`}
                onClick={() => setActiveTab("objects")}
              >
                Список
              </button>
              <button
                className={`tab-btn${activeTab === "tree" ? " active" : ""}`}
                onClick={() => setActiveTab("tree")}
              >
                Дерево
              </button>
            </div>

            {activeTab === "objects" ? (
              <div className="object-list">
                {objectList.length === 0 && (
                  <div className="object-list-empty">Сцена пуста</div>
                )}
                {objectList.map((obj) => (
                  <div
                    key={obj.id}
                    className={`object-list-item${selSet.has(obj.id) ? " selected" : ""}`}
                    onClick={(e) =>
                      handleSelect(obj.id, e.shiftKey || e.ctrlKey || e.metaKey)
                    }
                    title={`${obj.shapeType} — ${obj.id}`}
                  >
                    <div
                      className="object-list-swatch"
                      style={{
                        background: obj.color,
                        opacity: obj.visible ? 1 : 0.35,
                      }}
                    />
                    <span className="object-list-label">
                      {obj.name ?? obj.shapeType}
                    </span>
                    {!obj.visible && <span className="obj-hidden">скрыт</span>}
                  </div>
                ))}
              </div>
            ) : (
              <ComponentTree
                objects={objectList}
                selectedIds={selSet}
                onSelect={handleSelect}
                onRename={renameObject}
                onToggleVis={toggleVisible}
                onDelete={(id) => {
                  selectObjects([id], false);
                  deleteSelected();
                }}
              />
            )}
          </Section>

          {/* История */}
          <Section
            title={`История ${historyIndex}/${operations.length}`}
            defaultOpen={true}
          >
            <div className="tl-filters">
              {Object.entries(OP_FILTER_LABELS).map(([key, label]) => (
                <label key={key} className="tl-filter-row">
                  <input
                    type="checkbox"
                    checked={tlFilters[key] !== false}
                    onChange={(e) =>
                      setTlFilters((f) => ({ ...f, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <Timeline
              operations={operations}
              historyIndex={historyIndex}
              busy={busy}
              onJump={jumpToHistory}
              filters={tlFilters}
            />
          </Section>
        </div>

        {/* ── Вьюпорт ── */}
        <div className="viewport">
          {busy && (
            <div className="viewport-busy">
              <div
                className="spinner"
                style={{ width: 14, height: 14, borderWidth: 2 }}
              />
              Вычисление…
            </div>
          )}
          {!workerOk && (
            <div className="viewport-loading">
              <div className="spinner" />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Загрузка CSG (WASM)…
              </span>
            </div>
          )}
          <ErrorBoundary fallback={<WebGLFallback />}>
            <Viewport3D
              objects={objectList}
              selectedIds={selSet}
              onSelect={handleSelect}
              onMultiSelect={handleMultiSelect}
              onFpsUpdate={setFps}
              fitViewRef={fitViewRef}
              resetViewRef={resetViewRef}
              gizmoMode={gizmoMode}
              onTransformEnd={handleTransformEnd}
              snapValue={snapValue}
              rulerMode={rulerActive}
              onRulerMeasure={handleRulerMeasure}
              busy={busy}
              workerOk={workerOk}
            />
          </ErrorBoundary>

          {/* Snap selector */}
          <div className="snap-selector">
            <span className="snap-label">Snap:</span>
            {SNAP_VALUES.map((sv) => (
              <button
                key={sv.value}
                className={`snap-btn${snapValue === sv.value ? " active" : ""}`}
                onClick={() => setSnapValue(sv.value)}
                title={
                  sv.value === 0 ? "Без привязки" : `Привязка ${sv.value} мм`
                }
              >
                {sv.label}
              </button>
            ))}
          </div>

          <div className="viewport-hint">
            ЛКМ — выбор · Shift — мульти · Drag — рамка · ПКМ — вид · F — Fit ·
            H — Home · G/R/S — гизмо
          </div>
        </div>

        {/* ── Правая панель ── */}
        <div className="panel-right">
          <div className="props-header">Свойства</div>

          {firstSelected ? (
            <>
              <div className="props-row">
                <span className="props-label">Тип</span>
                <span className="props-value">{firstSelected.shapeType}</span>
              </div>

              <div className="props-row">
                <span className="props-label">Цвет</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    className="color-swatch"
                    style={{ background: firstSelected.color }}
                  />
                  <input
                    type="color"
                    value={firstSelected.color}
                    style={{
                      width: 28,
                      height: 22,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onChange={(e) => setColor(firstSelected.id, e.target.value)}
                  />
                </div>
              </div>

              <div className="props-row">
                <span className="props-label">Видим</span>
                <button
                  className="btn"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => toggleVisible(firstSelected.id)}
                >
                  {firstSelected.visible ? "👁 Да" : "🚫 Нет"}
                </button>
              </div>

              <div className="props-row">
                <span className="props-label">Триг.</span>
                <span className="props-value">
                  {(firstSelected.indices.length / 3).toLocaleString()}
                </span>
              </div>

              <div className="props-section-title">Позиция (мм)</div>
              <NumInput
                label="X"
                value={firstSelected.transform.x}
                disabled={busy}
                onChange={(v) => handleMoveAxis("x", v)}
              />
              <NumInput
                label="Y"
                value={firstSelected.transform.y}
                disabled={busy}
                onChange={(v) => handleMoveAxis("y", v)}
              />
              <NumInput
                label="Z"
                value={firstSelected.transform.z}
                disabled={busy}
                onChange={(v) => handleMoveAxis("z", v)}
              />

              <div className="props-section-title">Вращение (°)</div>
              <NumInput
                label="rotX"
                unit="°"
                value={firstSelected.transform.rotX}
                disabled={busy}
                onChange={(v) => handleRotAxis("rotX", v)}
              />
              <NumInput
                label="rotY"
                unit="°"
                value={firstSelected.transform.rotY}
                disabled={busy}
                onChange={(v) => handleRotAxis("rotY", v)}
              />
              <NumInput
                label="rotZ"
                unit="°"
                value={firstSelected.transform.rotZ}
                disabled={busy}
                onChange={(v) => handleRotAxis("rotZ", v)}
              />

              {/* Resize dims — только для примитивов */}
              {canResize && firstSelected.shapeType !== "import_mesh" && (
                <div className="csg-group">
                  <div className="csg-group-title">Размеры (мм)</div>
                  {firstSelected.shapeType === "cube" && (
                    <>
                      <NumInput
                        label="Ширина"
                        min={0.1}
                        value={firstSelected.params.width ?? 20}
                        disabled={busy}
                        onChange={(v) => handleResizeDim("width", v)}
                      />
                      <NumInput
                        label="Высота"
                        min={0.1}
                        value={firstSelected.params.height ?? 20}
                        disabled={busy}
                        onChange={(v) => handleResizeDim("height", v)}
                      />
                      <NumInput
                        label="Глубина"
                        min={0.1}
                        value={firstSelected.params.depth ?? 20}
                        disabled={busy}
                        onChange={(v) => handleResizeDim("depth", v)}
                      />
                    </>
                  )}
                  {firstSelected.shapeType === "sphere" && (
                    <>
                      <NumInput
                        label="Радиус"
                        min={0.1}
                        value={firstSelected.params.radius ?? 12}
                        disabled={busy}
                        onChange={(v) =>
                          resizeObject(firstSelected.id, {
                            radius: Math.max(0.1, v),
                          })
                        }
                      />
                    </>
                  )}
                  {(firstSelected.shapeType === "cylinder" ||
                    firstSelected.shapeType === "cone") && (
                    <>
                      <NumInput
                        label="Радиус"
                        min={0.1}
                        value={firstSelected.params.radius ?? 10}
                        disabled={busy}
                        onChange={(v) =>
                          resizeObject(firstSelected.id, {
                            radius: Math.max(0.1, v),
                          })
                        }
                      />
                      <NumInput
                        label="Высота"
                        min={0.1}
                        value={firstSelected.params.height ?? 30}
                        disabled={busy}
                        onChange={(v) =>
                          resizeObject(firstSelected.id, {
                            height: Math.max(0.1, v),
                          })
                        }
                      />
                    </>
                  )}
                </div>
              )}

              {/* Fillet — только для кубов */}
              {canFillet && (
                <div className="csg-group">
                  <div className="csg-group-title">Скругление (Fillet)</div>
                  <NumInput
                    label="Радиус"
                    unit="мм"
                    min={0}
                    value={filletRadius}
                    onChange={setFilletRadius}
                  />
                  <button
                    className="btn primary"
                    disabled={!canFillet}
                    onClick={() => applyFillet(firstSelected.id, filletRadius)}
                  >
                    ◌ Применить
                  </button>
                </div>
              )}

              {/* Extrude */}
              {canExtrude && (
                <div className="csg-group">
                  <div className="csg-group-title">Выдавливание (Extrude)</div>
                  <div className="props-row">
                    <span className="props-label">Ось</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["X", "Y", "Z"] as const).map((a) => (
                        <button
                          key={a}
                          className={`btn${extrudeAxis === a ? " active" : ""}`}
                          style={{ minWidth: 30 }}
                          onClick={() => setExtrudeAxis(a)}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumInput
                    label="Глубина"
                    unit="мм"
                    min={0.1}
                    value={extrudeDepth}
                    onChange={setExtrudeDepth}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn primary"
                      style={{ flex: 1 }}
                      disabled={!canExtrude}
                      onClick={() => extrudeSelected(extrudeAxis, extrudeDepth)}
                    >
                      ▲ +{extrudeAxis}
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1 }}
                      disabled={!canExtrude}
                      onClick={() =>
                        extrudeSelected(extrudeAxis, -extrudeDepth)
                      }
                    >
                      ▼ −{extrudeAxis}
                    </button>
                  </div>
                </div>
              )}

              {/* Зеркало */}
              {selectedIds.length === 1 && (
                <div className="csg-group">
                  <div className="csg-group-title">Зеркало</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn"
                      style={{ flex: 1 }}
                      disabled={!canMirror}
                      onClick={() => mirrorSelected("YZ")}
                    >
                      YZ
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1 }}
                      disabled={!canMirror}
                      onClick={() => mirrorSelected("XZ")}
                    >
                      XZ
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1 }}
                      disabled={!canMirror}
                      onClick={() => mirrorSelected("XY")}
                    >
                      XY
                    </button>
                  </div>
                </div>
              )}

              {/* CSG */}
              {selectedIds.length === 2 && (
                <div className="csg-group">
                  <div className="csg-group-title">CSG операции</div>
                  <button
                    className="btn primary"
                    disabled={!canCsg}
                    onClick={() => csgBoolean("union")}
                  >
                    ∪ Объединение
                  </button>
                  <button
                    className="btn primary"
                    disabled={!canCsg}
                    onClick={() => csgBoolean("subtract")}
                  >
                    − Вычитание
                  </button>
                  <button
                    className="btn primary"
                    disabled={!canCsg}
                    onClick={() => csgBoolean("intersect")}
                  >
                    ∩ Пересечение
                  </button>
                  <div className="csg-group-title" style={{ marginTop: 8 }}>
                    Выравнивание
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    <button
                      className="btn"
                      style={{ flex: 1, minWidth: 36 }}
                      disabled={!canAlign}
                      onClick={() => alignSelected("X", "min")}
                    >
                      X◧
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1, minWidth: 36 }}
                      disabled={!canAlign}
                      onClick={() => alignSelected("X", "center")}
                    >
                      X⊡
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1, minWidth: 36 }}
                      disabled={!canAlign}
                      onClick={() => alignSelected("X", "max")}
                    >
                      X◨
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1, minWidth: 36 }}
                      disabled={!canAlign}
                      onClick={() => alignSelected("Y", "min")}
                    >
                      Y◧
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1, minWidth: 36 }}
                      disabled={!canAlign}
                      onClick={() => alignSelected("Y", "center")}
                    >
                      Y⊡
                    </button>
                    <button
                      className="btn"
                      style={{ flex: 1, minWidth: 36 }}
                      disabled={!canAlign}
                      onClick={() => alignSelected("Y", "max")}
                    >
                      Y◨
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="props-empty">
                Выберите объект
                <br />
                для просмотра свойств
              </div>
              {objectList.length > 0 && (
                <div
                  style={{
                    padding: "8px 12px",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  В сцене:{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {objectList.length}
                  </strong>{" "}
                  объектов
                </div>
              )}
              {/* Проект */}
              <div className="csg-group" style={{ margin: "8px 8px 0" }}>
                <div className="csg-group-title">Проект</div>
                <button
                  className="btn"
                  style={{ width: "100%" }}
                  onClick={() => setShowPM(true)}
                >
                  📁 Менеджер проектов
                </button>
                <button
                  className="btn primary"
                  style={{ width: "100%", marginTop: 4 }}
                  disabled={operations.length === 0}
                  onClick={() =>
                    saveToProject(
                      "Проект " + new Date().toLocaleTimeString("ru"),
                    )
                  }
                >
                  💾 Быстрое сохранение
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── СТАТУСБАР ── */}
      <div className="statusbar">
        <span className="status-item">
          CSG:&nbsp;
          {workerOk ? (
            <strong className="status-ok">manifold-3d ✓</strong>
          ) : (
            <strong className="status-loading">загрузка…</strong>
          )}
        </span>
        <span className="status-item">
          Объектов: <strong>{objectList.length}</strong>
        </span>
        <span className="status-item">
          Треуг.: <strong>{totalTris.toLocaleString()}</strong>
        </span>
        <span className="status-item">
          История:{" "}
          <strong>
            {historyIndex}/{operations.length}
          </strong>
        </span>
        {modified && (
          <span
            className="status-item"
            style={{ color: "var(--accent-yellow)" }}
          >
            ● Не сохранено
          </span>
        )}
        {currentProjectId && (
          <span
            className="status-item"
            style={{ color: "var(--accent-green)" }}
          >
            ● Проект сохранён
          </span>
        )}
        {lastCsgMs !== null && (
          <span className="status-item">
            CSG:{" "}
            <strong className={lastCsgMs < 100 ? "status-ok" : "status-warn"}>
              {lastCsgMs.toFixed(1)} мс
            </strong>
          </span>
        )}
        {rulerActive && (
          <span className="status-item" style={{ color: "#facc15" }}>
            📏 Режим измерения
          </span>
        )}
        <span className="status-item" style={{ marginLeft: "auto" }}>
          FPS: <strong>{fps}</strong>
        </span>
        <span
          className="status-item"
          style={{ color: "var(--text-muted)", fontSize: 10 }}
        >
          Фазы 0–6 · Resize · Extrude · Ruler · ComponentTree · ProjectManager ·
          ViewCube fix
        </span>
      </div>
    </div>
  );
}
