import React from 'react';
import type { IconProps } from '../types';

export function AiSettingsSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M6 4h2V2h8v2h2V2h2v2h2v2h-2v2h2v8h-2v2h2v2h-2v2h-2v-2h-2v2H8v-2H6v2H4v-2H2v-2h2v-2H2V8h2V6H2V4h2V2h2v2Zm1 6v6h2v-2h2v2h2v-6h-2v2H9v-2H7Zm8-2v8h2V8h-2ZM9 8v2h2V8H9Z"/>
    </svg>
  );
}
