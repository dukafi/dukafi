import { afterEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { CanvasModulePlaceholder } from '@ui/components/CanvasModulePlaceholder'
import { ImageModule } from '@modules/base/image'
import { ImageEditor } from '@modules/base/image/ImageEditor'

afterEach(cleanup)

describe('CanvasModulePlaceholder', () => {
  it('forwards canvas node wrapper props to the placeholder root', () => {
    let clicks = 0
    const rootProps = {
      'data-node-id': 'image-node',
      'data-module-id': 'base.image',
      onClick: () => {
        clicks += 1
      },
    }

    const { container } = render(
      <CanvasModulePlaceholder
        {...rootProps}
        label="No image selected"
      />,
    )

    const root = container.querySelector('[data-canvas-module-placeholder]')
    expect(root?.getAttribute('data-node-id')).toBe('image-node')
    expect(root?.getAttribute('data-module-id')).toBe('base.image')

    fireEvent.click(root!)
    expect(clicks).toBe(1)
  })

  it('does not rely on global placeholder icon sizing rules', () => {
    const moduleCss = readFileSync(
      new URL('../../ui/components/CanvasModulePlaceholder/CanvasModulePlaceholder.module.css', import.meta.url),
      'utf8',
    )
    const chromeInjector = readFileSync(
      new URL('../../admin/pages/site/canvas/EditorChromeInjector.tsx', import.meta.url),
      'utf8',
    )

    expect(moduleCss).not.toContain('[data-icon-sizing="block"] svg')
    expect(chromeInjector).not.toContain('[data-icon-sizing="block"] svg')
  })

  it('keeps block placeholder content stack rules in module and iframe chrome CSS', () => {
    const moduleCss = readFileSync(
      new URL('../../ui/components/CanvasModulePlaceholder/CanvasModulePlaceholder.module.css', import.meta.url),
      'utf8',
    )
    const chromeInjector = readFileSync(
      new URL('../../admin/pages/site/canvas/EditorChromeInjector.tsx', import.meta.url),
      'utf8',
    )

    expect(moduleCss).toContain('.variant-block .content')
    expect(moduleCss).toContain('place-items: center')
    expect(moduleCss).toContain('row-gap: var(--space-s)')
    expect(moduleCss).toContain('.variant-block[data-layout="row"] .content')
    expect(moduleCss).toContain('.icon > svg')
    expect(moduleCss).toContain('margin: 0;')
    expect(moduleCss).toContain('padding: 0;')
    expect(chromeInjector).toContain('[data-instatic-placeholder-content]')
    expect(chromeInjector).toContain('place-items: center')
    expect(chromeInjector).toContain('row-gap: var(--chrome-space-s)')
    expect(chromeInjector).toContain('[data-variant="block"][data-layout="row"]')
    expect(chromeInjector).toContain('[data-instatic-placeholder-icon] > svg')
    expect(chromeInjector).toContain('margin: 0;')
    expect(chromeInjector).toContain('padding: 0;')
  })

  it('renders the empty image placeholder as a compact centered row', () => {
    const { container } = render(
      <ImageEditor
        props={ImageModule.defaults}
      />,
    )

    const root = container.querySelector('[data-canvas-module-placeholder]')
    const icon = container.querySelector('[data-instatic-placeholder-icon]')
    const svg = icon?.querySelector('svg')
    expect(root?.getAttribute('data-layout')).toBe('row')
    expect(icon?.hasAttribute('data-icon-sizing')).toBe(false)
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
  })

  it('keeps empty-state icon and label inside an isolated content stack', () => {
    const { container } = render(
      <CanvasModulePlaceholder
        icon={<svg aria-hidden="true" />}
        label="No image selected"
      />,
    )

    const root = container.querySelector('[data-canvas-module-placeholder]')
    const content = root?.querySelector('[data-instatic-placeholder-content]')
    expect(content).not.toBeNull()
    expect(content?.querySelector('[data-instatic-placeholder-icon]')).not.toBeNull()
    expect(content?.querySelector('[data-instatic-placeholder-label]')?.textContent).toBe('No image selected')
  })
})
