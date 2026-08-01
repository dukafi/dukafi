import React from 'react';
import type { IconProps } from '../types';

export function AlignHorizontalSpaceAroundSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M6 22H4V2h2v20ZM20 2v20h-2V2h2Zm-6 6h2v8h-2v2h-4v-2H8V8h2V6h4v2Z"/>
    </svg>
  );
}
