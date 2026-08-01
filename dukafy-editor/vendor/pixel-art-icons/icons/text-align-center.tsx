import React from 'react';
import type { IconProps } from '../types';

export function TextAlignCenterIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 19H4v-2h16v2Zm-2-6H6v-2h12v2Zm4-6H2V5h20v2Z"/>
    </svg>
  );
}
