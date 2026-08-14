import React from 'react';
import type { IconProps } from '../types';

export function CursorClickSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M9 7h2v16H9zm2 0h2v15h-2zm2 2h2v12h-2zm2 2h2v8h-2zm2 2h2v6h-2zm2 2h2v2h-2z"/><path d="M11 21h2v2h-2zm2-2h2v2h-2zm2-2h6v2h-6zm0-12h2v2h-2zM5 10h2v2H5zm0-5h2v2H5zm4-4h2v4H9zM3 3h2v2H3zm0 9h2v2H3zm14-9h2v2h-2z"/>
    </svg>
  );
}
