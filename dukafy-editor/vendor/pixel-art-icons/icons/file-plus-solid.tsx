import React from 'react';
import type { IconProps } from '../types';

export function FilePlusSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 18h2v2H8v2H6v-2H4v-2h2v-2h2v2Zm8-14h-2v4h4V6h2v14h-2v2h-6v-6h-2v-2H4V4h2V2h10v2Zm2 2h-2V4h2v2Z"/>
    </svg>
  );
}
