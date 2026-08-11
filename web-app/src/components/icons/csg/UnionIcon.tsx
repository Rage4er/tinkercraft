import React from 'react'
import { BoolIcon } from './BoolIcon'

export default function UnionIcon({ size, className }: { size?: number; className?: string }) {
  return <BoolIcon kind="union" size={size} className={className} />
}
