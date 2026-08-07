import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  children: React.ReactNode;
}

export const IconBase: React.FC<IconProps> = ({
  size = 20,
  className,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {children}
  </svg>
);