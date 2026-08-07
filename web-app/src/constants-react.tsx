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
} from "./icons";
import { ALL_SHAPES_DATA } from "../constants";

// ---- Shapes (React components) ----
export const ALL_SHAPES_ICONS: {
  type: ShapeType | "text";
  label: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  category: string;
}[] = ALL_SHAPES_DATA.map((s) => {
  const IconMap: Record<string, any> = {
    cube: CubeIcon,
    sphere: SphereIcon,
    cylinder: CylinderIcon,
    cone: ConeIcon,
    torus: TorusIcon,
    prism: PrismIcon,
    pyramid: PyramidIcon,
    text: TextIcon,
  };

  return {
    ...s,
    icon: (props) => {
      const Icon = IconMap[s.iconKey];
      return Icon ? <Icon {...props} /> : null;
    },
  };
});
