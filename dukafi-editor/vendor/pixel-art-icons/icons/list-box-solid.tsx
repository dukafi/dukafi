import React from 'react';
import type { IconProps } from '../types';

export function ListBoxSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 4h2v16h-2v2H4v-2H2V4h2V2h16v2ZM6 17h2v-2H6v2Zm4 0h8v-2h-8v2Zm-4-4h2v-2H6v2Zm4 0h8v-2h-8v2ZM6 9h2V7H6v2Zm4 0h8V7h-8v2Z"/>
    </svg>
  );
}
