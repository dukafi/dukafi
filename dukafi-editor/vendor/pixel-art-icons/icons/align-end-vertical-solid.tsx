import React from 'react';
import type { IconProps } from '../types';

export function AlignEndVerticalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M22 2v20h-2V2h2Zm-6 13h2v4h-2v2h-5v-2H9v-4h2v-2h5v2Zm0-10h2v4h-2v2H4V9H2V5h2V3h12v2Z"/>
    </svg>
  );
}
