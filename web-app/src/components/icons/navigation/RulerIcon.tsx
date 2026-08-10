import React from 'react';
import { IconBase } from '../IconBase';

export default function RulerIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        {/* Горизонтальная линия сверху */}
        <line x1="3" y1="4" x2="21" y2="4" />
        {/* Шкала: длинная-короткая-длинная-короткая-длинная */}
        <line x1="4" y1="4" x2="4" y2="14" />
        <line x1="8" y1="4" x2="8" y2="10" />
        <line x1="12" y1="4" x2="12" y2="14" />
        <line x1="16" y1="4" x2="16" y2="10" />
        <line x1="20" y1="4" x2="20" y2="14" />
      </g>
    </IconBase>
  );
}
