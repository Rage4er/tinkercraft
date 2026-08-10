import React from 'react';
import { IconBase } from '../IconBase';

export default function PerspectiveIcon({ size = 16 }: { size?: number }) {
  const s = size ?? 16;

  return (
    <IconBase size={s}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Трапеция — внешняя рамка: низ уже, верх шире */}
        <polygon points={`${s * 0.3},${s * 0.15} ${s * 0.7},${s * 0.15} ${s * 0.8},${s * 0.85} ${s * 0.2},${s * 0.85}`} />
        {/* Горизонтальные линии сетки */}
        <line x1={s * 0.3} y1={s * 0.35} x2={s * 0.7} y2={s * 0.35} />
        <line x1={s * 0.267} y1={s * 0.6} x2={s * 0.733} y2={s * 0.6} />
        {/* Вертикальные линии сетки */}
        <line x1={s * 0.4} y1={s * 0.15} x2={s * 0.25} y2={s * 0.85} />
        <line x1={s * 0.5} y1={s * 0.15} x2={s * 0.5} y2={s * 0.85} />
        <line x1={s * 0.6} y1={s * 0.15} x2={s * 0.75} y2={s * 0.85} />
      </g>
    </IconBase>
  );
}
