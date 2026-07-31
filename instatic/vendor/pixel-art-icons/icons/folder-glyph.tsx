import React from 'react';
import type { IconProps } from '../types';

export function FolderGlyphIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M12 6h10v14H2V4h10v2Z"/>
    </svg>
  );
}
