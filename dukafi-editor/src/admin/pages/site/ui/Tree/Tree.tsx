import type { HTMLAttributes, ReactNode, Ref } from 'react'

interface TreeContainerProps extends HTMLAttributes<HTMLDivElement> {
  ariaLabel: string
  testId?: string
  /** Forward a ref to the underlying div, e.g. for scroll-to-selected. */
  containerRef?: Ref<HTMLDivElement>
  children: ReactNode
}

export function TreeContainer({
  ariaLabel,
  testId,
  className,
  containerRef,
  children,
  ...props
}: TreeContainerProps) {
  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label={ariaLabel}
      data-testid={testId}
      className={className}
      {...props}
    >
      {children}
    </div>
  )
}
