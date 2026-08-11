import React from 'react';
import { IconBase } from '../IconBase';

export default function RulerIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        {/* Горизонтальная линия сверху от края до края */}
        <line x1="2" y1="4" x2="22" y2="4" />
        {/* Шкала: длинная-короткая-длинная-короткая-длинная */}
        <line x1="3" y1="4" x2="3" y2="16" />
        <line x1="7" y1="4" x2="7" y2="10" />
        <line x1="12" y1="4" x2="12" y2="16" />
        <line x1="17" y1="4" x2="17" y2="10" />
        <line x1="21" y1="4" x2="21" y2="16" />
      </g>
    </IconBase>
  );
}
