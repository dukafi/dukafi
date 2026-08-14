import React from 'react';
import type { IconProps } from '../types';

export function CursorMinimalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <path d="M10 6h2v2h2v2h2v2h2v4h-6v2h-2v2H6V4h4v2Z"/>
    </svg>
  );
}
