import React from 'react';
import type { IconProps } from '../types';

export function AlignCenterVerticalSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M13 22h-2V2h2v20Zm-4-1H7v-2H5v-4h2v-2h2v8Zm8-6h2v4h-2v2h-2v-8h2v2Zm-8-4H4V9H2V5h2V3h5v8Zm11-6h2v4h-2v2h-5V3h5v2Z"/>
    </svg>
  );
}
