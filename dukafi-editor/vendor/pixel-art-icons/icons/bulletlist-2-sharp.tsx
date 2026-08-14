import React from 'react';
import type { IconProps } from '../types';

export function Bulletlist2SharpIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M10 11h12v2H10zm0-4h12v2H10zm0 8h12v2H10zM4 9h2v2H4zm0 4h2v2H4zm-2 0v-2h2v2zm4 0v-2h2v2zM2 5h6v2H2z"/><path d="M2 9h6v2H2zm0 0V7h2v2zm4 0V7h2v2zm-4 4h6v2H2zm0 4h6v2H2zm0 0v-2h2v2zm4 0v-2h2v2z"/>
    </svg>
  );
}
