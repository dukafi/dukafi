/**
 * A bound prop must never look unbound.
 *
 * `text`/`textarea`/`url` controls are "token mode" — you can type
 * `{currentEntry.title}` straight into the value. That is INDEPENDENT of a
 * structured `dynamicBindings` entry, which overrides the whole prop.
 *
 * The bound-state chip used to be suppressed in token mode, so a structured
 * binding on a text prop showed an EMPTY input while the canvas and the
 * published page both rendered the bound value — with nothing on screen
 * explaining where the text came from, or any way to clear it. Every commerce
 * scaffold ("Insert product", "Insert cart") binds text props this way, so it
 * affected the common path.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { DynamicBindingControl } from '@site/property-controls/DynamicBindingControl'
import type { DynamicPropBinding } from '@core/page-tree'

afterEach(cleanup)

const BINDING: DynamicPropBinding = { source: 'currentEntry', field: 'title', format: 'plain' }

function renderControl(props: Partial<Parameters<typeof DynamicBindingControl>[0]> = {}) {
  return render(
    <DynamicBindingControl
      propKey="text"
      label="Text"
      control={{ type: 'textarea', label: 'Text' }}
      onSet={() => {}}
      onClear={() => {}}
      {...props}
    >
      <textarea aria-label="Text" defaultValue="" />
    </DynamicBindingControl>,
  )
}

describe('DynamicBindingControl bound state', () => {
  it('shows the bound state for a structured binding on a token-mode control', () => {
    const { container } = renderControl({ binding: BINDING, insertMode: true })

    // The wrapper marks itself bound, and the raw input is replaced.
    expect(container.querySelector('[data-bound="true"]')).not.toBeNull()
    expect(screen.queryByLabelText('Text')).toBeNull()
  })

  it('still shows the bound state outside token mode', () => {
    const { container } = renderControl({ binding: BINDING, insertMode: false })
    expect(container.querySelector('[data-bound="true"]')).not.toBeNull()
  })

  it('renders the plain input when nothing is bound', () => {
    const { container } = renderControl({ insertMode: true })

    expect(container.querySelector('[data-bound="true"]')).toBeNull()
    expect(screen.getByLabelText('Text')).toBeDefined()
  })
})
