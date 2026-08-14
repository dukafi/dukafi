import React from 'react';
import type { IconProps } from '../types';

export function PaintBucketSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 8h8V4h2v6h2v10h-2v2H6v-2H4V10h2V4h2v4Zm0 8h2v-4h2v2h2v-2h2v-2H8v6Zm8-12H8V2h8v2Z"/>
    </svg>
  );
}
