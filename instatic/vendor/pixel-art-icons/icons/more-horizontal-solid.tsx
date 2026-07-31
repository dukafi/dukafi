import React from 'react';
import type { IconProps } from '../types';

export function MoreHorizontalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M5 11h2v2H5v2H3v-2H1v-2h2V9h2v2Zm8 0h2v2h-2v2h-2v-2H9v-2h2V9h2v2Zm8 0h2v2h-2v2h-2v-2h-2v-2h2V9h2v2Z"/>
    </svg>
  );
}
