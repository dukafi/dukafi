import React from 'react';
import type { IconProps } from '../types';

export function CheckboxSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 4h2v16h-2v2H4v-2H2V4h2V2h16v2Z"/>
    </svg>
  );
}
