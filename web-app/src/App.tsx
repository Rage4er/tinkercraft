import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import Viewport3D, { type GizmoMode } from "./components/Viewport3D";
import ErrorBoundary from "./components/ErrorBoundary";
import WebGLFallback from "./components/WebGLFallback";
import ProjectManagerModal from "./components/ProjectManagerModal";
import ConfirmModal from "./components/ConfirmModal";
import ToastContainer from "./components/ToastContainer";
import Toolbar from "./components/Toolbar";
import TextModal from "./components/TextModal";
import StatusBar from "./components/StatusBar";
import LeftPanel from "./components/LeftPanel";
import PropertiesPanel from "./components/PropertiesPanel";
import ChildPropertiesPanel from "./components/ChildPropertiesPanel";
import StepPanel from "./components/StepPanel";
import AlignPanel from "./components/AlignPanel";
import { useAlignModeStore } from "./store/align-mode";
import { useAlignModeKeys } from "./hooks/useAlignModeKeys";
import { useDocumentStore, canUndoClear } from "./store/document-store";
import { continuousEuler } from "./store/helpers";
import { useUiStore } from "./store/ui-store";
import { useShallow } from "zustand/shallow";
import { isWorkerReady } from "./csg/worker-client";
import { SNAP_VALUES } from "./constants";
import { useAutosave } from "./hooks/useAutosave";
import { addTextObject } from "./store/add-text";
import { createAddShapeGate, addShapeWhenIdle } from "./store/add-shape-queue";
import { resolveHotkey, NO_REPEAT, mirrorPlaneOf, csgOpOf, isTextEntry, tabTogglesCamera } from "./hotkeys";
import { useSelectedChildGuard } from "./hooks/useSelectedChildGuard";
import { useSelectedStepGuard } from "./hooks/useSelectedStepGuard";
import { useTimelineEdit } from "./hooks/useTimelineEdit";
import { resolveCsgOperands, aliveGroups } from "./store/csg-operands";
import type {
  TransformNR,
  ShapeParams,
  ShapeType,
  CsgBooleanOp,
} from "./csg/types";

