/**
 * Marketplace metadata on plugin manifests.
 *
 * Verifies the manifest schema accepts every field a plugin author can
 * declare, rejects malformed values (XSS-prone URLs, traversal-prone icon
 * paths, oversize keyword lists), and round-trips through the parser
 * cleanly.
 */
import { describe, expect, it } from 'bun:test'
import { parsePluginManifest } from '@core/plugins/manifest'

const baseManifest = {
  id: 'acme.x',
  name: 'X',
  version: '1.0.0',
  apiVersion: 1 as const,
  permissions: [],
  resources: [],
  adminPages: [],
}

describe('plugin manifest marketplace fields', () => {
  it('accepts a fully populated marketplace manifest', () => {
    const manifest = parsePluginManifest({
      ...baseManifest,
      description: 'A plugin.',
      author: { name: 'Acme', email: 'plugins@acme.dev', url: 'https://acme.dev' },
      license: 'MIT',
      homepage: 'https://acme.dev/p/x',
      repository: 'https://github.com/acme/x',
      keywords: ['analytics', 'tracking', 'beta'],
      icon: 'icon.svg',
    })

    expect(manifest.author).toEqual({
      name: 'Acme',
      email: 'plugins@acme.dev',
      url: 'https://acme.dev',
    })
    expect(manifest.license).toBe('MIT')
    expect(manifest.homepage).toBe('https://acme.dev/p/x')
    expect(manifest.repository).toBe('https://github.com/acme/x')
    expect(manifest.keywords).toEqual(['analytics', 'tracking', 'beta'])
    expect(manifest.icon).toBe('icon.svg')
  })

  it('rejects javascript: URLs in homepage / repository / author.url', () => {
    expect(() => parsePluginManifest({
      ...baseManifest,
      homepage: 'javascript:alert(1)',
    })).toThrow(/manifest/i)
    expect(() => parsePluginManifest({
      ...baseManifest,
      author: { name: 'X', url: 'javascript:alert(1)' },
    })).toThrow(/manifest/i)
    expect(() => parsePluginManifest({
      ...baseManifest,
      repository: 'data:text/html,<script>alert(1)</script>',
    })).toThrow(/manifest/i)
  })

  it('rejects icon paths with traversal or unsupported extensions', () => {
    expect(() => parsePluginManifest({
      ...baseManifest,
      icon: '../../../etc/passwd.png',
    })).toThrow(/manifest/i)
    expect(() => parsePluginManifest({
      ...baseManifest,
      icon: 'icon.exe',
    })).toThrow(/manifest/i)
    expect(() => parsePluginManifest({
      ...baseManifest,
      icon: '/absolute/icon.png',
    })).toThrow(/manifest/i)
  })

  it('rejects malformed author email + license slug', () => {
    expect(() => parsePluginManifest({
      ...baseManifest,
      author: { name: 'X', email: 'not-an-email' },
    })).toThrow(/manifest/i)
    expect(() => parsePluginManifest({
      ...baseManifest,
      license: 'MIT some other text',
    })).toThrow(/manifest/i)
  })

  it('rejects keywords containing spaces or special chars', () => {
    expect(() => parsePluginManifest({
      ...baseManifest,
      keywords: ['valid', 'has space'],
    })).toThrow(/manifest/i)
    expect(() => parsePluginManifest({
      ...baseManifest,
      keywords: ['valid', '<script>'],
    })).toThrow(/manifest/i)
  })

  it('omits marketplace fields cleanly when absent', () => {
    const manifest = parsePluginManifest(baseManifest)
    expect(manifest.author).toBeUndefined()
    expect(manifest.license).toBeUndefined()
    expect(manifest.homepage).toBeUndefined()
    expect(manifest.repository).toBeUndefined()
    expect(manifest.keywords).toBeUndefined()
    expect(manifest.icon).toBeUndefined()
  })
})
