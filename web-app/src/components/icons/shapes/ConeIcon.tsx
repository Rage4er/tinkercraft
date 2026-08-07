import React from 'react';
import { IconBase } from '../IconBase';

export default function ConeIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 2L4 22h16L12 2zm0 4l6 14H6L12 6z" />
    </IconBase>
  );
}