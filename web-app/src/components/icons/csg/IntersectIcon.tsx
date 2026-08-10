import React from 'react';
import { IconBase } from '../IconBase';

export default function IntersectIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g stroke="currentColor" strokeWidth={1.5} fill="none">
        {/* Квадрат (только контур) */}
        <rect x="4" y="4" width="14" height="14" />
        {/* Круг (только контур) */}
        <circle cx="14" cy="14" r="8" />
        {/* Залита только общая область пересечения (бледнее) */}
        <path d="M14 4v10a6 6 0 0 0 6 6H4V4h10z" fill="currentColor" style={{ fillOpacity: 0.2 }} />
      </g>
    </IconBase>
  );
}
