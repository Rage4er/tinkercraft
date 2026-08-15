// ============================================================
// Constants — Pure data (NO React, NO JSX)
// ============================================================
// Этот файл НЕ импортирует React/JSX, поэтому воркер может безопасно
// импортировать отсюда константы без активации React Refresh в бандле.
// React-компоненты и иконки находятся в constants-react.tsx.

import type { ShapeType } from "./csg/types";

// ---- Shapes (data only, NO JSX) ----
// Иконки — это строковые ключи, не React-компоненты.
// UI-слой подставляет реальные иконки из constants.tsx.
export const ALL_SHAPES_DATA: {
  type: ShapeType | "text";
  labelKey: string;
  iconKey: string;
  categoryKey: string;
}[] = [
    { type: "cube", labelKey: "shapes.cube", iconKey: "cube", categoryKey: "shapesCategory.basic" },
    { type: "sphere", labelKey: "shapes.sphere", iconKey: "sphere", categoryKey: "shapesCategory.basic" },
    { type: "cylinder", labelKey: "shapes.cylinder", iconKey: "cylinder", categoryKey: "shapesCategory.basic" },
    { type: "cone", labelKey: "shapes.cone", iconKey: "cone", categoryKey: "shapesCategory.basic" },
    { type: "torus", labelKey: "shapes.torus", iconKey: "torus", categoryKey: "shapesCategory.basic" },
    { type: "prism", labelKey: "shapes.prism", iconKey: "prism", categoryKey: "shapesCategory.basic" },
    { type: "pyramid", labelKey: "shapes.pyramid", iconKey: "pyramid", categoryKey: "shapesCategory.basic" },
    { type: "text", labelKey: "shapes.text", iconKey: "text", categoryKey: "shapesCategory.special" },
  ];

// ---- Snap values ----
// i18n: labels resolved at render time via t('snap.off'), t('snap.0.1'), etc.
export const SNAP_VALUES: { labelKey: string; value: number }[] = [
  { labelKey: "snap.off", value: 0 },
  { labelKey: "snap.0.1", value: 0.1 },
  { labelKey: "snap.0.5", value: 0.5 },
  { labelKey: "snap.1", value: 1 },
  { labelKey: "snap.5", value: 5 },
  { labelKey: "snap.10", value: 10 },
];

// ---- Timeline filter labels ----
// i18n: labels resolved at render time via t('filters.add_shape'), etc.
export const OP_FILTER_LABELS: Record<string, string> = {
  add_shape: "filters.add_shape",
  import_mesh: "filters.import_mesh",
  move: "filters.move",
  resize_dims: "filters.resize_dims",
  fillet: "filters.fillet",
  mirror: "filters.mirror",
  align: "filters.align",
  group: "filters.group",
  delete: "filters.delete",
  visibility: "filters.visibility",
  color: "filters.color",
  rename: "filters.rename",
};

// ---- Default filters (all enabled) ----
export const DEFAULT_FILTERS = Object.fromEntries(
  Object.keys(OP_FILTER_LABELS).map((k) => [k, true]),
);

// ---- Layout / spacing ----
/** Offset between consecutively created objects (mm) — prevents overlap. */
export const OBJECT_SPACING = 25;
/** Offset applied to pasted objects on XZ plane (mm). */
export const PASTE_OFFSET = 15;

// ---- Timing ----
/** Delay before autosave triggers after last change (ms). */
export const AUTOSAVE_DELAY_MS = 3000;

// ---- Numeric epsilon ----
/** Epsilon for detecting meaningful position/rotation/scale changes in move operations. */
export const MOVE_DELTA_EPSILON = 1e-6;

// ---- Fillet ----
/** Safety margin subtracted from max possible fillet radius. */
export const FILLET_EPSILON = 0.1;
/** Minimum allowed fillet radius (mm). */
export const FILLET_MIN_RADIUS = 0.01;

// ---- Vertex merge precision (STL import) ----
/** Rounding precision for merging coincident vertices during STL import. */
export const VERTEX_MERGE_PRECISION = 1e5;

// ---- Object colors ----
/** Default palette for object colors, cycled via colorForIndex(). */
export const OBJECT_COLORS = [
  '#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7',
  '#f38ba8', '#94e2d5', '#fab387', '#74c7ec',
];

// ============================================================
// Tooltip data — two-level tooltips for all toolbar buttons
// Level 1 (instant): label + shortcut
// Level 2 (after 1.5s): description
// ============================================================

export interface TooltipData {
  labelKey: string
  shortcut?: string
  descriptionKey?: string
}

