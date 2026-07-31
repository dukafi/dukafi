import React from 'react';
import type { IconProps } from '../types';

export function TrendingUpIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M4 18H2v-2h2v2Zm2-2H4v-2h2v2Zm8 0h-2v-2h2v2Zm-6-2H6v-2h2v2Zm4 0h-2v-2h2v2Zm4 0h-2v-2h2v2Zm6-8v8h-2v-4h-2V8h-4V6h8Zm-12 6H8v-2h2v2Zm8 0h-2v-2h2v2Z"/>
    </svg>
  );
}
