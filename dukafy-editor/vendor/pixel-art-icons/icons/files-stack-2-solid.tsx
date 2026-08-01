import React from 'react';
import type { IconProps } from '../types';

export function FilesStack2SolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 22H4v-2h16v2Zm0-4H4v-2h16v2ZM16 4h-2v4h4V6h2v8H4V4h2V2h10v2Zm2 2h-2V4h2v2Z"/>
    </svg>
  );
}
