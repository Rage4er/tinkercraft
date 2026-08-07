import React from 'react';
import { IconBase } from '../IconBase';

export default function ImportIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-8 -7V2H9v3H6l6 6 6-6h-3z" />
    </IconBase>
  );
}