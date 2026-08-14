import React from 'react';
import type { IconProps } from '../types';

export function EditSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M14 10h2v4h-2v2h-2v2h-2v2H8v2H2v-6h2v-2h2v-2h2v-2h2V8h4v2Zm4-6h2v2h2v2h-2v2h-4V8h-2V4h2V2h2v2Z"/>
    </svg>
  );
}
