import React from 'react';
import { IconBase } from '../IconBase';

export default function MoveIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {/* Крест от края до края */}
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        {/* Стрелки */}
        <polyline points="5,7 12,2 19,7" />
        <polyline points="5,17 12,22 19,17" />
        <polyline points="5,7 2,12 5,17" />
        <polyline points="19,7 22,12 19,17" />
      </g>
    </IconBase>
  );
}
