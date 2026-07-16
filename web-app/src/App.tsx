import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Viewport3D, { type GizmoMode } from "./components/Viewport3D";
import ErrorBoundary from "./components/ErrorBoundary";
import WebGLFallback from "./components/WebGLFallback";
import ProjectManagerModal from "./components/ProjectManagerModal";
import ToastContainer from "./components/ToastContainer";
import Toolbar from "./components/Toolbar";
import TextModal from "./components/TextModal";
import StatusBar from "./components/StatusBar";
import LeftPanel from "./components/LeftPanel";
import PropertiesPanel from "./components/PropertiesPanel";
import { useDocumentStore } from "./store/document-store";
import { isWorkerReady } from "./csg/worker-client";
import { SNAP_VALUES, DEFAULT_FILTERS } from "./constants";
import type {
  TransformNR,
  ShapeParams,
} from "./csg/types";

// ---- App ----
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
  const [cameraMode, setCameraMode] = useState<"perspective" | "orthographic">("perspective");
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput, setTextInput] = useState("Text");
  const [textSize, setTextSize] = useState(10);
  const [textDepth, setTextDepth] = useState(5);

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
    addRawMesh,
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
  }, [restoreAutosave]);

  useEffect(() => {
    if (operations.length === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      triggerAutosave();
    }, 3000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [operations, historyIndex, triggerAutosave]);

  // Keyboard shortcuts — stable listener via ref (WARN-1 fix).
  // ref обновляется каждый рендер, но сам listener не переподключается.
  const kbRef = useRef({
    objects, deleteSelected, undo, redo, selectObjects,
    saveDoodle, openDoodle, clearSelection, copySelected, pasteClipboard,
  });
  kbRef.current = {
    objects, deleteSelected, undo, redo, selectObjects,
    saveDoodle, openDoodle, clearSelection, copySelected, pasteClipboard,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const kb = kbRef.current;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        kb.deleteSelected();
      }
      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        kb.undo();
      }
      if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        kb.redo();
      }
      if (ctrl && e.key === "a") {
        e.preventDefault();
        kb.selectObjects(Object.keys(kb.objects), false);
      }
      if (ctrl && e.key === "s") {
        e.preventDefault();
        kb.saveDoodle();
      }
      if (ctrl && e.key === "o") {
        e.preventDefault();
        kb.openDoodle();
      }
      if (ctrl && e.key === "c") {
        e.preventDefault();
        kb.copySelected();
      }
      if (ctrl && e.key === "v") {
        e.preventDefault();
        kb.pasteClipboard();
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
        kb.clearSelection();
        setRulerActive(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const handleAddText = useCallback(async () => {
    setShowTextModal(false);
    try {
      const [{ FontLoader }, { TextGeometry }] = await Promise.all([
        import("three/examples/jsm/loaders/FontLoader.js"),
        import("three/examples/jsm/geometries/TextGeometry.js"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fontData = (await import("three/examples/fonts/helvetiker_regular.typeface.json")) as any;
      const loader = new FontLoader();
      const font = loader.parse(fontData.default ?? fontData);
      const geo = new TextGeometry(textInput.trim() || "Text", {
        font,
        size: textSize,
        depth: textDepth,
        curveSegments: 4,
        bevelEnabled: false,
      });
      geo.computeBoundingBox();
      const posAttr = geo.attributes.position;
      const vertices = Array.from(posAttr.array as Float32Array);
      let indices: number[];
      if (geo.index) {
        indices = Array.from(geo.index.array).map(Number);
      } else {
        indices = Array.from({ length: posAttr.count }, (_, i) => i);
      }
      await addRawMesh(`Текст: ${textInput}`, vertices, indices);
    } catch (err) {
      console.error("Ошибка генерации текста:", err);
    }
  }, [textInput, textSize, textDepth, addRawMesh]);

  const objectList = useMemo(() => Object.values(objects), [objects]);
  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const firstSelected = selectedIds.length > 0 ? objects[selectedIds[0]] : null;
  const totalTris = useMemo(
    () => objectList.reduce((s, o) => s + o.indices.length / 3, 0),
    [objectList],
  );
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
  const handleScaleAxis = useCallback(
    (axis: "scaleX" | "scaleY" | "scaleZ", val: number) => {
      if (firstSelected)
        moveObject(firstSelected.id, {
          ...firstSelected.transform,
          [axis]: Math.max(0.01, val),
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

  const titleSuffix = fileName
    ? ` — ${fileName}${modified ? " •" : ""}`
    : modified
      ? " — без имени •"
      : "";

  return (
    <div className="app">
      <ToastContainer />

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

      {/* ── Text Modal ── */}
      {showTextModal && (
        <TextModal
          textInput={textInput}
          textSize={textSize}
          textDepth={textDepth}
          busy={busy}
          workerOk={workerOk}
          onTextChange={setTextInput}
          onSizeChange={setTextSize}
          onDepthChange={setTextDepth}
          onAdd={handleAddText}
          onClose={() => setShowTextModal(false)}
        />
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
      <Toolbar
        titleSuffix={titleSuffix}
        objectCount={objectList.length}
        selectedCount={selectedIds.length}
        canUndo={canUndo}
        canRedo={canRedo}
        hasCopied={hasCopied}
        busy={busy}
        workerOk={workerOk}
        cameraMode={cameraMode}
        gizmoMode={gizmoMode}
        rulerActive={rulerActive}
        canMirror={canMirror}
        canAlign={canAlign}
        canCsg={canCsg}
        theme={theme}
        onOpen={openDoodle}
        onSave={saveDoodle}
        onExportStl={exportStl}
        onImportStl={importStl}
        onShowProjects={() => setShowPM(true)}
        onUndo={undo}
        onRedo={redo}
        onCopy={copySelected}
        onPaste={pasteClipboard}
        onDelete={deleteSelected}
        onFitView={() => fitViewRef.current?.()}
        onResetView={() => resetViewRef.current?.()}
        onToggleCamera={() =>
          setCameraMode((m) =>
            m === "perspective" ? "orthographic" : "perspective",
          )
        }
        onGizmo={(mode) => setGizmoMode((m) => (m === mode ? null : mode))}
        onToggleRuler={() => {
          setRulerActive((r) => !r);
          setRulerDist(null);
        }}
        onMirror={mirrorSelected}
        onAlign={alignSelected}
        onCsg={csgBoolean}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onClearScene={clearScene}
      />

      {/* ── MAIN ── */}
      <div className="main">
        {/* ── Левая панель ── */}
        <LeftPanel
          shapeSearch={shapeSearch}
          onShapeSearchChange={setShapeSearch}
          workerOk={workerOk}
          busy={busy}
          onAddShape={addShape}
          onShowTextModal={() => setShowTextModal(true)}
          objectList={objectList}
          selSet={selSet}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSelect={handleSelect}
          onRename={renameObject}
          onToggleVis={toggleVisible}
          onDeleteObject={(id) => {
            selectObjects([id], false);
            deleteSelected();
          }}
          historyIndex={historyIndex}
          operations={operations}
          tlFilters={tlFilters}
          onFilterChange={(key, checked) =>
            setTlFilters((f) => ({ ...f, [key]: checked }))
          }
          onJumpHistory={jumpToHistory}
        />

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
              cameraMode={cameraMode}
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

          <PropertiesPanel
            firstSelected={firstSelected}
            busy={busy}
            selectedIds={selectedIds}
            canResize={canResize}
            canFillet={canFillet}
            canExtrude={canExtrude}
            canMirror={canMirror}
            canAlign={canAlign}
            canCsg={canCsg}
            filletRadius={filletRadius}
            extrudeAxis={extrudeAxis}
            extrudeDepth={extrudeDepth}
            objectList={objectList}
            operationsLength={operations.length}
            onSetFilletRadius={setFilletRadius}
            onSetExtrudeAxis={setExtrudeAxis}
            onSetExtrudeDepth={setExtrudeDepth}
            onMoveAxis={handleMoveAxis}
            onRotAxis={handleRotAxis}
            onScaleAxis={handleScaleAxis}
            onResizeDim={handleResizeDim}
            onResizeObject={resizeObject}
            onApplyFillet={applyFillet}
            onExtrude={extrudeSelected}
            onMirror={mirrorSelected}
            onCsg={csgBoolean}
            onAlign={alignSelected}
            onSetColor={setColor}
            onToggleVisible={toggleVisible}
            onShowProjects={() => setShowPM(true)}
            onSaveToProject={saveToProject}
          />
        </div>
      </div>

      {/* ── СТАТУСБАР ── */}
      <StatusBar
        workerOk={workerOk}
        objectCount={objectList.length}
        totalTris={totalTris}
        historyIndex={historyIndex}
        operationsLength={operations.length}
        modified={modified}
        currentProjectId={currentProjectId}
        lastCsgMs={lastCsgMs}
        rulerActive={rulerActive}
        fps={fps}
      />
    </div>
  );
}
