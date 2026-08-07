import React from 'react';
import { IconBase } from '../IconBase';

export default function MoveIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M19 11h-4V7l-2-2-2 2v4H7l-2 2 2 2v4h4v4l2 2 2-2v-4h4l2-2-2-2v-4z" />
    </IconBase>
  );
}