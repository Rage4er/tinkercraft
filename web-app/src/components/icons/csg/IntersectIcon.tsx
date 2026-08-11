import React from 'react'
import { BoolIcon } from './BoolIcon'

export default function IntersectIcon({ size, className }: { size?: number; className?: string }) {
  return <BoolIcon kind="intersect" size={size} className={className} />
}
