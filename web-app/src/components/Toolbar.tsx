import type { GizmoMode } from "./Viewport3D";
import MirrorButtons from "./MirrorButtons";
import AlignButtons from "./AlignButtons";
import CsgButtons from "./CsgButtons";
import {
  OpenIcon,
  SaveIcon,
  ImportIcon,
  ExportIcon,
  FolderIcon,
  UndoIcon,
  RedoIcon,
  CopyIcon,
  PasteIcon,
  DeleteIcon,
  FitViewIcon,
  HomeIcon,
  MoveIcon,
  RotateIcon,
  ScaleIcon,
  CloseIcon,
  RulerIcon,
  CubeIcon,
} from "./icons";

export default function Toolbar({
  titleSuffix,
  objectCount,
  selectedCount,
  canUndo,
  canRedo,
  hasCopied,
  busy,
  workerOk,
  cameraMode,
  gizmoMode,
  rulerActive,
  canMirror,
  canAlign,
  canCsg,
  nonManifoldSelected,
  theme,
  onOpen,
  onSave,
  onExportStl,
  onImportStl,
  onShowProjects,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDelete,
  onFitView,
  onResetView,
  onToggleCamera,
  onGizmo,
  onToggleRuler,
  onMirror,
  onPreviewMirror,
  onPreviewMirrorEnd,
  onAlign,
  onCsg,
  onToggleTheme,
  onClearScene,
}: {
  titleSuffix: string;
  objectCount: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  hasCopied: boolean;
  busy: boolean;
  workerOk: boolean;
  cameraMode: "perspective" | "orthographic";
  gizmoMode: GizmoMode;
  rulerActive: boolean;
  canMirror: boolean;
  canAlign: boolean;
  canCsg: boolean;
  nonManifoldSelected?: boolean;
  theme: "dark" | "light";
  onOpen: () => void;
  onSave: () => void;
  onExportStl: () => void;
  onImportStl: () => void;
  onShowProjects: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onFitView: () => void;
  onResetView: () => void;
  onToggleCamera: () => void;
  onGizmo: (mode: GizmoMode) => void;
  onToggleRuler: () => void;
  onMirror: (plane: "XY" | "XZ" | "YZ") => void;
  onPreviewMirror?: (plane: "XY" | "XZ" | "YZ") => void;
  onPreviewMirrorEnd?: () => void;
  onAlign: (axis: "X" | "Y" | "Z", anchor: "min" | "center" | "max") => void;
  onCsg: (op: "union" | "subtract" | "intersect") => void;
  onToggleTheme: () => void;
  onClearScene: () => void;
}) {
  return (
    <div
      className="toolbar"
      role="toolbar"
      aria-label="Панель инструментов"
    >
      <span className="toolbar-logo"><CubeIcon size={16} /> TinkerCraft{titleSuffix}</span>

      <div className="toolbar-group">
        <button className="btn" onClick={onOpen} title="Открыть .doodle (Ctrl+O)">
          <OpenIcon size={16} /> Открыть
        </button>
        <button className="btn" onClick={onSave} title="Сохранить .doodle (Ctrl+S)">
          <SaveIcon size={16} /> Сохранить
        </button>
        <button className="btn" onClick={onExportStl} disabled={objectCount === 0} title="Экспорт STL">
          <ExportIcon size={16} /> STL
        </button>
        <button className="btn" onClick={onImportStl} disabled={busy} title="Импорт STL">
          <ImportIcon size={16} /> Импорт
        </button>
        <button className="btn" onClick={onShowProjects} title="Менеджер проектов">
          <FolderIcon size={16} /> Проекты
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={onUndo} disabled={!canUndo || busy} title="Отменить (Ctrl+Z)">
          <UndoIcon size={16} /> Undo
        </button>
        <button className="btn" onClick={onRedo} disabled={!canRedo || busy} title="Повторить (Ctrl+Y)">
          <RedoIcon size={16} /> Redo
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={onCopy} disabled={selectedCount === 0} title="Копировать (Ctrl+C)">
          <CopyIcon size={16} /> Copy
        </button>
        <button className="btn" onClick={onPaste} disabled={!hasCopied || busy} title="Вставить (Ctrl+V)">
          <PasteIcon size={16} /> Paste
        </button>
        <button className="btn" onClick={onDelete} disabled={selectedCount === 0 || busy} title="Удалить (Del)">
          <DeleteIcon size={16} /> Del
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={onFitView} title="Fit view (F)">
          <FitViewIcon size={16} /> Fit
        </button>
        <button className="btn" onClick={onResetView} title="Сброс вида (H)">
          <HomeIcon size={16} /> Home
        </button>
        <button
          className={`btn${cameraMode === "orthographic" ? " active" : ""}`}
          onClick={onToggleCamera}
          title="Перспектива ↔ Ортография"
        >
          {cameraMode === "perspective" ? "⬡ Persp" : "⬡ Ortho"}
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className={`btn${gizmoMode === "translate" ? " active" : ""}`}
          disabled={selectedCount === 0}
          onClick={() => onGizmo("translate")}
          title="Переместить (G)"
        >
          <MoveIcon size={16} /> Move
        </button>
        <button
          className={`btn${gizmoMode === "rotate" ? " active" : ""}`}
          disabled={selectedCount === 0}
          onClick={() => onGizmo("rotate")}
          title="Повернуть (R)"
        >
          <RotateIcon size={16} /> Rotate
        </button>
        <button
          className={`btn${gizmoMode === "scale" ? " active" : ""}`}
          disabled={selectedCount === 0}
          onClick={() => onGizmo("scale")}
          title="Масштаб (S)"
        >
          <ScaleIcon size={16} /> Scale
        </button>
        {gizmoMode !== "none" && (
          <button className="btn danger" onClick={() => onGizmo("none")} title="Выйти (Esc)">
            <CloseIcon size={16} />
          </button>
        )}
      </div>

      <div className="toolbar-group">
        <button
          className={`btn${rulerActive ? " active" : ""}`}
          onClick={onToggleRuler}
          title="Линейка — 2 клика для измерения расстояния"
        >
          <RulerIcon size={16} /> Линейка
        </button>
      </div>

      <MirrorButtons
        disabled={!canMirror}
        onMirror={onMirror}
        onPreviewMirror={onPreviewMirror}
        onPreviewEnd={onPreviewMirrorEnd}
      />

      <AlignButtons disabled={!canAlign} onAlign={onAlign} />

      <CsgButtons disabled={!canCsg} onCsg={onCsg} nonManifoldSelected={nonManifoldSelected} />

      <div className="toolbar-group">
        <button className="btn" onClick={onToggleTheme} title="Сменить тему">
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn danger" onClick={onClearScene} disabled={busy} title="Очистить сцену">
          <CloseIcon size={16} /> Clear
        </button>
      </div>
    </div>
  );
}
