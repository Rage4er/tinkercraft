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
  CapsuleIcon,
  TubeIcon,
  SpringIcon,
  TextIcon,
  SvgIcon,
  ThreadIcon,
} from "./components/icons";
import { ALL_SHAPES_DATA } from "./constants";

// ---- Shapes (React components) ----
export const ALL_SHAPES_ICONS: {
  type: ShapeType | "text" | "svg" | "thread";
  labelKey: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  categoryKey: string;
}[] = ALL_SHAPES_DATA.map((s) => {
  const IconMap: Record<string, any> = {
    cube: CubeIcon,
    sphere: SphereIcon,
    cylinder: CylinderIcon,
    cone: ConeIcon,
    torus: TorusIcon,
    prism: PrismIcon,
    pyramid: PyramidIcon,
    capsule: CapsuleIcon,
    tube: TubeIcon,
    spring: SpringIcon,
    text: TextIcon,
    svg: SvgIcon,
    thread: ThreadIcon,
  };

  return {
    ...s,
    icon: (props) => {
      const Icon = IconMap[s.iconKey];
      return Icon ? <Icon {...props} /> : null;
    },
  };
});
