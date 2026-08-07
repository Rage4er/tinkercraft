import React from 'react';
import { IconBase } from '../IconBase';

export default function PrismIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 2L4 8v12l8 2 8-2V8L12 2zm0 4l6 4v8l-6 2-6-2V10l6-4z" />
    </IconBase>
  );
}