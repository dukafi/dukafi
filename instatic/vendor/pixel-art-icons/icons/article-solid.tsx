import React from 'react';
import type { IconProps } from '../types';

export function ArticleSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 4h2v16h-2v2H4v-2h2v-6H4v-2h2V4h2V2h12v2ZM4 20H2v-6h2v6Zm6-2h4v-2h-4v2Zm0-4h8v-2h-8v2Zm0-4h8V6h-8v4Z"/>
    </svg>
  );
}
