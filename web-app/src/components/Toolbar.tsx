import type { GizmoMode } from "./Viewport3D";

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
  onAlign: (axis: "X" | "Y" | "Z", anchor: "min" | "center" | "max") => void;
  onCsg: (op: "union" | "subtract" | "intersect") => void;
  onToggleTheme: () => void;
  onClearScene: () => void;
}) {
  return (
    <div className="toolbar">
      <span className="toolbar-logo">⬛ TinkerCraft{titleSuffix}</span>

      <div className="toolbar-group">
        <button className="btn" onClick={onOpen} title="Открыть .doodle (Ctrl+O)">
          📂 Открыть
        </button>
        <button className="btn" onClick={onSave} title="Сохранить .doodle (Ctrl+S)">
          💾 Сохранить
        </button>
        <button className="btn" onClick={onExportStl} disabled={objectCount === 0} title="Экспорт STL">
          📐 STL
        </button>
        <button className="btn" onClick={onImportStl} disabled={busy} title="Импорт STL">
          📥 Импорт
        </button>
        <button className="btn" onClick={onShowProjects} title="Менеджер проектов">
          📁 Проекты
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={onUndo} disabled={!canUndo || busy} title="Отменить (Ctrl+Z)">
          ↩ Undo
        </button>
        <button className="btn" onClick={onRedo} disabled={!canRedo || busy} title="Повторить (Ctrl+Y)">
          ↪ Redo
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={onCopy} disabled={selectedCount === 0} title="Копировать (Ctrl+C)">
          ⧉ Copy
        </button>
        <button className="btn" onClick={onPaste} disabled={!hasCopied || busy} title="Вставить (Ctrl+V)">
          📋 Paste
        </button>
        <button className="btn" onClick={onDelete} disabled={selectedCount === 0 || busy} title="Удалить (Del)">
          🗑 Del
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={onFitView} title="Fit view (F)">
          🔍 Fit
        </button>
        <button className="btn" onClick={onResetView} title="Сброс вида (H)">
          🏠 Home
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
          ⤢ Move
        </button>
        <button
          className={`btn${gizmoMode === "rotate" ? " active" : ""}`}
          disabled={selectedCount === 0}
          onClick={() => onGizmo("rotate")}
          title="Повернуть (R)"
        >
          ↻ Rotate
        </button>
        <button
          className={`btn${gizmoMode === "scale" ? " active" : ""}`}
          disabled={selectedCount === 0}
          onClick={() => onGizmo("scale")}
          title="Масштаб (S)"
        >
          ⤡ Scale
        </button>
        {gizmoMode !== null && (
          <button className="btn danger" onClick={() => onGizmo(null)} title="Выйти (Esc)">
            ✕
          </button>
        )}
      </div>

      <div className="toolbar-group">
        <button
          className={`btn${rulerActive ? " active" : ""}`}
          onClick={onToggleRuler}
          title="Линейка — 2 клика для измерения расстояния"
        >
          📏 Линейка
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" disabled={!canMirror} onClick={() => onMirror("YZ")} title="Зеркало YZ">
          ⟺YZ
        </button>
        <button className="btn" disabled={!canMirror} onClick={() => onMirror("XZ")} title="Зеркало XZ">
          ⟺XZ
        </button>
        <button className="btn" disabled={!canMirror} onClick={() => onMirror("XY")} title="Зеркало XY">
          ⟺XY
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" disabled={!canAlign} onClick={() => onAlign("X", "min")} title="◧X">
          ◧X
        </button>
        <button className="btn" disabled={!canAlign} onClick={() => onAlign("X", "center")} title="⊡X">
          ⊡X
        </button>
        <button className="btn" disabled={!canAlign} onClick={() => onAlign("X", "max")} title="◨X">
          ◨X
        </button>
        <button className="btn" disabled={!canAlign} onClick={() => onAlign("Y", "center")} title="⊡Y">
          ⊡Y
        </button>
        <button className="btn" disabled={!canAlign} onClick={() => onAlign("Z", "center")} title="⊡Z">
          ⊡Z
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn primary" disabled={!canCsg} onClick={() => onCsg("union")}>∪</button>
        <button className="btn primary" disabled={!canCsg} onClick={() => onCsg("subtract")}>−</button>
        <button className="btn primary" disabled={!canCsg} onClick={() => onCsg("intersect")}>∩</button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={onToggleTheme} title="Сменить тему">
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn danger" onClick={onClearScene} disabled={busy} title="Очистить сцену">
          ✖ Clear
        </button>
      </div>
    </div>
  );
}
