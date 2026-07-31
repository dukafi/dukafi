/**
 * Unit tests for classifyFiles — file role assignment.
 */

import { describe, it, expect } from 'bun:test'
import { classifyFiles } from '@core/siteImport'
import type { FileMap, FileRole } from '@core/siteImport'

const enc = new TextEncoder()
const txt = (s: string) => enc.encode(s)

function fileMap(paths: string[]): FileMap {
  return {
    files: Object.fromEntries(
      paths.map((p) => [p, { bytes: txt('x') }]),
    ),
  }
}

function rolesFor(paths: string[]): Record<string, FileRole> {
  const result: Record<string, FileRole> = {}
  for (const f of classifyFiles(fileMap(paths))) {
    result[f.path] = f.role
  }
  return result
}

describe('classifyFiles — HTML', () => {
  it('classifies .html and .htm files as html', () => {
    const roles = rolesFor(['index.html', 'page.htm'])
    expect(roles['index.html']).toBe('html')
    expect(roles['page.htm']).toBe('html')
  })
})

describe('classifyFiles — CSS', () => {
  it('classifies .css files as css', () => {
    expect(rolesFor(['style.css'])['style.css']).toBe('css')
  })
})

describe('classifyFiles — JS', () => {
  it('classifies .js .mjs .cjs as js', () => {
    const roles = rolesFor(['app.js', 'utils.mjs', 'server.cjs'])
    expect(roles['app.js']).toBe('js')
    expect(roles['utils.mjs']).toBe('js')
    expect(roles['server.cjs']).toBe('js')
  })
})

describe('classifyFiles — images', () => {
  it('classifies image extensions as image', () => {
    const exts = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'gif', 'ico']
    const paths = exts.map((e) => `img.${e}`)
    const roles = rolesFor(paths)
    for (const p of paths) expect(roles[p]).toBe('image')
  })
})

describe('classifyFiles — fonts', () => {
  it('classifies font extensions as font', () => {
    const exts = ['woff', 'woff2', 'ttf', 'otf', 'eot']
    const paths = exts.map((e) => `font.${e}`)
    const roles = rolesFor(paths)
    for (const p of paths) expect(roles[p]).toBe('font')
  })
})

describe('classifyFiles — meta', () => {
  it('classifies .txt .md .json as meta', () => {
    const roles = rolesFor(['notes.txt', 'README.md', 'config.json'])
    expect(roles['notes.txt']).toBe('meta')
    expect(roles['README.md']).toBe('meta')
    expect(roles['config.json']).toBe('meta')
  })

  it('classifies README and LICENSE without extension as meta', () => {
    const roles = rolesFor(['README', 'LICENSE', 'CHANGELOG'])
    expect(roles['README']).toBe('meta')
    expect(roles['LICENSE']).toBe('meta')
    expect(roles['CHANGELOG']).toBe('meta')
  })
})

describe('classifyFiles — binary', () => {
  it('classifies unknown extensions as binary', () => {
    const roles = rolesFor(['archive.zip', 'data.csv', 'doc.pdf', 'unknown.xyz'])
    expect(roles['archive.zip']).toBe('binary')
    expect(roles['data.csv']).toBe('binary')
    expect(roles['doc.pdf']).toBe('binary')
    expect(roles['unknown.xyz']).toBe('binary')
  })
})

describe('classifyFiles — MIME type fallback', () => {
  it('uses MIME type when extension is absent', () => {
    const fm: FileMap = {
      files: {
        'no-ext-image': { bytes: txt('x'), mimeType: 'image/png' },
        'no-ext-font':  { bytes: txt('x'), mimeType: 'font/woff2' },
      },
    }
    const result = classifyFiles(fm)
    const byPath = Object.fromEntries(result.map((f) => [f.path, f.role]))
    expect(byPath['no-ext-image']).toBe('image')
    expect(byPath['no-ext-font']).toBe('font')
  })
})

describe('classifyFiles — output properties', () => {
  it('includes path, size, bytes, and mimeType', () => {
    const bytes = txt('body { color: red }')
    const fm: FileMap = {
      files: { 'style.css': { bytes, mimeType: 'text/css' } },
    }
    const [f] = classifyFiles(fm)
    expect(f.path).toBe('style.css')
    expect(f.role).toBe('css')
    expect(f.size).toBe(bytes.byteLength)
    expect(f.bytes).toBe(bytes)
    expect(f.mimeType).toBe('text/css')
  })

  it('returns files sorted by path', () => {
    const roles = classifyFiles(fileMap(['z.html', 'a.css', 'm.js']))
    const paths = roles.map((f) => f.path)
    expect(paths).toEqual([...paths].sort())
  })
})
