import React from 'react';
import { IconBase } from '../IconBase';

export default function UnionIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      {/* Залиты все три области: квадрат без круга, круг без квадрата, пересечение */}
      <path
        fill="currentColor"
        style={{ fillOpacity: 0.22 }}
        d="M8 24H24A16 16 0 1 1 40 40V56H8Z"
      />
      {/* Контуры квадрата и круга */}
      <g fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="24" width="32" height="32" />
        <circle cx="40" cy="24" r="16" />
      </g>
    </IconBase>
  );
}
