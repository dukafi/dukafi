import React from 'react';
import type { IconProps } from '../types';

export function MonitorSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 22H8v-2h3v-2H4v-2H2V4h2V2h16v2h2v12h-2v2h-7v2h3v2Z"/>
    </svg>
  );
}
