import React from 'react';
import type { IconProps } from '../types';

export function HandGrabSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M9 11h2V7h2v4h2V7h2v5h2V9h2v12h-2v2H7v-2H5v-2H3v-6h2v2h2V7h2v4Zm-2 6h2v-2H7v2Z"/>
    </svg>
  );
}
