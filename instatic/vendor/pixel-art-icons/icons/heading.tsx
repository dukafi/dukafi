import React from 'react';
import type { IconProps } from '../types';

export function HeadingIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M7 11h10V4h2v16h-2v-7H7v7H5V4h2v7Z"/>
    </svg>
  );
}
