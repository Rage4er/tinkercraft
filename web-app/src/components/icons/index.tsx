// ============================================================
// Tinkercraft Web — SVG-иконки. Единый стиль:
// viewBox 0 0 64 64, контур currentColor (3px, round),
// заливка currentColor + fillOpacity. Цвет задаётся CSS `color`.
// Псевдо-3D: тона .4 / .25 / .12
// ============================================================

import React from 'react'

const SW = 3
const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: SW,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}
const face = (o: number) => ({
  ...line,
  fill: 'currentColor',
  fillOpacity: o,
})
function Icon({
  size = 24,
  children,
  ...rest
}: {
  size?: number
  children: React.ReactNode
  [key: string]: any
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

// Залитая + обведённая фигура
const Shape = ({ d, o = 0.22 }: { d: string; o?: number }) => (
  <path d={d} {...face(o)} />
)

/* ===== Группа 1 · Файл ===== */
export const OpenIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M10 24V14h14l5 5h21v5" />
    <Shape d="M8 27h48l-6 23H14Z" />
  </Icon>
)

export const SaveIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M12 12h32l8 8v32H12Z" />
    <g {...line}>
      <path d="M24 12v12h14V12" />
      <rect x="20" y="34" width="24" height="18" />
    </g>
  </Icon>
)

export const ExportIcon = (p: any) => (
  <Icon {...p}>
    <path fill="currentColor" fillOpacity={0.22} d="M12 38v14h40V38Z" />
    <g {...line}>
      <path d="M12 38v14h40V38" />
      <path d="M32 40V14M22 24l10-10 10 10" />
    </g>
  </Icon>
)

export const ImportIcon = (p: any) => (
  <Icon {...p}>
    <path fill="currentColor" fillOpacity={0.22} d="M12 38v14h40V38Z" />
    <g {...line}>
      <path d="M12 38v14h40V38" />
      <path d="M32 14v26M22 30l10 10 10-10" />
    </g>
  </Icon>
)

export const FolderIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M8 16h16l5 6h27v28H8Z" />
  </Icon>
)

/* ===== Группа 2 · Отмена/Повтор ===== */
export const UndoIcon = (p: any) => (
  <Icon {...p}>
    <g {...line}>
      <path d="M26 14 14 24l12 10" />
      <path d="M14 24h22a14 14 0 0 1 0 28H22" />
    </g>
  </Icon>
)

export const RedoIcon = (p: any) => (
  <Icon {...p}>
    <g {...line}>
      <path d="M38 14l12 10-12 10" />
      <path d="M50 24H28a14 14 0 0 0 0 28h14" />
    </g>
  </Icon>
)

/* ===== Группа 3 · Редактирование ===== */
export const CopyIcon = (p: any) => (
  <Icon {...p}>
    <rect {...line} x="16" y="10" width="26" height="32" />
    <Shape d="M22 22h26v32H22Z" />
  </Icon>
)

export const PasteIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M14 12h36v42H14Z" />
    <Shape d="M24 8h16v9H24Z" />
    <path {...line} d="M22 32h20M22 40h20" />
  </Icon>
)

export const DeleteIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M18 24h28l-3 28H21Z" />
    <g {...line}>
      <path d="M12 18h40M26 18v-6h12v6" />
      <path d="M27 30v14M37 30v14" />
    </g>
  </Icon>
)

/* ===== Группа 4 · Вид ===== */
export const FitViewIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M10 20V10h10M44 10h10v10M54 44v10H44M20 54H10V44" />
    <Shape d="M26 26h12v12H26Z" />
  </Icon>
)

export const HomeIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M12 30 32 12l20 18v22H12Z" />
    <path {...line} d="M27 52V40h10v12" />
  </Icon>
)

export const PerspectiveIcon = (p: any) => (
  <Icon {...p}>
    <rect {...line} x="12" y="12" width="18" height="18" />
    <path {...line} d="M12 12 26 26M30 12l22 14M12 30l14 22" />
    <Shape d="M26 26h26v26H26Z" />
  </Icon>
)