// ---- App ----
export default function App() {
  const { t } = useTranslation();
  // UI state — moved to ui-store (Q-R6-1)
  // FIX (MED-UI-4): Single useShallow selector to reduce re-renders
  const {
    fps, setFps,
    workerOk, setWorkerOk,
    gizmoMode, setGizmoMode,
    snapValue, setSnapValue,
    theme, setTheme,
    tlFilters, setTlFilter,
    shapeSearch, setShapeSearch,
    rulerActive, setRulerActive,
    rulerDist, setRulerDist,
    showPM, setShowPM,
    extrudeAxis, setExtrudeAxis,
    extrudeDepth, setExtrudeDepth,
    activeTab, setActiveTab,
    cameraMode, setCameraMode,
    showTextModal, setShowTextModal,
    previewObject, setPreviewObject,
    mirrorPreviewPlane, setMirrorPreviewPlane,
  } = useUiStore(
    useShallow(s => ({
      fps: s.fps, setFps: s.setFps,
      workerOk: s.workerOk, setWorkerOk: s.setWorkerOk,
      gizmoMode: s.gizmoMode, setGizmoMode: s.setGizmoMode,
      snapValue: s.snapValue, setSnapValue: s.setSnapValue,
      theme: s.theme, setTheme: s.setTheme,
      tlFilters: s.tlFilters, setTlFilter: s.setTlFilter,
      shapeSearch: s.shapeSearch, setShapeSearch: s.setShapeSearch,
      rulerActive: s.rulerActive, setRulerActive: s.setRulerActive,
      rulerDist: s.rulerDist, setRulerDist: s.setRulerDist,
      showPM: s.showPM, setShowPM: s.setShowPM,
      extrudeAxis: s.extrudeAxis, setExtrudeAxis: s.setExtrudeAxis,
      extrudeDepth: s.extrudeDepth, setExtrudeDepth: s.setExtrudeDepth,
      activeTab: s.activeTab, setActiveTab: s.setActiveTab,
      cameraMode: s.cameraMode, setCameraMode: s.setCameraMode,
      showTextModal: s.showTextModal, setShowTextModal: s.setShowTextModal,
      previewObject: s.previewObject, setPreviewObject: s.setPreviewObject,
      mirrorPreviewPlane: s.mirrorPreviewPlane, setMirrorPreviewPlane: s.setMirrorPreviewPlane,
    })),
  );

  // Text modal form state — stays local (form-only, not shared)
  const [textInput, setTextInput] = useState("Text");
  const [textSize, setTextSize] = useState(10);
  const [textDepth, setTextDepth] = useState(5);
  // UX-AUDIT-2: «Очистить сцену» — с подтверждением
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fitViewRef = useRef<(() => void) | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);

  // FIX (PERF-R16-3): Use useShallow wrapper to prevent re-renders when
  // only the store's internal reference changes but values are the same.
  const docStore = useDocumentStore(
    useShallow(s => ({
      objects: s.objects,
      selectedIds: s.selectedIds,
      operations: s.operations,
      historyIndex: s.historyIndex,
      busy: s.busy,
      lastCsgMs: s.lastCsgMs,
      fileName: s.fileName,
      modified: s.modified,
      clipboard: s.clipboard,
      currentProjectId: s.currentProjectId,
      currentProjectName: s.currentProjectName,
      importStl: s.importStl,
      deleteSelected: s.deleteSelected,
      selectObjects: s.selectObjects,
      clearSelection: s.clearSelection,
      csgBoolean: s.csgBoolean,
      undo: s.undo,
      redo: s.redo,
      jumpToHistory: s.jumpToHistory,
      clearScene: s.clearScene,
      openProject: s.openProject,
      saveProject: s.saveProject,
      moveObject: s.moveObject,
      resizeObject: s.resizeObject,
      extrudeSelected: s.extrudeSelected,
      renameObject: s.renameObject,
      setColor: s.setColor,
      toggleVisible: s.toggleVisible,
      exportStl: s.exportStl,
      mirrorSelected: s.mirrorSelected,
      previewMirror: s.previewMirror,
      copySelected: s.copySelected,
      pasteClipboard: s.pasteClipboard,
      saveToProject: s.saveToProject,
      loadFromProject: s.loadFromProject,
      setCurrentProject: s.setCurrentProject,
    })),
  );
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
    currentProjectName,
    importStl,
    deleteSelected,
    selectObjects,
    clearSelection,
    csgBoolean,
    undo,
    redo,
    jumpToHistory,
    clearScene,
    openProject,
    saveProject,
    moveObject,
    resizeObject,
    extrudeSelected,
    renameObject,
    setColor,
    toggleVisible,
    exportStl,
    mirrorSelected,
    previewMirror,
    copySelected,
    pasteClipboard,
    saveToProject,
    loadFromProject,
    setCurrentProject,
  } = docStore;

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
      m.workerClearAll().catch(() => { }),
    );
    return () => clearInterval(iv);
  }, [workerOk]);



  // UX-AUDIT-1: автосохранение + восстановление прошлой сессии при старте
  useAutosave(workerOk);

  // Keyboard shortcuts — stable listener via ref (WARN-1 fix).
  // ref обновляется каждый рендер, но сам listener не переподключается.
  // UX-AUDIT-5: клавиша → действие — `resolveHotkey` (hotkeys.ts, сверяется с подсказками
  // TOOLTIP_DATA тестом); здесь — только исполнение. Под модалкой сочетания не работают.
  const kbState = {
    objects, selectedIds, busy, deleteSelected, undo, redo, selectObjects,
    saveProject, openProject, clearSelection, copySelected, pasteClipboard,
    csgBoolean, mirrorSelected,
    modalOpen: showTextModal || showPM || showClearConfirm,
  };
  const kbRef = useRef(kbState);
  kbRef.current = kbState;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextEntry(e.target as Element | null)) return;
      const kb = kbRef.current;
      // FIX (MED-18-39): под модалкой — ни Esc, ни Delete, ни Ctrl+Z по сцене
      if (kb.modalOpen) return;
      const action = resolveHotkey(e);
      if (!action) return;
      if (action === "toggleCamera" && !tabTogglesCamera(document.activeElement)) return; // Tab — навигация фокусом
      if (e.repeat && NO_REPEAT.has(action)) {
        e.preventDefault();
        return;
      }
      if (action !== "escape") e.preventDefault();
      const plane = mirrorPlaneOf(action);
      if (plane) {
        if (kb.selectedIds.length > 0 && !kb.busy) void kb.mirrorSelected(plane);
        return;
      }
      const csgOp = csgOpOf(action);
      if (csgOp) {
        // N-ARY-CSG: операнды (N, группы A/B) разбирает стор; нечего считать — ничего
        if (!kb.busy) void kb.csgBoolean(csgOp, useUiStore.getState().csgGroups);
        return;
      }
      switch (action) {
        case "delete": void kb.deleteSelected(); break;
        case "undo": void kb.undo(); break;
        case "redo": void kb.redo(); break;
        case "selectAll": kb.selectObjects(Object.keys(kb.objects), false); break;
        // FIX (HIGH-18-18): Ctrl+S сохраняет и при активном гизмо (S без Ctrl — гизмо масштаба)
        case "save": void kb.saveProject(); break;
        case "open": void kb.openProject(); break;
        case "copy": kb.copySelected(); break;
        case "paste": void kb.pasteClipboard(); break;
        case "fitView": fitViewRef.current?.(); break;
        case "homeView": resetViewRef.current?.(); break;
        case "toggleCamera": setCameraMode((m) => (m === "perspective" ? "orthographic" : "perspective")); break;
        case "gizmoTranslate": setGizmoMode((m) => (m === "translate" ? "none" : "translate")); break;
        case "gizmoRotate": setGizmoMode((m) => (m === "rotate" ? "none" : "rotate")); break;
        case "gizmoScale": setGizmoMode((m) => (m === "scale" ? "none" : "scale")); break;
        case "ruler":
          setRulerActive((r) => !r);
          setRulerDist(null);
          break;
        case "escape":
          setGizmoMode("none");
          kb.clearSelection();
          setRulerActive(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleTransformEnd = useCallback(
    (id: string, t: TransformNR) => {
      // UX-AUDIT-42: гизмо отдаёт углы Three.js — в (−180°, 180°]; поворот через ±180° (rotZ 170 → +30°)
      // давал −160 и шаг «поворот −330°». Углы — в записи, ближайшей к прежним (170 → 200).
      const prev = useDocumentStore.getState().objects[id]?.transform;
      moveObject(id, prev ? { ...t, ...continuousEuler(t, prev) } : t);
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

  // UX-AUDIT-3/6/10: замкнутый меш, имя «Текст: …», ошибка → уведомление (store/add-text.ts)
  const handleAddText = useCallback(async () => {
    if (await addTextObject(textInput, { size: textSize, depth: textDepth })) setShowTextModal(false);
  }, [textInput, textSize, textDepth]);

  // UX-AUDIT-9: клик по фигуре — двойной клик (<200 мс) даёт одну фигуру, позже — ещё одну
  // (клик во время занятого стора ждёт очереди, а не теряется)
  const addShapeGate = useMemo(() => createAddShapeGate(), []);
  const handleAddShape = useCallback(
    (type: ShapeType) => {
      if (addShapeGate(type)) void addShapeWhenIdle(type);
    },
    [addShapeGate],
  );

  // Фаза 9.1: сброс выбора ребёнка CSG, если узел/выделение исчезли
  useSelectedChildGuard();
  // Фаза 9.5.2: сброс выбора шага Timeline (undo до шага, выделение в сцене)
  useSelectedStepGuard();
  const hasSelectedStep = useUiStore((s) => s.selectedStep !== null);
  // ALIGN-UI-REVIT: режим выравнивания (одна кнопка «Выровнять»)
  const alignActive = useAlignModeStore((s) => s.alignMode !== null);
  useAlignModeKeys(); // Esc → выход из режима (capture, раньше общего обработчика)
  const startAlignMode = useAlignModeStore((s) => s.startAlignMode);
  const exitAlignMode = useAlignModeStore((s) => s.exitAlignMode);
  // линейка или гизмо включены во время режима — выходим из режима
  useEffect(() => {
    if (rulerActive || gizmoMode !== "none") useAlignModeStore.getState().exitAlignMode();
  }, [rulerActive, gizmoMode]);
  const handleTimelineEdit = useTimelineEdit();
  const hasSelectedChild = useUiStore((s) => s.selectedChild !== null);

  // N-ARY-CSG: группы A/B — без поглощённых/удалённых объектов (после CSG, undo, удаления)
  const csgGroups = useUiStore((s) => s.csgGroups);
  const setCsgGroups = useUiStore((s) => s.setCsgGroups);
  useEffect(() => {
    const alive = aliveGroups(csgGroups, objects);
    if (alive.a.length !== csgGroups.a.length || alive.b.length !== csgGroups.b.length) setCsgGroups(alive);
  }, [objects, csgGroups, setCsgGroups]);
  const runCsg = useCallback(
    (op: CsgBooleanOp) => csgBoolean(op, useUiStore.getState().csgGroups),
    [csgBoolean],
  );

  const objectList = useMemo(() => Object.values(objects), [objects]);
  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const firstSelected = selectedIds.length > 0 ? objects[selectedIds[0]] : null;
  const totalTris = useMemo(
    () => objectList.reduce((s, o) => s + o.indices.length / 3, 0),
    [objectList],
  );
  // UX-AUDIT-2: сразу после «Очистить сцену» отмена возвращает документ
  const undoClear = useDocumentStore(canUndoClear);
  const canUndo = historyIndex > 0 || undoClear;
  const canRedo = historyIndex < operations.length;
  // CSG недоступен, если среди выбранных объектов есть non-manifold (import_mesh)
  // IMPORT-MESH-CSG: импорт (STL, 3D-текст) не блокируется по типу — замкнутость проверяет
  // воркер; незамкнутый меш → уведомление errors.csgNonManifold.
  // N-ARY-CSG: union — N выбранных; subtract/intersect — группы A/B или «первый против остальных»
  const canCsg = !busy && resolveCsgOperands(selectedIds, csgGroups, objects) !== null;
  const canMirror = selectedIds.length > 0 && !busy;
  // ALIGN-UI-REVIT: «Выровнять» — режим (плоскость → грань B), нужен хотя бы один объект
  const canAlign = objectList.length > 0 && !busy;
  const canResize =
    selectedIds.length === 1 &&
    firstSelected?.shapeType !== "import_mesh" &&
    !busy;
  const canExtrude = selectedIds.length === 1 && !busy;
  const hasCopied = clipboard.length > 0;

  // Mirror preview (MIRROR-2): debounce to avoid excessive worker calls
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePreviewMirror = useCallback(
    (plane: 'XY' | 'XZ' | 'YZ') => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      setMirrorPreviewPlane(plane);
      previewTimerRef.current = setTimeout(() => {
        previewMirror(plane);
      }, 150); // 150ms debounce
    },
    [previewMirror, setMirrorPreviewPlane],
  );
  const handlePreviewMirrorEnd = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreviewObject(null);
    setMirrorPreviewPlane(null);
  }, [setPreviewObject, setMirrorPreviewPlane]);

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

  return (
    <div className="app">

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

      {/* ── Подтверждение очистки сцены (UX-AUDIT-2) ── */}
      {showClearConfirm && (
        <ConfirmModal
          title={t("confirmClear.title")}
          message={t("confirmClear.message")}
          confirmLabel={t("confirmClear.confirm")}
          onConfirm={() => {
            setShowClearConfirm(false);
            void clearScene();
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {/* ── Project Manager Modal ── */}
      {showPM && (
        <ProjectManagerModal
          onClose={() => setShowPM(false)}
          onLoad={async (id) => {
            await loadFromProject(id);
          }}
          onSave={saveToProject}
          currentProjectId={currentProjectId ?? undefined}
          setCurrentProjectId={(id) => { setCurrentProject(id ?? null) }}
        />
      )}

      {/* ── TOOLBAR ── */}
      <Toolbar
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
        alignActive={alignActive}
        canCsg={canCsg}
        theme={theme}
        onOpen={openProject}
        onSave={saveProject}
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
        onGizmo={(mode) => setGizmoMode((m) => (m === mode ? "none" : mode))}
        onToggleRuler={() => {
          setRulerActive((r) => !r);
          setRulerDist(null);
        }}
        onMirror={mirrorSelected}
        onPreviewMirror={handlePreviewMirror}
        onPreviewMirrorEnd={handlePreviewMirrorEnd}
        onAlignMode={() => (alignActive ? exitAlignMode() : startAlignMode())}
        onCsg={runCsg}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onClearScene={() => {
          if (objectList.length > 0 || operations.length > 0) setShowClearConfirm(true);
        }}
      />

      {/* ── MAIN ── */}
      <div className="main">
        {/* UX-AUDIT-19: уведомления — в правом верхнем углу вьюпорта, не поверх тулбара и панели */}
        <ToastContainer />
        {/* ── Левая панель ── */}
        <LeftPanel
          shapeSearch={shapeSearch}
          onShapeSearchChange={setShapeSearch}
          workerOk={workerOk}
          busy={busy}
          onAddShape={handleAddShape}
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
            setTlFilter(key, checked)
          }
          onJumpHistory={jumpToHistory}
          onTimelineEdit={handleTimelineEdit}
        />

        {/* ── Вьюпорт ── */}
        <div className="viewport">
          {busy && (
            <div className="viewport-busy">
              <div
                className="spinner"
                style={{ width: 14, height: 14, borderWidth: 2 }}
              />
              {t("viewportStatus.computing")}
            </div>
          )}
          {!workerOk && (
            <div className="viewport-loading">
              <div className="spinner" />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {t("viewportStatus.loadingCsg")}
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
              workerOk={workerOk}
              cameraMode={cameraMode}
              previewObject={previewObject}
              mirrorPreviewPlane={mirrorPreviewPlane}
              theme={theme}
            />
          </ErrorBoundary>

          {/* Snap selector */}
          <div className="snap-selector">
            <span className="snap-label">{t("snap.label")}</span>
            {SNAP_VALUES.map((sv) => (
              <button
                key={sv.value}
                className={`snap-btn${snapValue === sv.value ? " active" : ""}`}
                onClick={() => setSnapValue(sv.value)}
                title={
                  sv.value === 0 ? t("snap.offTitle") : t("snap.valueTitle", { value: sv.value })
                }
              >
                {t(sv.labelKey)}
              </button>
            ))}
          </div>

          <div className="viewport-hint">
            {t("viewport.hint")}
          </div>

          {/* ── Ruler distance display — UX-AUDIT-24: во вьюпорте (под тулбаром любой высоты) ── */}
          {rulerDist !== null && (
            <div className="ruler-display">
              📏 {t("ruler.distance")}: <strong>{rulerDist.toFixed(2)} {t("units.mm")}</strong>
            </div>
          )}
        </div>

        {/* ── Правая панель ── */}
        <div className="panel-right">
          <div className="props-header">{t("properties.header")}</div>

          {alignActive ? <AlignPanel /> : hasSelectedStep ? <StepPanel /> : hasSelectedChild ? <ChildPropertiesPanel /> : <PropertiesPanel
            firstSelected={firstSelected}
            busy={busy}
            selectedIds={selectedIds}
            canResize={canResize}
            canCsg={canCsg}
            objectList={objectList}
            operationsLength={operations.length}
            fileName={fileName}
            currentProjectId={currentProjectId}
            currentProjectName={currentProjectName}
            modified={modified}
            onMoveAxis={handleMoveAxis}
            onRotAxis={handleRotAxis}
            onScaleAxis={handleScaleAxis}
            onResizeDim={handleResizeDim}
            onResizeObject={resizeObject}
            onCsg={runCsg}
            onSetColor={setColor}
            onToggleVisible={toggleVisible}
            onShowProjects={() => setShowPM(true)}
            onSaveToProject={saveToProject}
          />}
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
