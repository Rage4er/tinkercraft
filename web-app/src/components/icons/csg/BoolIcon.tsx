import React from 'react'

// Координаты пересчитаны для viewBox 0 0 24 24 (масштаб 0.375 от 64x64)
const SHAPES = {
  union: 'M3 9H9A6 6 0 1 1 15 15V21H3Z',
  subtract: 'M3 9H9A6 6 0 0 0 15 15V21H3Z',
  intersect: 'M9 9H15V15A6 6 0 0 1 9 9Z',
}

export type BoolKind = keyof typeof SHAPES

interface BoolIconProps {
  kind: BoolKind
  size?: number
  strokeWidth?: number
  fillOpacity?: number
  color?: string
  className?: string
  onClick?: () => void
}

export const BoolIcon: React.FC<BoolIconProps> = ({
  kind,
  size = 24,
  strokeWidth = 1.5,
  fillOpacity = 0.22,
  color = 'currentColor',
  className = '',
  onClick,
  ...rest
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    color={color}
    className={className}
    aria-hidden="true"
    onClick={onClick}
    {...rest}
  >
    <path fill="currentColor" fillOpacity={fillOpacity} d={SHAPES[kind]} />
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={3} y={9} width={12} height={12} />
      <circle cx={15} cy={9} r={6} />
    </g>
  </svg>
)
