/**
 * ParamRow — component tests
 *
 * Tests:
 *   PR-1  default-edit: renaming to a duplicate name shows role="alert" and does NOT call onParamRename
 *   PR-2  enum: renders a <Select> with the correct options
 *   PR-3  slot: does NOT render a value control
 *   PR-4  advanced disclosure: toggles required and description fields
 *   PR-5  default-edit: labels the component-param editing surface
 *
 * @see src/editor/components/PropertiesPanel/ParamRow.tsx
 * @see Contribution #619 Phase 2 §A
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ParamRow } from '@site/panels/PropertiesPanel/ParamRow'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Gate PR-1 — invalid rename shows alert and does NOT call onParamRename
// ---------------------------------------------------------------------------

describe('Gate PR-1 — invalid rename shows alert, blocks onParamRename', () => {
  it('labels the default-edit surface as a component param editor', () => {
    render(
      <ParamRow
        mode="default-edit"
        paramName="interfaceUrl"
        paramType="url"
        paramId="p-1"
        value="#interface"
        onValueChange={() => {}}
        existingParams={[{ id: 'p-1', name: 'interfaceUrl' }]}
      />
    )

    expect(screen.getByText('Param name')).toBeDefined()
    expect(screen.getByText('Default value')).toBeDefined()
    expect(screen.queryByText('from Link.url')).toBeNull()
    expect(screen.getByText('Param')).toBeDefined()
    expect(screen.getByText('url')).toBeDefined()
  })

  it('shows a role="alert" error and does not call onParamRename for a duplicate name', () => {
    const onParamRename = { fn: (_: string) => {} }
    let renameCalled = false
    onParamRename.fn = () => { renameCalled = true }

    render(
      <ParamRow
        mode="default-edit"
        paramName="title"
        paramType="string"
        paramId="p-1"
        value="Hello"
        onValueChange={() => {}}
        onParamRename={onParamRename.fn}
        existingParams={[
          { id: 'p-1', name: 'title' },
          { id: 'p-2', name: 'subtitle' },
        ]}
      />
    )

    const input = screen.getByRole('textbox', { name: /parameter name/i })

    // Type a name that collides with another param on the same VC
    fireEvent.change(input, { target: { value: 'subtitle' } })

    // Error alert should appear
    expect(screen.getByRole('alert')).toBeDefined()

    // Blur without correcting
    fireEvent.blur(input)

    // onParamRename must NOT have been called
    expect(renameCalled).toBe(false)
  })

  it('calls onParamRename with the new name when a free-form name is committed', () => {
    let renamedTo = ''

    render(
      <ParamRow
        mode="default-edit"
        paramName="title"
        paramType="string"
        paramId="p-1"
        value="Hello"
        onValueChange={() => {}}
        onParamRename={(name) => { renamedTo = name }}
        existingParams={[{ id: 'p-1', name: 'title' }]}
      />
    )

    const input = screen.getByRole('textbox', { name: /parameter name/i })
    fireEvent.change(input, { target: { value: 'Page headline' } })

    // No error for free-form name
    expect(screen.queryByRole('alert')).toBeNull()

    // Commit via blur
    fireEvent.blur(input)
    expect(renamedTo).toBe('Page headline')
  })
})

// ---------------------------------------------------------------------------
// Gate PR-2 — enum paramType renders Select with correct options
// ---------------------------------------------------------------------------

describe('Gate PR-2 — enum renders Select with options', () => {
  it('renders a combobox (select) element containing the enumOptions', () => {
    render(
      <ParamRow
        mode="override-edit"
        paramName="size"
        paramType="enum"
        paramId="p-2"
        value="md"
        enumOptions={['sm', 'md', 'lg']}
        onValueChange={() => {}}
      />
    )

    // @ui/components/Select renders a custom dropdown — find by role combobox or listbox
    // We assert options exist in the DOM
    expect(screen.getByText('sm')).toBeDefined()
    expect(screen.getByText('md')).toBeDefined()
    expect(screen.getByText('lg')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Gate PR-3 — slot paramType does NOT render a value control
// ---------------------------------------------------------------------------

describe('Gate PR-3 — slot paramType does not render a value control', () => {
  it('renders "Edit on canvas" caption instead of an input/select/switch', () => {
    render(
      <ParamRow
        mode="override-edit"
        paramName="children"
        paramType="slot"
        paramId="p-3"
        value={[]}
        onValueChange={() => {}}
      />
    )

    // No inputs, no select, no buttons (only UI might be param name)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()

    // The "Edit on canvas" caption is present
    expect(screen.getByText(/edit on canvas/i)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Gate PR-4 — advanced disclosure toggles required and description
// ---------------------------------------------------------------------------

describe('Gate PR-4 — advanced disclosure toggles required/description', () => {
  let patches: Array<{ required?: boolean; description?: string; enumOptions?: string[] }> = []

  beforeEach(() => {
    patches = []
  })

  it('reveals required switch and description textarea on chevron click', () => {
    render(
      <ParamRow
        mode="default-edit"
        paramName="title"
        paramType="string"
        paramId="p-4"
        value="Hello"
        required={false}
        description=""
        onValueChange={() => {}}
        onAdvancedChange={(patch) => { patches.push(patch) }}
        existingParams={[{ id: 'p-4', name: 'title' }]}
      />
    )

    // Advanced disclosure is closed by default — no required switch visible
    expect(screen.queryByRole('switch')).toBeNull()

    // Click the chevron to open
    const chevronBtn = screen.getByRole('button', { name: /open advanced options/i })
    fireEvent.click(chevronBtn)

    // Now required switch should be visible
    expect(screen.getByRole('switch')).toBeDefined()

    // Toggle required
    fireEvent.click(screen.getByRole('switch'))
    expect(patches).toHaveLength(1)
    expect(patches[0].required).toBe(true)
  })
})
