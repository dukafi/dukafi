import React from 'react';
import type { IconProps } from '../types';

export function ZapSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M14 9h8v4h-2v2h-2v2h-2v2h-2v2h-2v2h-2v-8H2v-4h2V9h2V7h2V5h2V3h2V1h2v8Z"/>
    </svg>
  );
}
