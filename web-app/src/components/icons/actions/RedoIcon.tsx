import React from 'react';
import { IconBase } from '../IconBase';

export default function RedoIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* Зеркальное отражение Undo — стрелка вправо */}
        <path d="M15.5 8c2.65 0 5.05.99 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78c1.27-3.84 4.74-6.72 8.47-6.72z" />
      </g>
    </IconBase>
  );
}
