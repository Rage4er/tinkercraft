import React from 'react';
import { IconBase } from '../IconBase';

export default function MoveIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* Вертикальная линия */}
        <line x1="12" y1="4" x2="12" y2="20" />
        {/* Горизонтальная линия */}
        <line x1="4" y1="12" x2="20" y2="12" />
        {/* Стрелки */}
        <polyline points="8,8 12,4 16,8" />
        <polyline points="8,16 12,20 16,16" />
        <polyline points="8,8 4,12 8,16" />
        <polyline points="16,8 20,12 16,16" />
      </g>
    </IconBase>
  );
}
