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
  label: string;
  iconKey: string;
  category: string;
}[] = [
    { type: "cube", label: "Куб", iconKey: "cube", category: "Основные" },
    { type: "sphere", label: "Сфера", iconKey: "sphere", category: "Основные" },
    { type: "cylinder", label: "Цилиндр", iconKey: "cylinder", category: "Основные" },
    { type: "cone", label: "Конус", iconKey: "cone", category: "Основные" },
    { type: "torus", label: "Тор", iconKey: "torus", category: "Основные" },
    { type: "prism", label: "Призма", iconKey: "prism", category: "Основные" },
    { type: "pyramid", label: "Пирамида", iconKey: "pyramid", category: "Основные" },
    { type: "text", label: "Текст", iconKey: "text", category: "Особые" },
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

// ============================================================
// Tooltip data — two-level tooltips for all toolbar buttons
// Level 1 (instant): label + shortcut
// Level 2 (after 1.5s): description
// ============================================================

export interface TooltipData {
  label: string
  shortcut?: string
  description?: string
}

export const TOOLTIP_DATA: Record<string, TooltipData> = {
  // --- File operations ---
  open: { label: 'Открыть', shortcut: 'Ctrl+O', description: 'Открывает проект из файла .doodle' },
  save: { label: 'Сохранить', shortcut: 'Ctrl+S', description: 'Сохраняет проект в файл .doodle' },
  export_stl: { label: 'Экспорт STL', description: 'Экспортирует сцену в бинарный STL-файл' },
  import_stl: { label: 'Импорт STL', description: 'Импортирует 3D-модель из STL-файла' },
  projects: { label: 'Проекты', description: 'Открывает менеджер проектов' },

  // --- Edit operations ---
  undo: { label: 'Отменить', shortcut: 'Ctrl+Z', description: 'Отменяет последнее действие' },
  redo: { label: 'Повторить', shortcut: 'Ctrl+Y', description: 'Повторяет отменённое действие' },
  copy: { label: 'Копировать', shortcut: 'Ctrl+C', description: 'Копирует выделенные объекты в буфер обмена' },
  paste: { label: 'Вставить', shortcut: 'Ctrl+V', description: 'Вставляет объекты из буфера обмена' },
  delete: { label: 'Удалить', shortcut: 'Del', description: 'Удаляет выделенные объекты' },

  // --- View operations ---
  fit_view: { label: 'Fit View', shortcut: 'F', description: 'Устанавливает вид на всю сцену' },
  home_view: { label: 'Home View', shortcut: 'H', description: 'Сбрасывает камеру в исходную позицию' },
  toggle_camera: { label: 'Перспектива ↔ Ортография', shortcut: 'Tab', description: 'Переключает тип камеры' },

  // --- Gizmo operations ---
  gizmo_translate: { label: 'Переместить', shortcut: 'G', description: 'Режим перемещения объектов' },
  gizmo_rotate: { label: 'Повернуть', shortcut: 'R', description: 'Режим вращения объектов' },
  gizmo_scale: { label: 'Масштаб', shortcut: 'S', description: 'Режим масштабирования объектов' },
  gizmo_exit: { label: 'Выйти', shortcut: 'Esc', description: 'Выход из режима gizmo' },

  // --- Ruler ---
  ruler: { label: 'Линейка', shortcut: 'L', description: 'Инструмент измерения расстояний — 2 клика для измерения' },

  // --- Mirror ---
  mirror_yz: { label: 'Зеркало YZ', shortcut: 'M', description: 'Отражает объект относительно плоскости YZ' },
  mirror_xz: { label: 'Зеркало XZ', shortcut: 'N', description: 'Отражает объект относительно плоскости XZ' },
  mirror_xy: { label: 'Зеркало XY', shortcut: 'B', description: 'Отражает объект относительно плоскости XY' },

  // --- Align (5 кнопок: X min/center/max, Y center, Z center) ---
  align_x_min: { label: 'X min', description: 'Выравнивание по минимальной координате X' },
  align_x_center: { label: 'X center', description: 'Выравнивание по центру по оси X' },
  align_x_max: { label: 'X max', description: 'Выравнивание по максимальной координате X' },
  align_y_center: { label: 'Y center', description: 'Выравнивание по центру по оси Y' },
  align_z_center: { label: 'Z center', description: 'Выравнивание по центру по оси Z' },

  // --- CSG operations ---
  csg_union: { label: 'Объединение', shortcut: 'U', description: 'Объединяет два объекта в один (union)' },
  csg_subtract: { label: 'Вычитание', shortcut: 'X', description: 'Вычитает один объект из другого (subtract)' },
  csg_intersect: { label: 'Пересечение', shortcut: 'I', description: 'Оставляет общую часть двух объектов (intersect)' },

  // --- Theme ---
  theme_toggle: { label: 'Сменить тему', description: 'Переключает между тёмной и светлой темой' },

  // --- Clear ---
  clear_scene: { label: 'Очистить сцену', description: 'Удаляет все объекты из сцены' },
}
