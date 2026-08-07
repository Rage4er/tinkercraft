import React from 'react';
import { IconBase } from '../IconBase';

export default function CylinderIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M6 6h12v12H6V6zm2 2v8h8V8H8z M4 6c0-1.1 0.9-2 2-2h12c1.1 0 2 0.9 2 2v12c0 1.1-0.9 2-2 2H6c-1.1 0-2-0.9-2-2V6z" />
    </IconBase>
  );
}