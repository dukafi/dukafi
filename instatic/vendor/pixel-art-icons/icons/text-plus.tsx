import React from 'react';
import type { IconProps } from '../types';

export function TextPlusIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 15h3v2h-3v3h-2v-3h-3v-2h3v-3h2v3Zm-7 3H3v-2h8v2Zm0-4H3v-2h8v2Zm8-4H3V8h16v2Zm0-4H3V4h16v2Z"/>
    </svg>
  );
}
