/**
 * Unit tests for `useScrollSpy` — the shared scroll-spy behind StyleSurface
 * and SelectorInspector.
 *
 * The hook tracks the `[data-style-section]` block nearest to (but not past)
 * the scroll container's top, and exposes a `scrollTo(id)` helper that scrolls
 * the matching section to the container top. Section/container geometry is
 * stubbed via `getBoundingClientRect` so the math is deterministic without a
 * real layout.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { useScrollSpy } from '@site/panels/PropertiesPanel/useScrollSpy'

function rect(top: number): DOMRect {
  return { top, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect
}

interface ContainerOptions {
  containerTop?: number
  scrollTop?: number
}

function makeContainer(
  sectionTops: Record<string, number>,
  { containerTop = 0, scrollTop = 0 }: ContainerOptions = {},
): { container: HTMLDivElement; scrollCalls: ScrollToOptions[] } {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => rect(containerTop)
  Object.defineProperty(container, 'scrollTop', { value: scrollTop, configurable: true, writable: true })

  const scrollCalls: ScrollToOptions[] = []
  container.scrollTo = ((opts: ScrollToOptions) => { scrollCalls.push(opts) }) as typeof container.scrollTo

  for (const [id, top] of Object.entries(sectionTops)) {
    const section = document.createElement('div')
    section.setAttribute('data-style-section', id)
    section.getBoundingClientRect = () => rect(top)
    container.appendChild(section)
  }

  document.body.appendChild(container)
  return { container, scrollCalls }
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

describe('useScrollSpy', () => {
  it('starts at initialId', () => {
    const { container } = makeContainer({ layout: -200, typography: 300 })
    const ref = { current: container } as RefObject<HTMLDivElement>

    const { result } = renderHook(() => useScrollSpy(ref, { initialId: 'layout' }))

    expect(result.current.activeId).toBe('layout')
  })

  it('sets activeId to the section nearest (but not past) the container top on scroll', () => {
    // `typography` (relTop -10) is the closest section above the top; `layout`
    // (relTop -200) is further above, `spacing` (relTop 300) is below the top.
    const { container } = makeContainer({ layout: -200, typography: -10, spacing: 300 })
    const ref = { current: container } as RefObject<HTMLDivElement>

    const { result } = renderHook(() => useScrollSpy(ref, { initialId: 'layout' }))

    act(() => {
      container.dispatchEvent(new Event('scroll'))
    })

    expect(result.current.activeId).toBe('typography')
  })

  it('scrollTo targets the matching section and sets it active', () => {
    // container top 20, section `typography` top 120, scrollTop 50 →
    // expected scroll offset = 120 - 20 + 50 = 150.
    const { container, scrollCalls } = makeContainer(
      { layout: 0, typography: 120 },
      { containerTop: 20, scrollTop: 50 },
    )
    const ref = { current: container } as RefObject<HTMLDivElement>

    const { result } = renderHook(() => useScrollSpy(ref, { initialId: 'layout' }))

    act(() => {
      result.current.scrollTo('typography')
    })

    expect(result.current.activeId).toBe('typography')
    expect(scrollCalls).toHaveLength(1)
    expect(scrollCalls[0].top).toBe(150)
  })

  it('scrollTopId scrolls to the absolute top instead of the section offset', () => {
    const { container, scrollCalls } = makeContainer(
      { module: 200, layout: 400 },
      { containerTop: 0, scrollTop: 80 },
    )
    const ref = { current: container } as RefObject<HTMLDivElement>

    const { result } = renderHook(() =>
      useScrollSpy(ref, { initialId: 'module', scrollTopId: 'module' }),
    )

    act(() => {
      result.current.scrollTo('module')
    })

    expect(result.current.activeId).toBe('module')
    expect(scrollCalls).toHaveLength(1)
    expect(scrollCalls[0].top).toBe(0)
  })
})
