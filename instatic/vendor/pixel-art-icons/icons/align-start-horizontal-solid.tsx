import React from 'react';
import type { IconProps } from '../types';

export function AlignStartHorizontalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M9 8h2v12H9v2H5v-2H3V8h2V6h4v2Zm10 0h2v5h-2v2h-4v-2h-2V8h2V6h4v2Zm3-6v2H2V2h20Z"/>
    </svg>
  );
}
