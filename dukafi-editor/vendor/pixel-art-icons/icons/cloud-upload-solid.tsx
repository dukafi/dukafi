import React from 'react';
import type { IconProps } from '../types';

export function CloudUploadSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 16h2v2h-4v4h-2v-4H8v-2h2v-2h2v-2h2v2h2v2Zm0-10h2v2h2v2h2v2h2v6h-2v2h-2v-6h-2v-2h-2v-2h-6v2H8v2H6v6H2v-2H0v-6h2v-2h2V8h4V6h2V4h6v2Z"/>
    </svg>
  );
}
