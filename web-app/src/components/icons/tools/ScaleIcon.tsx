import React from 'react';
import { IconBase } from '../IconBase';

export default function ScaleIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={1.5}>
        {/* Внешний квадрат — пунктир от края до края */}
        <rect x="2" y="2" width="20" height="20" strokeDasharray="3,3" />
        {/* Внутренний квадрат — сплошной (в 2 раза меньше) */}
        <rect x="7" y="7" width="10" height="10" />
        {/* Стрелки по углам */}
        <polyline points="2,12 7,12 7,7 12,7" />
        <polyline points="12,7 17,7 17,12" />
        <polyline points="17,12 17,17 12,17" />
        <polyline points="12,17 7,17 7,12" />
      </g>
    </IconBase>
  );
}
