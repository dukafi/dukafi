import React from 'react';
import type { IconProps } from '../types';

export function TextStartTIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M22 20H2v-2h20v2Zm0-4H2v-2h20v2Zm0-4H12v-2h10v2ZM10 8H8V6H7v4h2v2H3v-2h2V6H4v2H2V4h8v4Zm12 0H12V6h10v2Z"/>
    </svg>
  );
}
