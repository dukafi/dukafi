import React from 'react';
import type { IconProps } from '../types';

export function ExternalLinkSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 9H9v2H7v6h6v-2h2v-2h4v6h-2v2H5v-2H3V7h2V5h6v4Zm0 6H9v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V9h2v2Zm6 0h-2V7h-2V5h-4V3h8v8Zm-4-2h-2V7h2v2Z"/>
    </svg>
  );
}
