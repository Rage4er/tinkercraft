import React from 'react';
import { IconBase } from '../IconBase';

export default function ScaleIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={1.5}>
        {/* Внешний квадрат — пунктир */}
        <rect x="3" y="3" width="18" height="18" strokeDasharray="3,3" />
        {/* Внутренний квадрат — сплошной (в 2 раза меньше) */}
        <rect x="7" y="7" width="10" height="10" />
        {/* Стрелки по углам */}
        <polyline points="3,12 7,12 7,8 12,8" />
        <polyline points="12,8 17,8 17,13" />
        <polyline points="17,12 17,17 12,17" />
        <polyline points="12,17 8,17 8,12" />
      </g>
    </IconBase>
  );
}
