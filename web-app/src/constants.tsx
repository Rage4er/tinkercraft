import type { ShapeType } from "./csg/types";
import React from "react";
import {
  CubeIcon,
  SphereIcon,
  CylinderIcon,
  ConeIcon,
  TorusIcon,
  PrismIcon,
  PyramidIcon,
  TextIcon,
} from "./components/icons";
import { ALL_SHAPES_DATA, SNAP_VALUES, OP_FILTER_LABELS, DEFAULT_FILTERS, OBJECT_SPACING, PASTE_OFFSET, AUTOSAVE_DELAY_MS, MOVE_DELTA_EPSILON, FILLET_EPSILON, FILLET_MIN_RADIUS, VERTEX_MERGE_PRECISION, OBJECT_COLORS } from "./constants";

// ---- React icon map ----
const ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  cube: CubeIcon,
  sphere: SphereIcon,
  cylinder: CylinderIcon,
  cone: ConeIcon,
  torus: TorusIcon,
  prism: PrismIcon,
  pyramid: PyramidIcon,
  text: TextIcon,
};

// ---- Shapes (React version with icon components) ----
export const ALL_SHAPES: {
  type: ShapeType | "text";
  labelKey: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  categoryKey: string;
}[] = ALL_SHAPES_DATA.map((s) => ({
  ...s,
  icon: (props) => {
    const Icon = ICON_MAP[s.iconKey];
    return Icon ? <Icon {...props} /> : null;
  },
}));

// ---- Re-export all pure data constants ----
export { SNAP_VALUES, OP_FILTER_LABELS, DEFAULT_FILTERS, OBJECT_SPACING, PASTE_OFFSET, AUTOSAVE_DELAY_MS, MOVE_DELTA_EPSILON, FILLET_EPSILON, FILLET_MIN_RADIUS, VERTEX_MERGE_PRECISION, OBJECT_COLORS };
