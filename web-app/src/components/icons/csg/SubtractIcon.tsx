import React from 'react';
import { IconBase } from '../IconBase';

export default function SubtractIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g stroke="currentColor" strokeWidth={1.5} fill="none">
        {/* Квадрат (залит, без угла) */}
        <path d="M4 4h14v14H4V4z" fill="currentColor" fillOpacity={0.15} />
        {/* Круг (только контур) */}
        <circle cx="14" cy="14" r="8" />
        {/* Отсекаемый угол (белый) */}
        <path d="M14 4a8 8 0 0 0 6 14H4V4h10z" fill="white" fillOpacity={0.8} />
      </g>
    </IconBase>
  );
}
