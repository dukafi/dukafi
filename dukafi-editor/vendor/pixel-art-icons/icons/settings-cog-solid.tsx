import React from 'react';
import type { IconProps } from '../types';

export function SettingsCogSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <defs><clipPath id="a"><path d="M0 0h24v24H0z"/></clipPath></defs><g clipPath="url(#a)"><path d="M15 4h2V2h5v5h-2v2h4v6h-4v2h2v5h-5v-2h-2v4H9v-4H7v2H2v-5h2v-2H0V9h4V7H2V2h5v2h2V0h6v4Zm-5 10h4v-4h-4v4Z"/></g>
    </svg>
  );
}
