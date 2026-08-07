import React from 'react';
import { IconBase } from '../IconBase';

export default function PyramidIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 2L2 22h20L12 2zm0 4l8 14H4L12 6z" />
    </IconBase>
  );
}