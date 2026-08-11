import React from 'react';
import { IconBase } from '../IconBase';

export default function IntersectIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      {/* Залито только пересечение */}
      <path
        fill="currentColor"
        style={{ fillOpacity: 0.22 }}
        d="M24 24H40V40A16 16 0 0 1 24 24Z"
      />
      {/* Контуры квадрата и круга */}
      <g fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="24" width="32" height="32" />
        <circle cx="40" cy="24" r="16" />
      </g>
    </IconBase>
  );
}
