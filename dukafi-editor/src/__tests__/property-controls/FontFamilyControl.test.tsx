import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FontFamilyControl } from '@site/property-controls/FontFamilyControl'
import { useEditorStore } from '@site/store/store'
import { makeSite } from '../fixtures'
import type { FontEntry } from '@core/fonts'

const inter: FontEntry = {
  id: 'font-inter',
  source: 'google',
  family: 'Inter',
  variants: ['400'],
  subsets: ['latin'],
  files: [
    { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
  ],
  category: 'Sans Serif',
  createdAt: 1,
  updatedAt: 1,
}

beforeEach(() => {
  useEditorStore.setState({
    site: makeSite({
      settings: {
        shortcuts: {},
        fonts: {
          items: [inter],
          tokens: [
            {
              id: 'token-primary',
              name: 'Primary',
              variable: 'font-primary',
              familyId: inter.id,
              fallback: 'sans-serif',
              order: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      },
    }),
  } as Parameters<typeof useEditorStore.setState>[0])
})

afterEach(() => {
  cleanup()
})

describe('FontFamilyControl', () => {
  it('selects a font token as a var() expression', () => {
    const changes: string[] = []
    render(
      <FontFamilyControl
        propKey="fontFamily"
        label="Font family"
        value=""
        onChange={(_key, value) => changes.push(String(value))}
      />,
    )

    fireEvent.focus(screen.getByLabelText('Font family'))
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /Primary.*var\(--font-primary\)/ }))

    expect(changes.at(-1)).toBe('var(--font-primary)')
  })

  it('opens the rich picker on a normal click-focus interaction', () => {
    render(
      <FontFamilyControl
        propKey="fontFamily"
        label="Font family"
        value=""
        onChange={() => {}}
      />,
    )

    fireEvent.click(screen.getByLabelText('Font family'))

    expect(screen.getByRole('menuitem', { name: /Primary.*var\(--font-primary\)/ })).toBeTruthy()
  })

  it('selects an installed font as a concrete family stack', () => {
    const changes: string[] = []
    render(
      <FontFamilyControl
        propKey="fontFamily"
        label="Font family"
        value=""
        onChange={(_key, value) => changes.push(String(value))}
      />,
    )

    fireEvent.focus(screen.getByLabelText('Font family'))
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /Inter.*Installed font/ }))

    expect(changes.at(-1)).toBe('"Inter", sans-serif')
  })

  it('keeps manual CSS value entry available', () => {
    const changes: string[] = []
    render(
      <FontFamilyControl
        propKey="fontFamily"
        label="Font family"
        value="serif"
        onChange={(_key, value) => changes.push(String(value))}
      />,
    )

    fireEvent.change(screen.getByLabelText('Font family'), { target: { value: 'ui-serif, serif' } })

    expect(changes.at(-1)).toBe('ui-serif, serif')
  })
})
