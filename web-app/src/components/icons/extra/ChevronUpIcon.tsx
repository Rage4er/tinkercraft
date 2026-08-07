import React from 'react';
import { IconBase } from '../IconBase';

export default function ChevronUpIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
    </IconBase>
  );
}