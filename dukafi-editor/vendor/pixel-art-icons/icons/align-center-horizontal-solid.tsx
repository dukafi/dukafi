import React from 'react';
import type { IconProps } from '../types';

export function AlignCenterHorizontalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 20H9v2H5v-2H3v-5h8v5Zm10-3h-2v2h-4v-2h-2v-2h8v2Zm1-4H2v-2h20v2ZM9 4h2v5H3V4h2V2h4v2Zm10 3h2v2h-8V7h2V5h4v2Z"/>
    </svg>
  );
}
