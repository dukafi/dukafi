import React from 'react';
import type { IconProps } from '../types';

export function SendSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 5h4v2h4v2h4v2h2v2h-2v2h-4v2h-4v2H8v2H2v-8h4v-2H2V3h6v2Z"/>
    </svg>
  );
}
