import type { GizmoMode } from "./Viewport3D";
import MirrorButtons from "./MirrorButtons";
import AlignButtons from "./AlignButtons";
import CsgButtons from "./CsgButtons";
import IconButton from "./IconButton";
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
        <IconButton icon={<OpenIcon size={16} />} label="Открыть" onClick={onOpen} title="Открыть .doodle (Ctrl+O)" />
        <IconButton icon={<SaveIcon size={16} />} label="Сохранить" onClick={onSave} title="Сохранить .doodle (Ctrl+S)" />
        <IconButton icon={<ExportIcon size={16} />} label="STL" onClick={onExportStl} disabled={objectCount === 0} title="Экспорт STL" />
        <IconButton icon={<ImportIcon size={16} />} label="Импорт" onClick={onImportStl} disabled={busy} title="Импорт STL" />
        <IconButton icon={<FolderIcon size={16} />} label="Проекты" onClick={onShowProjects} title="Менеджер проектов" />
      </div>

      <div className="toolbar-group">
        <IconButton icon={<UndoIcon size={16} />} label="Undo" onClick={onUndo} disabled={!canUndo || busy} title="Отменить (Ctrl+Z)" />
        <IconButton icon={<RedoIcon size={16} />} label="Redo" onClick={onRedo} disabled={!canRedo || busy} title="Повторить (Ctrl+Y)" />
      </div>

      <div className="toolbar-group">
        <IconButton icon={<CopyIcon size={16} />} label="Copy" onClick={onCopy} disabled={selectedCount === 0} title="Копировать (Ctrl+C)" />
        <IconButton icon={<PasteIcon size={16} />} label="Paste" onClick={onPaste} disabled={!hasCopied || busy} title="Вставить (Ctrl+V)" />
        <IconButton icon={<DeleteIcon size={16} />} label="Del" onClick={onDelete} disabled={selectedCount === 0 || busy} title="Удалить (Del)" />
      </div>

      <div className="toolbar-group">
        <IconButton icon={<FitViewIcon size={16} />} label="Fit" onClick={onFitView} title="Fit view (F)" />
        <IconButton icon={<HomeIcon size={16} />} label="Home" onClick={onResetView} title="Сброс вида (H)" />
        <button
          className={`btn${cameraMode === "orthographic" ? " active" : ""}`}
          onClick={onToggleCamera}
          title="Перспектива ↔ Ортография"
        >
          {cameraMode === "perspective" ? "⬡ Persp" : "⬡ Ortho"}
        </button>
      </div>

      <div className="toolbar-group">
        <IconButton
          icon={<MoveIcon size={16} />} label="Move"
          onClick={() => onGizmo("translate")}
          disabled={selectedCount === 0}
          title="Переместить (G)"
          buttonVariant={gizmoMode === "translate" ? "active" : "default"}
        />
        <IconButton
          icon={<RotateIcon size={16} />} label="Rotate"
          onClick={() => onGizmo("rotate")}
          disabled={selectedCount === 0}
          title="Повернуть (R)"
          buttonVariant={gizmoMode === "rotate" ? "active" : "default"}
        />
        <IconButton
          icon={<ScaleIcon size={16} />} label="Scale"
          onClick={() => onGizmo("scale")}
          disabled={selectedCount === 0}
          title="Масштаб (S)"
          buttonVariant={gizmoMode === "scale" ? "active" : "default"}
        />
        {gizmoMode !== "none" && (
          <IconButton icon={<CloseIcon size={16} />} onClick={() => onGizmo("none")} title="Выйти (Esc)" buttonVariant="danger" />
        )}
      </div>

      <div className="toolbar-group">
        <IconButton
          icon={<RulerIcon size={16} />} label="Линейка"
          onClick={onToggleRuler}
          title="Линейка — 2 клика для измерения расстояния"
          buttonVariant={rulerActive ? "active" : "default"}
        />
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
        <IconButton
          icon={theme === "dark" ? <span title="Сменить тему">☀</span> : <span title="Сменить тему">🌙</span>}
          label={theme === "dark" ? "Light" : "Dark"}
          onClick={onToggleTheme}
          title="Сменить тему"
        />
      </div>

      <div className="toolbar-group">
        <IconButton icon={<CloseIcon size={16} />} label="Clear" onClick={onClearScene} disabled={busy} title="Очистить сцену" buttonVariant="danger" />
      </div>
    </div>
  );
}
