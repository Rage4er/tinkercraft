import React from 'react';
import { IconBase } from '../IconBase';

export default function HomeIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </IconBase>
  );
}