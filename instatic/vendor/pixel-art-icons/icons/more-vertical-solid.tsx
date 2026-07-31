import React from 'react';
import type { IconProps } from '../types';

export function MoreVerticalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M13 23h-2v-2H9v-2h2v-2h2v2h2v2h-2v2Zm0-12h2v2h-2v2h-2v-2H9v-2h2V9h2v2Zm0-8h2v2h-2v2h-2V5H9V3h2V1h2v2Z"/>
    </svg>
  );
}
