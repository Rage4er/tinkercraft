import React from 'react';

// Тип для всех иконок
export type IconProps = {
  size?: number;
  className?: string;
};

// Утилита для создания иконки
const createIcon = (pathData: string, viewBox = '0 0 24 24') => {
  return ({ size = 20, className }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={pathData} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
};

// === ПАЛИТРА ФИГУР ===

export const CubeIcon = createIcon(
  'M4 4h16v16H4V4zm2 2v12h12V6H6z'
);

export const SphereIcon = createIcon(
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'
);

export const CylinderIcon = createIcon(
  'M6 6h12v12H6V6zm2 2v8h8V8H8z M4 6c0-1.1 0.9-2 2-2h12c1.1 0 2 0.9 2 2v12c0 1.1-0.9 2-2 2H6c-1.1 0-2-0.9-2-2V6z'
);

export const ConeIcon = createIcon(
  'M12 2L4 22h16L12 2zm0 4l6 14H6L12 6z'
);

export const TorusIcon = createIcon(
  'M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z'
);

export const PrismIcon = createIcon(
  'M12 2L4 8v12l8 2 8-2V8L12 2zm0 4l6 4v8l-6 2-6-2V10l6-4z'
);

export const PyramidIcon = createIcon(
  'M12 2L2 22h20L12 2zm0 4l8 14H4L12 6z'
);

export const TextIcon = createIcon(
  'M5 4v3h5v12h3V7h5V4H5z'
);

// === ИНСТРУМЕНТЫ (GIZMO) ===

export const SelectIcon = createIcon(
  'M3 3h18v18H3V3zm2 2v14h14V5H5z'
);

export const MoveIcon = createIcon(
  'M19 11h-4V7l-2-2-2 2v4H7l-2 2 2 2v4h4v4l2 2 2-2v-4h4l2-2-2-2v-4z'
);

export const RotateIcon = createIcon(
  'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z'
);

export const ScaleIcon = createIcon(
  'M19 19H5V5h14v14zm-2-2V7H7v10h10zM9 9h6v6H9V9z'
);

// === CSG ОПЕРАЦИИ ===

export const UnionIcon = createIcon(
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z'
);

export const SubtractIcon = createIcon(
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z M16 11H8v2h8v-2z'
);

export const IntersectIcon = createIcon(
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z'
);

// === ЗЕРКАЛО ===

export const MirrorYZIcon = createIcon(
  'M4 4h16v16H4V4zm2 2v12h12V6H6z M14 8h4v8h-4V8z'
);

export const MirrorXZIcon = createIcon(
  'M4 4h16v16H4V4zm2 2v12h12V6H6z M8 14h8v4H8v-4z'
);

export const MirrorXYIcon = createIcon(
  'M4 4h16v16H4V4zm2 2v12h12V6H6z M8 8h8v4H8V8z'
);

// === ДЕЙСТВИЯ ===

export const UndoIcon = createIcon(
  'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78c-1.27-3.84-4.74-6.72-8.47-6.72z'
);

export const RedoIcon = createIcon(
  'M18.4 10.6a10.02 10.02 0 0 0-16.4 4.6l2.37.78A8.02 8.02 0 0 1 10.5 12c1.96 0 3.73.72 5.12 1.88L12 17.5l9-9-9 2.1z'
);

export const DeleteIcon = createIcon(
  'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'
);

export const CopyIcon = createIcon(
  'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'
);

export const PasteIcon = createIcon(
  'M19 2h-4.18C14.4 0.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 16H5V4h2v3h10V4h2v14z'
);

// === ФАЙЛ ===

export const OpenIcon = createIcon(
  'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z'
);

export const SaveIcon = createIcon(
  'M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z'
);

export const ImportIcon = createIcon(
  'M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-8-7V2H9v3H6l6 6 6-6h-3z'
);

export const ExportIcon = createIcon(
  'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z'
);

// === НАВИГАЦИЯ ===

export const HomeIcon = createIcon(
  'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'
);

export const FitViewIcon = createIcon(
  'M21 21H3V3h18v18zm-2-2V5H5v14h14z'
);

export const RulerIcon = createIcon(
  'M3 3h2v18H3V3zm4 0h2v18H7V3zm4 0h2v18h-2V3zm4 0h2v18h-2V3z'
);

// === ДОПОЛНИТЕЛЬНО ===

export const FilletIcon = createIcon(
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z'
);

export const FolderIcon = createIcon(
  'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z'
);

export const AlignIcon = createIcon(
  'M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z'
);

export const ColorIcon = createIcon(
  'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z'
);

// === СТАНДАРТНЫЕ ===

export const CloseIcon = createIcon(
  'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
);

export const ChevronUpIcon = createIcon(
  'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z'
);

export const ChevronDownIcon = createIcon(
  'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z'
);

export const InfoIcon = createIcon(
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'
);

export const WarningIcon = createIcon(
  'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'
);

export const EyeIcon = createIcon(
  'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'
);

export const EyeOffIcon = createIcon(
  'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.99 2.44-4.41 2.44-7.08 0-2.76-1.12-5.21-2.92-7.08-1.8-1.87-4.25-2.92-7.08-2.92-2.76 0-5.21 1.12-7.08 2.92-1.87 1.8-2.92 4.25-2.92 7.08 0 2.84.92 5.26 2.44 7.08l2.92-2.92C10.74 12.26 10.87 11.65 11 11c0-2.76 2.24-5 5-5zm-7.08 10.08c1.87 1.8 4.32 2.92 7.08 2.92 2.76 0 5.21-1.12 7.08-2.92 1.8-1.87 2.92-4.32 2.92-7.08 0-2.84-.92-5.26-2.44-7.08l-2.92 2.92C13.26 11.74 13.13 12.35 13 13c0 2.76-2.24 5-5 5-2.76 0-5.21-1.12-7.08-2.92z'
);

export const PlusIcon = createIcon(
  'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'
);

export const MonitorIcon = createIcon(
  'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z'
);
