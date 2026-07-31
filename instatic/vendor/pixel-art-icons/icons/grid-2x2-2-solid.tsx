import React from 'react';
import type { IconProps } from '../types';

export function Grid2x22SolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 22H4v-2H2v-7h9v9Zm11-2h-2v2h-7v-9h9v7Zm-11-9H2V4h2V2h7v9Zm9-7h2v7h-9V2h7v2Z"/>
    </svg>
  );
}
