import type { GizmoMode } from "./Viewport3D";
import { useTranslation } from "react-i18next";
import MirrorButtons from "./MirrorButtons";
import AlignButtons from "./AlignButtons";
import CsgButtons from "./CsgButtons";
import IconButton from "./IconButton";
import ToolbarRowSplit from "./ToolbarRowSplit";
import { TOOLTIP_DATA, type TooltipData } from "../constants";
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
  TCLogoIcon,
  PerspectiveIcon,
  ThemeIcon,
} from "./icons";
import { useToolbarLayout } from "../hooks/useToolbarLayout";
import type { ToolbarGroup } from "../utils/toolbar-layout";

export default function Toolbar({
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
  objectCount: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  hasCopied: boolean;
  busy: boolean;
  workerOk: boolean;
  cameraMode: "perspective" | "orthographic";
  gizmoMode: "translate" | "rotate" | "scale" | "none";
  rulerActive: boolean;
  canMirror: boolean;
  canAlign: boolean;
  canCsg: boolean;
  nonManifoldSelected: boolean;
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
  onGizmo: (mode: "translate" | "rotate" | "scale" | "none") => void;
  onToggleRuler: () => void;
  onMirror: (plane: "XY" | "XZ" | "YZ") => void;
  onPreviewMirror: (plane: "XY" | "XZ" | "YZ") => void;
  onPreviewMirrorEnd: () => void;
  onAlign: (axis: "X" | "Y" | "Z", anchor: "min" | "center" | "max") => void;
  onCsg: (op: "union" | "subtract" | "intersect") => void;
  onToggleTheme: () => void;
  onClearScene: () => void;
}) {
  const { t } = useTranslation();
  // Определяем группы для алгоритма
  const groups: ToolbarGroup[] = [
    { id: "file", buttonCount: 5 },
    { id: "edit1", buttonCount: 2 },
    { id: "edit2", buttonCount: 3 },
    { id: "view", buttonCount: 3 },
    { id: "gizmo", buttonCount: 4 },
    { id: "ruler", buttonCount: 1 },
    { id: "mirror", buttonCount: 3 },
    { id: "align", buttonCount: 9 },
    { id: "csg", buttonCount: 3 },
    { id: "theme", buttonCount: 1 },
    { id: "clear", buttonCount: 1 },
  ]

  const { toolbarRef, rowsMap } = useToolbarLayout(groups)

  // Helper: получить rows для группы по id
  const getRows = (groupId: string): number => {
    return rowsMap[groupId] ?? 1
  }

  return (
    <div
      ref={toolbarRef}
      className="toolbar"
      role="toolbar"
      aria-label={t("toolbar.label")}
    >
      <span className="toolbar-logo"><TCLogoIcon size={34} /> {t("app.name")}</span>

      {/* Group 0: File */}
      <ToolbarRowSplit
        rows={getRows("file")}
        buttons={[
          <IconButton key="open" icon={<OpenIcon size={32} />} label={t("actions.open")} onClick={onOpen} tooltip={TOOLTIP_DATA.open} />,
          <IconButton key="save" icon={<SaveIcon size={32} />} label={t("actions.save")} onClick={onSave} tooltip={TOOLTIP_DATA.save} />,
          <IconButton key="export" icon={<ExportIcon size={32} />} label="STL" onClick={onExportStl} disabled={objectCount === 0} tooltip={TOOLTIP_DATA.export_stl} />,
          <IconButton key="import" icon={<ImportIcon size={32} />} label={t("actions.import")} onClick={onImportStl} disabled={busy} tooltip={TOOLTIP_DATA.import_stl} />,
          <IconButton key="projects" icon={<FolderIcon size={32} />} label={t("properties.projectManager")} onClick={onShowProjects} tooltip={TOOLTIP_DATA.projects} />,
        ]}
      />
      <div className="toolbar-separator" />

      {/* Group 1: Undo/Redo */}
      <ToolbarRowSplit
        rows={getRows("edit1")}
        buttons={[
          <IconButton key="undo" icon={<UndoIcon size={32} />} label={t("actions.undo")} onClick={onUndo} disabled={!canUndo || busy} tooltip={TOOLTIP_DATA.undo} />,
          <IconButton key="redo" icon={<RedoIcon size={32} />} label={t("actions.redo")} onClick={onRedo} disabled={!canRedo || busy} tooltip={TOOLTIP_DATA.redo} />,
        ]}
      />
      <div className="toolbar-separator" />

      {/* Group 2: Copy/Paste/Delete */}
      <ToolbarRowSplit
        rows={getRows("edit2")}
        buttons={[
          <IconButton key="copy" icon={<CopyIcon size={32} />} label={t("actions.copy")} onClick={onCopy} disabled={selectedCount === 0} tooltip={TOOLTIP_DATA.copy} />,
          <IconButton key="paste" icon={<PasteIcon size={32} />} label={t("actions.paste")} onClick={onPaste} disabled={!hasCopied || busy} tooltip={TOOLTIP_DATA.paste} />,
          <IconButton key="delete" icon={<DeleteIcon size={32} />} label={t("actions.delete")} onClick={onDelete} disabled={selectedCount === 0 || busy} tooltip={TOOLTIP_DATA.delete} />,
        ]}
      />
      <div className="toolbar-separator" />

      {/* Group 3: View */}
      <ToolbarRowSplit
        rows={getRows("view")}
        buttons={[
          <IconButton key="fit" icon={<FitViewIcon size={32} />} label={t("tools.fitView")} onClick={onFitView} tooltip={TOOLTIP_DATA.fit_view} />,
          <IconButton key="home" icon={<HomeIcon size={32} />} label={t("tools.homeView")} onClick={onResetView} tooltip={TOOLTIP_DATA.home_view} />,
          <IconButton key="camera" icon={<PerspectiveIcon size={32} />} label={cameraMode === "perspective" ? t("tools.persp") : t("tools.ortho")} onClick={onToggleCamera} tooltip={TOOLTIP_DATA.toggle_camera} buttonVariant={cameraMode === "orthographic" ? "active" : "default"} />,
        ]}
      />
      <div className="toolbar-separator" />

      {/* Group 4: Gizmo */}
      <ToolbarRowSplit
        rows={getRows("gizmo")}
        buttons={[
          <IconButton key="move" icon={<MoveIcon size={32} />} label={t("tools.move")} onClick={() => onGizmo("translate")} disabled={selectedCount === 0} tooltip={TOOLTIP_DATA.gizmo_translate} buttonVariant={gizmoMode === "translate" ? "active" : "default"} />,
          <IconButton key="rotate" icon={<RotateIcon size={32} />} label={t("tools.rotate")} onClick={() => onGizmo("rotate")} disabled={selectedCount === 0} tooltip={TOOLTIP_DATA.gizmo_rotate} buttonVariant={gizmoMode === "rotate" ? "active" : "default"} />,
          <IconButton key="scale" icon={<ScaleIcon size={32} />} label={t("tools.scale")} onClick={() => onGizmo("scale")} disabled={selectedCount === 0} tooltip={TOOLTIP_DATA.gizmo_scale} buttonVariant={gizmoMode === "scale" ? "active" : "default"} />,
          ...(gizmoMode !== "none" ? [<IconButton key="exit" icon={<CloseIcon size={32} />} onClick={() => onGizmo("none")} tooltip={TOOLTIP_DATA.gizmo_exit} buttonVariant="danger" />] : []),
        ]}
      />
      <div className="toolbar-separator" />

      {/* Group 5: Ruler */}
      <ToolbarRowSplit
        rows={getRows("ruler")}
        buttons={[
          <IconButton key="ruler" icon={<RulerIcon size={32} />} label={t("tools.ruler")} onClick={onToggleRuler} tooltip={TOOLTIP_DATA.ruler} buttonVariant={rulerActive ? "active" : "default"} />,
        ]}
      />
      <div className="toolbar-separator" />

      {/* Group 6: Mirror */}
      <MirrorButtons
        disabled={!canMirror}
        onMirror={onMirror}
        onPreviewMirror={onPreviewMirror}
        onPreviewEnd={onPreviewMirrorEnd}
        maxRows={getRows("mirror")}
      />
      <div className="toolbar-separator" />

      {/* Group 7: Align */}
      <AlignButtons disabled={!canAlign} onAlign={onAlign} maxRows={getRows("align")} />
      <div className="toolbar-separator" />

      {/* Group 8: CSG */}
      <CsgButtons disabled={!canCsg} onCsg={onCsg} nonManifoldSelected={nonManifoldSelected} maxRows={getRows("csg")} />
      <div className="toolbar-separator" />

      {/* Group 9: Theme */}
      <ToolbarRowSplit
        rows={getRows("theme")}
        buttons={[
          <IconButton
            key="theme"
            icon={<ThemeIcon size={32} />}
            label={theme === "dark" ? t("theme.light") : t("theme.dark")}
            onClick={onToggleTheme}
            tooltip={TOOLTIP_DATA.theme_toggle}
          />,
        ]}
      />
      <div className="toolbar-separator" />

      {/* Group 10: Clear */}
      <ToolbarRowSplit
        rows={getRows("clear")}
        buttons={[
          <IconButton key="clear" icon={<CloseIcon size={32} />} label={t("actions.clearScene")} onClick={onClearScene} disabled={busy} tooltip={TOOLTIP_DATA.clear_scene} buttonVariant="danger" />,
        ]}
      />
    </div>
  );
}
