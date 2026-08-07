import React from 'react';
import { IconBase } from '../IconBase';

export default function MirrorXYIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z M8 8h8v4H8V8z" />
    </IconBase>
  );
}