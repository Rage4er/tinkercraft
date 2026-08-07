import React from 'react';
import { IconBase } from '../IconBase';

export default function RedoIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M18.4 10.6a10.02 10.02 0 0 0-16.4 4.6l2.37.78A8.02 8.02 0 0 1 10.5 12c1.96 0 3.73.72 5.12 1.88L12 17.5l9-9-9 2.1z" />
    </IconBase>
  );
}