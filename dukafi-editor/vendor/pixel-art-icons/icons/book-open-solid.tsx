import React from 'react';
import type { IconProps } from '../types';

export function BookOpenSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 5h2V3h9v2h2v16H13v2h-2v-2H0V5h2V3h9v2Zm0 14h2V7h-2v12Zm4-2h2v-2h-2v2Zm0-4h5v-2h-5v2Zm0-4h5V7h-5v2Z"/>
    </svg>
  );
}
