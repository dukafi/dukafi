import { describe, expect, it } from 'bun:test'
import { Value } from '@core/utils/typeboxHelpers'
import {
  PropertyControlSchema,
  PropertySchemaSchema,
} from '@core/module-engine'

describe('module-engine property schema', () => {
  it('accepts every host property control type, including nested groups', () => {
    const schema = {
      title: { type: 'text', label: 'Title', placeholder: 'Headline' },
      body: { type: 'textarea', label: 'Body', rows: 4, layout: 'stacked' },
      count: { type: 'number', label: 'Count', min: 0, max: 10, step: 1, unit: 'items' },
      accent: { type: 'color', label: 'Accent', format: 'hex' },
      variant: { type: 'select', label: 'Variant', options: [{ label: 'A', value: 'a' }] },
      enabled: { type: 'toggle', label: 'Enabled' },
      image: { type: 'image', label: 'Image' },
      video: { type: 'media', label: 'Video', mediaKind: 'video' },
      url: { type: 'url', label: 'URL' },
      rich: { type: 'richtext', label: 'Rich text' },
      advanced: {
        type: 'group',
        label: 'Advanced',
        collapsed: true,
        children: {
          gated: {
            type: 'text',
            label: 'Gated',
            condition: { and: [{ field: 'enabled', eq: true }] },
            breakpointOverridable: true,
          },
        },
      },
    }

    expect(Value.Check(PropertySchemaSchema, schema)).toBe(true)
  })

  it('rejects unknown controls and extra keys at the boundary', () => {
    expect(Value.Check(PropertyControlSchema, {
      type: 'text',
      label: 'Title',
      unsafe: true,
    })).toBe(false)

    expect(Value.Check(PropertyControlSchema, {
      type: 'slider',
      label: 'Range',
    })).toBe(false)
  })
})