export const TOOLTIP_DATA: Record<string, TooltipData> = {
  // --- File operations ---
  open: { labelKey: 'actions.open', shortcut: 'Ctrl+O', descriptionKey: 'tooltips.open' },
  save: { labelKey: 'actions.save', shortcut: 'Ctrl+S', descriptionKey: 'tooltips.save' },
  export_stl: { labelKey: 'actions.export', descriptionKey: 'tooltips.exportStl' },
  import_stl: { labelKey: 'actions.import', descriptionKey: 'tooltips.importStl' },
  projects: { labelKey: 'properties.projectManager', descriptionKey: 'tooltips.projects' },

  // --- Edit operations ---
  undo: { labelKey: 'actions.undo', shortcut: 'Ctrl+Z', descriptionKey: 'tooltips.undo' },
  redo: { labelKey: 'actions.redo', shortcut: 'Ctrl+Y', descriptionKey: 'tooltips.redo' },
  copy: { labelKey: 'actions.copy', shortcut: 'Ctrl+C', descriptionKey: 'tooltips.copy' },
  paste: { labelKey: 'actions.paste', shortcut: 'Ctrl+V', descriptionKey: 'tooltips.paste' },
  delete: { labelKey: 'actions.delete', shortcut: 'Del', descriptionKey: 'tooltips.delete' },

  // --- View operations ---
  fit_view: { labelKey: 'tools.fitView', shortcut: 'F', descriptionKey: 'tooltips.fitView' },
  home_view: { labelKey: 'tools.homeView', shortcut: 'H', descriptionKey: 'tooltips.homeView' },
  toggle_camera: { labelKey: 'tools.toggleCamera', shortcut: 'Tab', descriptionKey: 'tooltips.toggleCamera' },

  // --- Gizmo operations ---
  gizmo_translate: { labelKey: 'tools.move', shortcut: 'G', descriptionKey: 'tooltips.gizmoTranslate' },
  gizmo_rotate: { labelKey: 'tools.rotate', shortcut: 'R', descriptionKey: 'tooltips.gizmoRotate' },
  gizmo_scale: { labelKey: 'tools.scale', shortcut: 'S', descriptionKey: 'tooltips.gizmoScale' },
  gizmo_exit: { labelKey: 'tools.exit', shortcut: 'Esc', descriptionKey: 'tooltips.gizmoExit' },

  // --- Ruler ---
  ruler: { labelKey: 'tools.ruler', shortcut: 'L', descriptionKey: 'tooltips.ruler' },

  // --- Mirror ---
  mirror_yz: { labelKey: 'mirror.yz', shortcut: 'M', descriptionKey: 'tooltips.mirrorYz' },
  mirror_xz: { labelKey: 'mirror.xz', shortcut: 'N', descriptionKey: 'tooltips.mirrorXz' },
  mirror_xy: { labelKey: 'mirror.xy', shortcut: 'B', descriptionKey: 'tooltips.mirrorXy' },

  // --- Align (9 кнопок: X/Y/Z × min/center/max) ---
  align_x_min: { labelKey: 'align.x_min', descriptionKey: 'tooltips.alignXMin' },
  align_x_center: { labelKey: 'align.x_center', descriptionKey: 'tooltips.alignXCenter' },
  align_x_max: { labelKey: 'align.x_max', descriptionKey: 'tooltips.alignXMax' },
  align_y_min: { labelKey: 'align.y_min', descriptionKey: 'tooltips.alignYMin' },
  align_y_center: { labelKey: 'align.y_center', descriptionKey: 'tooltips.alignYCenter' },
  align_y_max: { labelKey: 'align.y_max', descriptionKey: 'tooltips.alignYMax' },
  align_z_min: { labelKey: 'align.z_min', descriptionKey: 'tooltips.alignZMin' },
  align_z_center: { labelKey: 'align.z_center', descriptionKey: 'tooltips.alignZCenter' },
  align_z_max: { labelKey: 'align.z_max', descriptionKey: 'tooltips.alignZMax' },

  // --- CSG operations ---
  csg_union: { labelKey: 'csg.union', shortcut: 'U', descriptionKey: 'tooltips.csgUnion' },
  csg_subtract: { labelKey: 'csg.subtract', shortcut: 'X', descriptionKey: 'tooltips.csgSubtract' },
  csg_intersect: { labelKey: 'csg.intersect', shortcut: 'I', descriptionKey: 'tooltips.csgIntersect' },

  // --- Theme ---
  theme_toggle: { labelKey: 'theme.toggle', descriptionKey: 'tooltips.themeToggle' },

  // --- Clear ---
  clear_scene: { labelKey: 'actions.clearScene', descriptionKey: 'tooltips.clearScene' },
}
