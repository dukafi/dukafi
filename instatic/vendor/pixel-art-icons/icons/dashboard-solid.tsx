import React from 'react';
import type { IconProps } from '../types';

export function DashboardSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 19H9v2H5v-2H3v-2h2v-2h6v4Zm8-6h2v6h-2v2h-4v-2h-2v-8h6v2ZM9 5h2v8H5v-2H3V5h2V3h4v2Zm10 0h2v2h-2v2h-6V5h2V3h4v2Z"/>
    </svg>
  );
}
