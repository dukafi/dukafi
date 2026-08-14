import React from 'react';
import type { IconProps } from '../types';

export function TrashSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 22H6V20H4V10H20V20H18V22ZM9 6H15V4H17V6H22V8H2V6H7V4H9V6ZM15 4H9V2H15V4Z"/>
    </svg>
  );
}
