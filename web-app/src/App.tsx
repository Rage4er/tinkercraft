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
import DimensionPanel from "./components/DimensionPanel";
import DimensionSettingsModal from "./components/DimensionSettingsModal";
import SettingsModal from "./components/SettingsModal";
import { useSettingsStore } from "./store/settings";
import { lengthLabel } from "./store/units";
import { themeById } from "./themes";
import { useDimensionModeStore } from "./store/dimension-mode";
import { useDimensionsStore } from "./store/dimensions-store";
import { useDimensionMode } from "./hooks/useDimensionMode";
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
import { usePlacementModeStore } from "./store/placement-mode";
import { usePlacementMode } from "./hooks/usePlacementMode";
import { resolveHotkey, NO_REPEAT, mirrorPlaneOf, csgOpOf, isTextEntry, tabTogglesCamera } from "./hotkeys";
import { useSelectedChildGuard } from "./hooks/useSelectedChildGuard";
import { useSelectedStepGuard } from "./hooks/useSelectedStepGuard";
import { useTimelineEdit } from "./hooks/useTimelineEdit";
import { useCsgGroupModeStore, csgButtonStates } from "./store/csg-group-mode";
import { useCsgGroupMode } from "./hooks/useCsgGroupMode";
import { undoWithDimensions, redoWithDimensions, canUndoDimension, canRedoDimension } from "./store/dimension-undo";
import type {
  TransformNR,
  ShapeParams,
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
    showDimensionSettings, setShowDimensionSettings,
    showSettings, setShowSettings,
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
      showDimensionSettings: s.showDimensionSettings, setShowDimensionSettings: s.setShowDimensionSettings,
      showSettings: s.showSettings, setShowSettings: s.setShowSettings,
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

  // APP-SETTINGS: тема — из настроек (localStorage); ui-store.theme — её база (dark / light) для сцены и стилей
  const themeId = useSettingsStore((s) => s.theme);
  const setThemeId = useSettingsStore((s) => s.setTheme);
  const lengthUnit = useSettingsStore((s) => s.units);
  useEffect(() => {
    setTheme(themeById(themeId).base);
  }, [themeId, setTheme]);
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
    objects, selectedIds, busy, deleteSelected, selectObjects,
    saveProject, openProject, clearSelection, copySelected, pasteClipboard,
    mirrorSelected,
    modalOpen: showTextModal || showPM || showClearConfirm || showDimensionSettings || showSettings,
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
        // CSG-GROUP-FIX: U — сразу; X / I — режим A → B → Enter (в режиме — подтвердить / сменить)
        if (!kb.busy) void useCsgGroupModeStore.getState().pressCsgOperation(csgOp);
        return;
      }
      switch (action) {
        case "delete": void kb.deleteSelected(); break;
        // DIMENSION-UNDO: Ctrl+Z / Ctrl+Y — и действия с размерами (в общем порядке с шагами документа)
        case "undo": void undoWithDimensions(); break;
        case "redo": void redoWithDimensions(); break;
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
        // DIMENSIONS: D — режим «Размер» (вход / выход)
        case "dimension":
          useDimensionModeStore.getState().toggleDimensionMode();
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

  // PLUG-AND-PLAY: клик по фигуре палитры — режим размещения (превью → клик по грани / сетке,
  // X / Y / Z — плоскость оси, Enter — поставить, Esc / правый клик — отмена)
  const handleAddShape = usePlacementModeStore((s) => s.startPlacement);
  usePlacementMode(showTextModal || showPM || showClearConfirm || showDimensionSettings || showSettings);
  // DIMENSIONS: режим «Размер» (Esc), Delete по выделенному размеру, согласованность режимов
  useDimensionMode(showTextModal || showPM || showClearConfirm || showDimensionSettings || showSettings);
  const dimensionActive = useDimensionModeStore((s) => s.dimensionMode !== null);
  const dimensionsVisible = useDimensionsStore((s) => s.showDimensions);
  const hasSelectedDimension = useDimensionsStore((s) => s.selectedDimensionId !== null);

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

  // CSG-GROUP-FIX: «Объединение» — сразу; «Вычитание» / «Пересечение» — режим A → B → Enter
  // (Enter / Esc, исчезнувшие объекты A, выход при «Выровнять» — useCsgGroupMode)
  const csgGroupMode = useCsgGroupModeStore((s) => s.csgGroupMode);
  useCsgGroupMode(showTextModal || showPM || showClearConfirm || showSettings);
  const runCsg = useCallback(
    (op: CsgBooleanOp) => void useCsgGroupModeStore.getState().pressCsgOperation(op),
    [],
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
  // DIMENSION-UNDO: отменить / вернуть можно и действие с размером (на текущей позиции документа)
  const dimUndo = useDimensionsStore((s) => canUndoDimension(s.undoStack, historyIndex));
  const dimRedo = useDimensionsStore((s) => canRedoDimension(s.redoStack, historyIndex));
  const canUndo = historyIndex > 0 || undoClear || dimUndo;
  const canRedo = historyIndex < operations.length || dimRedo;
  // CSG недоступен, если среди выбранных объектов есть non-manifold (import_mesh)
  // IMPORT-MESH-CSG: импорт (STL, 3D-текст) не блокируется по типу — замкнутость проверяет
  // воркер; незамкнутый меш → уведомление errors.csgNonManifold.
  // N-ARY-CSG: union — N выбранных → один CSG; CSG-GROUP-FIX: subtract/intersect — от 1
  // выбранного (режим A → B → Enter); доступность каждой кнопки — csgButtonStates
  const csgOpStates = useMemo(
    () => csgButtonStates(selectedIds, objects, csgGroupMode),
    [selectedIds, objects, csgGroupMode],
  );
  const canCsg = !busy && (selectedIds.length > 0 || csgGroupMode !== null);
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

      {/* DIMENSIONS: «Настройки размеров» */}
      {showDimensionSettings && <DimensionSettingsModal onClose={() => setShowDimensionSettings(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

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
        dimensionActive={dimensionActive}
        dimensionsVisible={dimensionsVisible}
        onDimensionMode={() => useDimensionModeStore.getState().toggleDimensionMode()}
        onDimensionSettings={() => setShowDimensionSettings(true)}
        onToggleDimensions={() => useDimensionsStore.getState().toggleShowDimensions()}
        canMirror={canMirror}
        canAlign={canAlign}
        alignActive={alignActive}
        canCsg={canCsg}
        csgOpStates={csgOpStates}
        theme={theme}
        onOpen={openProject}
        onSave={saveProject}
        onExportStl={exportStl}
        onImportStl={importStl}
        onShowProjects={() => setShowPM(true)}
        onUndo={() => void undoWithDimensions()}
        onRedo={() => void redoWithDimensions()}
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
        onToggleTheme={() => setThemeId(theme === "dark" ? "light" : "dark")}
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
              📏 {t("ruler.distance")}: <strong>{lengthLabel(t, rulerDist, lengthUnit, 2)}</strong>
            </div>
          )}
        </div>

        {/* ── Правая панель ── */}
        <div className="panel-right">
          <div className="props-header">{t("properties.header")}</div>

          {alignActive ? <AlignPanel /> : hasSelectedDimension ? <DimensionPanel /> : hasSelectedStep ? <StepPanel /> : hasSelectedChild ? <ChildPropertiesPanel /> : <PropertiesPanel
            firstSelected={firstSelected}
            busy={busy}
            selectedIds={selectedIds}
            canResize={canResize}
            canCsg={canCsg}
            csgOpStates={csgOpStates}
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
