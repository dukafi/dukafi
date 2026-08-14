import React from 'react';
import type { IconProps } from '../types';

export function VideoSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 19H4v-2H2V7h2V5h12v2h2v2h2V7h2v10h-2v-2h-2v2h-2v2Z"/>
    </svg>
  );
}
