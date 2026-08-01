import React from 'react';
import type { IconProps } from '../types';

export function BoxStackSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M6 7h4v2h4V7h4V5h4v14h-4v2h-4v-6h4v-2h2v-2h-2v2h-4v2h-4v-2H6v2h4v2h2v4h2v2h-4v-2H6v-2H2V5h4v2Zm-2 6h2v-2H4v2Zm6-10V1h4v2h4v2h-4v2h-4V5H6V3h4Z"/>
    </svg>
  );
}
