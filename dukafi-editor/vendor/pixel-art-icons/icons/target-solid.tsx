import React from 'react';
import type { IconProps } from '../types';

export function TargetSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M19 23H5v-2H3v-2H1V5h2V3h2V1h14v2h2v2h2v14h-2v2h-2v2ZM9 19h6v-2H9v2Zm-2-2h2v-2H7v2Zm8 0h2v-2h-2v2ZM5 15h2V9H5v6Zm6 0h2v-2h-2v2Zm6 0h2V9h-2v6Zm-8-2h2v-2H9v2Zm4 0h2v-2h-2v2Zm-2-2h2V9h-2v2ZM7 9h2V7H7v2Zm8 0h2V7h-2v2ZM9 7h6V5H9v2Z"/>
    </svg>
  );
}
