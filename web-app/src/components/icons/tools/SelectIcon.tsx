import React from 'react';
import { IconBase } from '../IconBase';

export default function SelectIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M3 3h18v18H3V3zm2 2v14h14V5H5z" />
    </IconBase>
  );
}