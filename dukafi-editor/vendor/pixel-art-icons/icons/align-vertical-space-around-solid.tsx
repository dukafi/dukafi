import React from 'react';
import type { IconProps } from '../types';

export function AlignVerticalSpaceAroundSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M22 18v2H2v-2h20Zm-6-8h2v4h-2v2H8v-2H6v-4h2V8h8v2Zm6-4H2V4h20v2Z"/>
    </svg>
  );
}
