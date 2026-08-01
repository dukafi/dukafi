import React from 'react';
import type { IconProps } from '../types';

export function TextAlignLeftIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 19H2v-2h16v2Zm-4-6H2v-2h12v2Zm8-6H2V5h20v2Z"/>
    </svg>
  );
}
