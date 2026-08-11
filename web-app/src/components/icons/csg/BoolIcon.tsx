import React from 'react'

const SHAPES = {
  union: 'M8 24H24A16 16 0 1 1 40 40V56H8Z',
  subtract: 'M8 24H24A16 16 0 0 0 40 40V56H8Z',
  intersect: 'M24 24H40V40A16 16 0 0 1 24 24Z',
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
  strokeWidth = 3,
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
    viewBox="0 0 64 64"
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
      <rect x={8} y={24} width={32} height={32} />
      <circle cx={40} cy={24} r={16} />
    </g>
  </svg>
)
