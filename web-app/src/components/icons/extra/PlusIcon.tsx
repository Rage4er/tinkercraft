import React from 'react';
import { IconBase } from '../IconBase';

export default function PlusIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </IconBase>
  );
}