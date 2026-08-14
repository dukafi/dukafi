import { describe, expect, it } from 'bun:test'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { Skeleton, SkeletonRows, SkeletonTree } from '@ui/components/Skeleton'

describe('Skeleton primitives', () => {
  it('renders local shimmer spans with CSS custom-property dimensions', () => {
    render(<Skeleton width={18} height="50%" radius={999} ariaLabel="Loading preview" />)

    const skeleton = screen.getByRole('status', { name: 'Loading preview' }) as HTMLElement
    expect(skeleton.tagName).toBe('SPAN')
    expect(skeleton.style.getPropertyValue('--skeleton-width')).toBe('18px')
    expect(skeleton.style.getPropertyValue('--skeleton-height')).toBe('50%')
    expect(skeleton.style.getPropertyValue('--skeleton-radius')).toBe('999px')
    expect(skeleton.className.includes('react-loading-skeleton')).toBe(false)
  })

  it('renders row skeletons without third-party wrapper spans', () => {
    render(<SkeletonRows count={3} rowHeight={12} ariaLabel="Loading rows" />)

    const status = screen.getByRole('status', { name: 'Loading rows' })
    expect(status.querySelectorAll('span')).toHaveLength(3)
    expect(status.querySelector('.react-loading-skeleton')).toBeNull()
  })

  it('renders an indented tree skeleton with staggered, depth-aware rows', () => {
    render(<SkeletonTree count={4} ariaLabel="Loading layers" />)

    const status = screen.getByRole('status', { name: 'Loading layers' })
    const rows = status.children
    expect(rows).toHaveLength(4)

    // Rows are depth-indented and each starts its shimmer a beat later.
    const firstRow = rows[0] as HTMLElement
    const secondRow = rows[1] as HTMLElement
    expect(firstRow.style.getPropertyValue('--skeleton-tree-indent')).toBe('8px')
    expect(secondRow.style.getPropertyValue('--skeleton-tree-indent')).toBe('20px')
    expect(firstRow.style.getPropertyValue('--skeleton-delay')).toBe('0ms')
    expect(secondRow.style.getPropertyValue('--skeleton-delay')).toBe('60ms')
  })

  it('cascades the built-in tree silhouette when no count is given', () => {
    render(<SkeletonTree ariaLabel="Loading tree" />)

    const status = screen.getByRole('status', { name: 'Loading tree' })
    // Default silhouette is 10 rows.
    expect(status.children).toHaveLength(10)
  })
})
