import React from 'react';
import { IconBase } from '../IconBase';

export default function TextIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M5 4v3h5v12h3V7h5V4H5z" />
    </IconBase>
  );
}