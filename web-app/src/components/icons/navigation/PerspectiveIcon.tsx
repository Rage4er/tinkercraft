import React from 'react';
import { IconBase } from '../IconBase';

export default function PerspectiveIcon({ size = 16 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Трапеция — внешняя рамка: от края до края */}
        <polygon points="5,2 19,2 22,22 2,22" />
        {/* Горизонтальные линии сетки */}
        <line x1="4" y1="8" x2="20" y2="8" />
        <line x1="3" y1="15" x2="21" y2="15" />
        {/* Вертикальные линии сетки (сходятся к низу) */}
        <line x1="8" y1="2" x2="5" y2="22" />
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="16" y1="2" x2="19" y2="22" />
      </g>
    </IconBase>
  );
}
