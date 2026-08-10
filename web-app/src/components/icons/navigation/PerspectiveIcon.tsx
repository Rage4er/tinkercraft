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
        {/* Трапеция — внешняя рамка: низ уже, верх шире (занимает почти всю кнопку) */}
        <polygon points="6,3 18,3 21,21 3,21" />
        {/* Горизонтальные линии сетки */}
        <line x1="5.5" y1="9" x2="18.5" y2="9" />
        <line x1="4.5" y1="15" x2="19.5" y2="15" />
        {/* Вертикальные линии сетки (сходятся к низу) */}
        <line x1="9" y1="3" x2="6" y2="21" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="15" y1="3" x2="18" y2="21" />
      </g>
    </IconBase>
  );
}
