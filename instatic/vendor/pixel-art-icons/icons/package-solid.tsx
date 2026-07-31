import React from 'react';
import type { IconProps } from '../types';

export function PackageSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M6 8h4v2h2v10h2v2h-4v-2H6v-2H2V6h4v2Zm16 10h-4v2h-4V8h4V6h4v12ZM14 8h-4V6h4v2Zm-4-2H6V4h4v2Zm8 0h-4V4h4v2Zm-4-2h-4V2h4v2Z"/>
    </svg>
  );
}
