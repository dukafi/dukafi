import React from 'react';
import type { IconProps } from '../types';

export function LayoutSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 20H4v-2H2v-8h6v10Zm14-2h-2v2H10V10h12v8ZM20 6h2v2H2V6h2V4h16v2Z"/>
    </svg>
  );
}
