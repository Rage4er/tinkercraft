import type { ShapeType } from "./csg/types";

// ---- Shapes ----
export const ALL_SHAPES: {
  type: ShapeType | "text";
  label: string;
  icon: string;
  category: string;
}[] = [
  { type: "cube",     label: "Куб",     icon: "⬛", category: "Основные" },
  { type: "sphere",   label: "Сфера",   icon: "🔵", category: "Основные" },
  { type: "cylinder", label: "Цилиндр", icon: "🥫", category: "Основные" },
  { type: "cone",     label: "Конус",   icon: "🔺", category: "Основные" },
  { type: "torus",    label: "Тор",     icon: "⭕", category: "Основные" },
  { type: "prism",    label: "Призма",  icon: "◬",  category: "Основные" },
  { type: "pyramid",  label: "Пирамида",icon: "▲",  category: "Основные" },
  { type: "text",     label: "Текст",   icon: "T",  category: "Особые"   },
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
  move: "Move",
  resize_dims: "Resize",
  fillet: "Fillet",
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