/* ===== Группа 5 · Гизмо ===== */
export const MoveIcon = (p: any) => (
  <Icon {...p}>
    <g {...line}>
      <path d="M32 13v38M13 32h38" />
      <path d="M24 21l8-8 8 8M24 43l8 8 8-8M21 24l-8 8 8 8M43 24l8 8-8 8" />
    </g>
    <Shape d="M28 28h8v8h-8Z" />
  </Icon>
)

export const RotateIcon = (p: any) => (
  <Icon {...p}>
    <g {...line}>
      <path d="M43.3 22.7A16 16 0 1 0 48 34" />
      <path d="M41 41l7-7 7 7" />
    </g>
  </Icon>
)

export const ScaleIcon = (p: any) => (
  <Icon {...p}>
    <rect {...line} strokeDasharray="5 6" x="10" y="10" width="44" height="44" />
    <Shape d="M40 40h14v14H40Z" />
    <path {...line} d="M24 24l16 16M24 32v-8h8" />
  </Icon>
)

export const CloseIcon = (p: any) => (
  <Icon {...p}>
    <circle cx="32" cy="32" r="20" {...face(0.22)} />
    <path {...line} d="M25 25l14 14M39 25 25 39" />
  </Icon>
)

/* ===== Группа 6 · Линейка ===== */
export const RulerIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M8 24h48v16H8Z" />
    <path {...line} d="M16 24v8M24 24v5M32 24v8M40 24v5M48 24v8" />
  </Icon>
)

/* ===== Группа 7 · Зеркало ===== */
export const MirrorYZIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} strokeDasharray="5 6" d="M32 10v44" />
    <Shape d="M14 22l12 10-12 10Z" />
    <Shape d="M50 22l-12 10 12 10Z" />
  </Icon>
)

export const MirrorXZIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} strokeDasharray="5 6" d="M10 32h44" />
    <Shape d="M22 14l10 12 10-12Z" />
    <Shape d="M22 50l10-12 10 12Z" />
  </Icon>
)

export const MirrorXYIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} strokeDasharray="5 6" d="M14 50 50 14" />
    <Shape d="M16 16h14L16 30Z" />
    <Shape d="M48 48V34L34 48Z" />
  </Icon>
)

/* ===== Группа 8 · Выравнивание ===== */
/* ===== Группа 8 · Выравнивание (Z-up: X/Y горизонтальные, Z вертикальная) ===== */
// X — горизонтальная ось экрана: вертикальная планка
export const AlignXMinIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M14 10v44" />
    <Shape d="M14 16h30v10H14Z" />
    <Shape d="M14 36h20v10H14Z" />
  </Icon>
)

export const AlignXCenterIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} strokeDasharray="5 6" d="M32 10v44" />
    <Shape d="M17 16h30v10H17Z" />
    <Shape d="M22 36h20v10H22Z" />
  </Icon>
)

export const AlignXMaxIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M50 10v44" />
    <Shape d="M20 16h30v10H20Z" />
    <Shape d="M30 36h20v10H30Z" />
  </Icon>
)

// Y — горизонтальная ось глубины: диагональная планка, объекты касаются углом
export const AlignYMinIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M17 23 43 49" />
    <Shape d="M26 18h14v14H26Z" />
    <Shape d="M36 33h9v9h-9Z" />
  </Icon>
)

export const AlignYCenterIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} strokeDasharray="5 6" d="M14 14 50 50" />
    <Shape d="M19 19h14v14H19Z" />
    <Shape d="M35.5 35.5h9v9h-9Z" />
  </Icon>
)

export const AlignYMaxIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M21 15 47 41" />
    <Shape d="M24 32h14v14H24Z" />
    <Shape d="M19 22h9v9h-9Z" />
  </Icon>
)

