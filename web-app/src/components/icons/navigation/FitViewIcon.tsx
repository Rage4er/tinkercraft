import React from 'react';
import { IconBase } from '../IconBase';

export default function FitViewIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M21 21H3V3h18v18zm-2-2V5H5v14h14z" />
    </IconBase>
  );
}