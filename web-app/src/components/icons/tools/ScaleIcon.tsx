import React from 'react';
import { IconBase } from '../IconBase';

export default function ScaleIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M19 19H5V5h14v14zm-2-2V7H7v10h10zM9 9h6v6H9V9z" />
    </IconBase>
  );
}