// Z — вертикальная ось: горизонтальная планка
export const AlignZMinIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M10 50h44" />
    <Shape d="M16 20h10v30H16Z" />
    <Shape d="M36 30h10v20H36Z" />
  </Icon>
)

export const AlignZCenterIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} strokeDasharray="5 6" d="M10 32h44" />
    <Shape d="M16 17h10v30H16Z" />
    <Shape d="M36 22h10v20H36Z" />
  </Icon>
)

export const AlignZMaxIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M10 14h44" />
    <Shape d="M16 14h10v30H16Z" />
    <Shape d="M36 14h10v20H36Z" />
  </Icon>
)

/* ===== Группа 9 · CSG (булевы операции) ===== */
const CSGOutline = () => (
  <g {...line}>
    <rect x="8" y="24" width="32" height="32" />
    <circle cx="40" cy="24" r="16" />
  </g>
)

export const UnionIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M8 24H24A16 16 0 1 1 40 40V56H8Z" />
    <CSGOutline />
  </Icon>
)

export const SubtractIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M8 24H24A16 16 0 0 0 40 40V56H8Z" />
    <CSGOutline />
  </Icon>
)

export const IntersectIcon = (p: any) => (
  <Icon {...p}>
    <Shape d="M24 24H40V40A16 16 0 0 1 24 24Z" />
    <CSGOutline />
  </Icon>
)

/* ===== Группа 10 · Тема ===== */
export const ThemeIcon = (p: any) => (
  <Icon {...p}>
    <circle cx="32" cy="32" r="10" {...face(0.22)} />
    <path
      {...line}
      d="M32 10v7M32 47v7M10 32h7M47 32h7M17.1 17.1l4.3 4.3M42.6 42.6l4.3 4.3M46.9 17.1l-4.3 4.3M17.1 46.9l4.3-4.3"
    />
  </Icon>
)

/* ===== UI · информационные иконки ===== */
export const WarningIcon = (p: any) => (
  <Icon {...p}>
    <path d="M32 14 54 54H10Z" {...face(0.22)} />
    <path {...line} d="M32 14 54 54H10Z" />
    <path {...line} d="M32 26v12M32 44v2" />
  </Icon>
)

export const InfoIcon = (p: any) => (
  <Icon {...p}>
    <circle cx="32" cy="32" r="20" {...face(0.22)} />
    <path {...line} d="M32 22v18M32 46v2" />
  </Icon>
)

export const EyeIcon = (p: any) => (
  <Icon {...p}>
    <path d="M6 32s10-14 26-14 26 14 26 14-10 14-26 14S6 32 6 32Z" {...face(0.22)} />
    <circle cx="32" cy="32" r="8" {...face(0.4)} />
  </Icon>
)

export const EyeOffIcon = (p: any) => (
  <Icon {...p}>
    <path d="M6 32s10-14 26-14 26 14 26 14-10 14-26 14S6 32 6 32Z" {...face(0.22)} />
    <circle cx="32" cy="32" r="8" {...face(0.4)} />
    <path {...line} d="M10 10l44 44" />
  </Icon>
)

export const FilletIcon = (p: any) => (
  <Icon {...p}>
    <rect {...line} x="10" y="10" width="44" height="44" rx="6" />
    <path d="M10 26a16 16 0 0 1 16-16v16Z" {...face(0.22)} />
  </Icon>
)

export const ColorIcon = (p: any) => (
  <Icon {...p}>
    <circle cx="32" cy="32" r="20" {...face(0.22)} />
    <path {...line} d="M32 12v40M12 32h40" />
  </Icon>
)

export const MonitorIcon = (p: any) => (
  <Icon {...p}>
    <rect {...line} x="8" y="10" width="48" height="34" rx="3" />
    <path {...line} d="M24 44h16M32 44v6" />
    <rect x="14" y="16" width="36" height="22" {...face(0.12)} />
  </Icon>
)

export const ChevronUpIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M12 36l20-20 20 20" />
  </Icon>
)

