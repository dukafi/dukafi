import React from 'react';
import type { IconProps } from '../types';

export function GlobeSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M7 17h2v-4h6v4h-2v2h-2v-2H9v2h2v2H6v-2H4v-2H2v-4h5v4Zm15 0h-2v2h-2v2h-5v-2h2v-2h2v-4h5v4ZM11 5H9v2H7v4H2V7h2V5h2V3h5v2Zm4 6H9V7h2V5h2V3h5v2h2v2h2v4h-5V7h-2V5h-2v2h2v4Z"/>
    </svg>
  );
}
