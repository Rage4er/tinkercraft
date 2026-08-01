import type { ShapeType } from "./csg/types";

// ---- Shapes ----
export const ALL_SHAPES: {
  type: ShapeType | "text";
  label: string;
  icon: string;
  category: string;
}[] = [
    { type: "cube", label: "Куб", icon: "⬛", category: "Основные" },
    { type: "sphere", label: "Сфера", icon: "🔵", category: "Основные" },
    { type: "cylinder", label: "Цилиндр", icon: "🥫", category: "Основные" },
    { type: "cone", label: "Конус", icon: "🔺", category: "Основные" },
    { type: "torus", label: "Тор", icon: "⭕", category: "Основные" },
    { type: "prism", label: "Призма", icon: "◬", category: "Основные" },
    { type: "pyramid", label: "Пирамида", icon: "▲", category: "Основные" },
    { type: "text", label: "Текст", icon: "T", category: "Особые" },
  ];

// ---- Snap values ----
export const SNAP_VALUES: { label: string; value: number }[] = [
  { label: "Откл", value: 0 },
  { label: "0.1", value: 0.1 },
  { label: "0.5", value: 0.5 },
  { label: "1", value: 1 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
];

// ---- Timeline filter labels ----
export const OP_FILTER_LABELS: Record<string, string> = {
  add_shape: "Добавить",
  import_mesh: "Импорт",
  move: "Переместить",
  resize_dims: "Размер",
  fillet: "Скругление",
  mirror: "Зеркало",
  align: "Выровнять",
  group: "CSG",
  delete: "Удалить",
  visibility: "Видимость",
  color: "Цвет",
  rename: "Имя",
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
