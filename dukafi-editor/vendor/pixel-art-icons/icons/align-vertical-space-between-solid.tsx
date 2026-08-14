import React from 'react';
import type { IconProps } from '../types';

export function AlignVerticalSpaceBetweenSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 16h2v3h2v2H2v-2h2v-3h2v-2h12v2Zm-1-8h-2v2H9V8H7V5H2V3h20v2h-5v3Z"/>
    </svg>
  );
}
