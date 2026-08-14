import React from 'react';
import type { IconProps } from '../types';

export function ContainerSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M21 19h-2v2h-4v2h-2v-8h2v-2h6v6ZM13 3h2v2h2v2h2v2h2v2h-6v2h-4v-2H9v2h2v8H9v-2H7v-2H5v-2H3V7h2v2h2v2h2V9H7V7H5V3h4V1h4v2Z"/>
    </svg>
  );
}
