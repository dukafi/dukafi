import { describe, test, expect } from 'bun:test'
import { join } from 'node:path'
import { Value } from '@sinclair/typebox/value'
import { assertPathWithin } from '../../../server/util/pathWithin'
import { MediaAssetExportSchema } from '@core/data/bundleSchema'

/**
 * ISS-009: site-bundle import wrote media bytes to `join(uploadsDir, storagePath)`
 * with no containment check, and the schema left `storagePath` an unconstrained
 * string. A `data.import` holder could therefore write arbitrary files outside
 * the uploads root (`../../../tmp/x`) or overwrite a baked published artefact
 * (stored XSS). Two layers must hold: a sink-side containment guard and a
 * boundary-side schema that rejects traversal.
 */

describe('assertPathWithin', () => {
  const root = '/srv/uploads'

  test('accepts paths contained within the root', () => {
    expect(() => assertPathWithin(root, join(root, 'media/a.png'))).not.toThrow()
    expect(() => assertPathWithin(root, join(root, 'x/y/z.bin'))).not.toThrow()
  })

  test('rejects traversal, absolute escapes and the root itself', () => {
    expect(() => assertPathWithin(root, join(root, '../../etc/passwd'))).toThrow(/escapes/)
    expect(() => assertPathWithin(root, '/etc/passwd')).toThrow(/escapes/)
    expect(() => assertPathWithin(root, root)).toThrow(/escapes/)
  })
})

describe('MediaAssetExportSchema.storagePath', () => {
  const base = {
    id: 'm1',
    filename: 'a.png',
    mimeType: 'image/png',
    sizeBytes: 10,
    altText: '',
    caption: '',
    title: '',
    tags: [] as string[],
    width: null,
    height: null,
    durationMs: null,
    dominantColor: null,
    blurHash: null,
    bytesBase64: '',
    posterPath: null,
    folderIds: [] as string[],
  }

  test('accepts ordinary relative paths (including spaces and parens)', () => {
    for (const storagePath of ['a.png', 'media/a.png', 'uuid/My Photo (1).jpg']) {
      expect(Value.Check(MediaAssetExportSchema, { ...base, storagePath })).toBe(true)
    }
  })

  test('rejects traversal and absolute storage paths', () => {
    for (const storagePath of ['../../etc/passwd', 'a/../../b', '/etc/passwd', '..']) {
      expect(Value.Check(MediaAssetExportSchema, { ...base, storagePath })).toBe(false)
    }
  })

  test('rejects a posterPath that escapes', () => {
    expect(
      Value.Check(MediaAssetExportSchema, { ...base, storagePath: 'a.png', posterPath: '../../x' }),
    ).toBe(false)
  })
})
