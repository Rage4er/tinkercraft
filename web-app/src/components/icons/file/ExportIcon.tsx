import React from 'react';
import { IconBase } from '../IconBase';

export default function ExportIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
    </IconBase>
  );
}