export const ChevronDownIcon = (p: any) => (
  <Icon {...p}>
    <path {...line} d="M12 28l20 20 20-20" />
  </Icon>
)

export const PlusIcon = (p: any) => (
  <Icon {...p}>
    <circle cx="32" cy="32" r="20" {...face(0.22)} />
    <path {...line} d="M32 20v24M20 32h24" />
  </Icon>
)

/* ===== Группа 11 · Очистка (та же иконка, что Close) ===== */
export const ClearIcon = CloseIcon

/* ===== ЛЕВАЯ ПАНЕЛЬ · фигуры, псевдо-3D изометрия ===== */
export const CubeIcon = (p: any) => (
  <Icon {...p}>
    <path d="M32 12 50 21l-18 9-18-9Z" {...face(0.4)} />
    <path d="M14 21l18 9v22l-18-9Z" {...face(0.25)} />
    <path d="M50 21l-18 9v22l18-9Z" {...face(0.12)} />
  </Icon>
)

/* ===== Логотип: куб с T (левая грань) и C (правая грань) ===== */
export const TCLogoIcon = (p: any) => (
  <Icon {...p}>
    <path d="M32 12 50 21l-18 9-18-9Z" {...face(0.4)} />
    <path d="M14 21l18 9v22l-18-9Z" {...face(0.25)} />
    <path d="M50 21l-18 9v22l18-9Z" {...face(0.12)} />
    <g fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 27.5 29 33.5" />        {/* T: перекладина */}
      <path d="M23 30.5v13" />             {/* T: стойка */}
      <path d="M44.7 38.9C42.4 42.4 38.6 44.3 36.3 43.1 33.9 41.9 33.9 38.1 36.3 34.6 38.6 31.1 42.4 29.2 44.7 30.4" /> {/* C */}
    </g>
  </Icon>
)

export const SphereIcon = (p: any) => (
  <Icon {...p}>
    <circle cx="32" cy="32" r="20" {...face(0.22)} />
    <ellipse {...line} cx="32" cy="40" rx="17" ry="5" />
  </Icon>
)

export const CylinderIcon = (p: any) => (
  <Icon {...p}>
    <path
      d="M16 18v26a16 6 0 0 0 32 0V18a16 6 0 0 0-32 0Z"
      {...face(0.22)}
    />
    <ellipse cx="32" cy="18" rx="16" ry="6" {...face(0.4)} />
  </Icon>
)

export const ConeIcon = (p: any) => (
  <Icon {...p}>
    <path d="M32 12 14 44a18 7 0 0 0 36 0Z" {...face(0.12)} />
    <path d="M32 12 14 44a18 7 0 0 0 18 7Z" fill="currentColor" fillOpacity={0.25} />
  </Icon>
)

export const TorusIcon = (p: any) => (
  <Icon {...p}>
    <path
      fillRule="evenodd"
      {...face(0.22)}
      d="M10 34a22 13 0 1 0 44 0 22 13 0 1 0-44 0ZM22 30a10 5 0 1 0 20 0 10 5 0 1 0-20 0Z"
    />
  </Icon>
)

export const PrismIcon = (p: any) => (
  <Icon {...p}>
    <path d="M14 46l12-24 12 24Z" {...face(0.25)} />
    <path d="M26 22l18-9 12 24-18 9Z" {...face(0.12)} />
  </Icon>
)

export const PyramidIcon = (p: any) => (
  <Icon {...p}>
    <path d="M12 38 32 48V10Z" {...face(0.25)} />
    <path d="M52 38 32 48V10Z" {...face(0.12)} />
  </Icon>
)

export const TextIcon = (p: any) => (
  <Icon {...p}>
    <path d="M12 22h32l10-6H22Z" {...face(0.4)} />
    <path d="M44 22l10-6v10l-10 6Z" {...face(0.12)} />
    <path d="M33 32l10-6v20l-10 6Z" {...face(0.12)} />
    <path d="M12 22h32v10H33v20H23V32H12Z" {...face(0.25)} />
  </Icon>
)
