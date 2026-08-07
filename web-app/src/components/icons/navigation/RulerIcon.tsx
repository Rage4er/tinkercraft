import React from 'react';
import { IconBase } from '../IconBase';

export default function RulerIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M3 3h2v18H3V3zm4 0h2v18H7V3zm4 0h2v18h-2V3zm4 0h2v18h-2V3z" />
    </IconBase>
  );
}