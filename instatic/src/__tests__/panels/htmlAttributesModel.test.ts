import { describe, expect, it } from 'bun:test'
import {
  htmlAttributeRowsFromValue,
  htmlAttributesKey,
  validateHtmlAttributeRows,
} from '@site/panels/PropertiesPanel/htmlAttributesModel'

describe('html attributes panel model', () => {
  it('accepts ordinary safe HTML attributes', () => {
    const result = validateHtmlAttributeRows([
      { id: 'id', name: ' id ', value: 'hero' },
      { id: 'role', name: 'role', value: 'region' },
      { id: 'label', name: 'aria-label', value: 'Hero' },
      { id: 'data', name: 'data-track', value: 'hero' },
    ])

    expect(result.attributes).toEqual({
      'aria-label': 'Hero',
      'data-track': 'hero',
      id: 'hero',
      role: 'region',
    })
    expect(result.errors).toEqual({})
  })

  it('normalizes persisted attributes while preserving stored row order', () => {
    expect(htmlAttributeRowsFromValue({
      id: 'hero',
      'data-z': 'last',
      'aria-label': 'Hero',
      'data-a': 'first',
      'data-instatic-node': 'reserved',
      'data-number': 123,
      class: 'ignored',
      onclick: 'ignored',
    })).toEqual([
      { id: 'id', name: 'id', value: 'hero' },
      { id: 'data-z', name: 'data-z', value: 'last' },
      { id: 'aria-label', name: 'aria-label', value: 'Hero' },
      { id: 'data-a', name: 'data-a', value: 'first' },
    ])
  })

  it('validates draft rows before applying them', () => {
    const result = validateHtmlAttributeRows([
      { id: 'valid', name: ' data-track ', value: 'hero' },
      { id: 'id', name: 'id', value: 'hero' },
      { id: 'role', name: 'role', value: 'region' },
      { id: 'empty-value', name: 'data-empty', value: '' },
      { id: 'blank', name: '', value: '' },
      { id: 'missing-name', name: '', value: 'orphan' },
      { id: 'class', name: 'class', value: 'hero' },
      { id: 'style', name: 'style', value: 'color: red' },
      { id: 'handler', name: 'onclick', value: 'alert(1)' },
      { id: 'reserved', name: 'data-canvas-state', value: 'selected' },
      { id: 'dupe-a', name: 'data-track', value: 'cta' },
    ])

    expect(result.attributes).toEqual({
      'data-empty': '',
      'data-track': 'hero',
      id: 'hero',
      role: 'region',
    })
    expect(result.errors).toEqual({
      'missing-name': 'Add an attribute name.',
      class: 'Classes are managed in Styles.',
      style: 'Inline styles are managed in Styles.',
      handler: 'Event handler attributes are not allowed.',
      reserved: 'This attribute is reserved by the editor.',
      'dupe-a': 'Attribute names must be unique.',
    })
  })

  it('keys attributes independent of insertion order', () => {
    expect(htmlAttributesKey({ 'data-b': '2', id: 'hero' })).toBe(
      htmlAttributesKey({ id: 'hero', 'data-b': '2' }),
    )
  })
})
