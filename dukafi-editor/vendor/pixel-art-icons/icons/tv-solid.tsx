import React from 'react';
import type { IconProps } from '../types';

export function TvSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 5h2v10h-2v2h-5v2h3v2H6v-2h3v-2H4v-2H2V5h2V3h16v2Z"/>
    </svg>
  );
}
