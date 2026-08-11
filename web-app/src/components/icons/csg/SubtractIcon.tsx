import React from 'react'
import { BoolIcon } from './BoolIcon'

export default function SubtractIcon({ size, className }: { size?: number; className?: string }) {
  return <BoolIcon kind="subtract" size={size} className={className} />
}
