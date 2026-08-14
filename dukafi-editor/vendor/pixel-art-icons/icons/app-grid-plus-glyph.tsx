import React from 'react';
import type { IconProps } from '../types';

export function AppGridPlusGlyphIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M2 2h9v9H2zm0 11h9v9H2zM13 2h9v9h-9zm4 12h2v8h-2z"/><path d="M22 17v2h-8v-2z"/>
    </svg>
  );
}
