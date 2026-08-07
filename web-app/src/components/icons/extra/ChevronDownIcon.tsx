import React from 'react';
import { IconBase } from '../IconBase';

export default function ChevronDownIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </IconBase>
  );
}