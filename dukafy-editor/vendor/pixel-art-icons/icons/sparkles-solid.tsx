import React from 'react';
import type { IconProps } from '../types';

export function SparklesSolidIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M5 19h2v2H5v2H3v-2H1v-2h2v-2h2v2Zm8-14h2v4h4v2h4v2h-4v2h-4v4h-2v4h-2v-4H9v-4H5v-2H1v-2h4V9h4V5h2V1h2v4Zm8-2h2v2h-2v2h-2V5h-2V3h2V1h2v2Z"/>
    </svg>
  );
}
