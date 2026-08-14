import React from 'react';
import type { IconProps } from '../types';

export function WarningDiamondSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M14 4h2v2h2v2h2v2h2v4h-2v2h-2v2h-2v2h-2v2h-4v-2H8v-2H6v-2H4v-2H2v-4h2V8h2V6h2V4h2V2h4v2Zm-3 13h2v-2h-2v2Zm0-4h2V7h-2v6Z"/>
    </svg>
  );
}
