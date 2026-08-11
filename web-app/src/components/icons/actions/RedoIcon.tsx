import React from 'react';
import { IconBase } from '../IconBase';

export default function RedoIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {/* Зеркальное отражение Undo — стрелка вправо, от края до края */}
        <path d="M16 10H6C4 10 2 12 2 14V15" />
        <polyline points="10,6 16,10 10,14" />
      </g>
    </IconBase>
  );
}
