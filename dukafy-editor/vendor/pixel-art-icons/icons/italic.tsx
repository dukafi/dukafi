import React from 'react';
import type { IconProps } from '../types';

export function ItalicIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 18h1v2H6v-2h3v-4h2v4Zm2-4h-2v-4h2v4Zm2-4h-2V6h-1V4h6v2h-3v4Z"/>
    </svg>
  );
}
