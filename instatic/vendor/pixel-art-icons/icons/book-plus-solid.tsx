import React from 'react';
import type { IconProps } from '../types';

export function BookPlusSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 4h2v10h-6v2h-2v6H6v-2H4V4h2V2h12v2Zm0 14h2v2h-2v2h-2v-2h-2v-2h2v-2h2v2ZM8 12h2v-2h2v2h2V4H8v8Z"/>
    </svg>
  );
}
