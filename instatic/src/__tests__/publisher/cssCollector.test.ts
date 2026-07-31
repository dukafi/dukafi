import { describe, it, expect, beforeEach } from 'bun:test'
import { CssCollector, sanitizeModuleCSS } from '@core/publisher'

// ---------------------------------------------------------------------------
// sanitizeModuleCSS — Constraint #228
// ---------------------------------------------------------------------------

describe('sanitizeModuleCSS', () => {
  // The neutraliser turns `</style…` into `<\/style…`. The byte sequence
  // `<` followed by `\` (not `/`) keeps the HTML5 RAWTEXT tokenizer in data
  // state, so the `<style>` block never closes early regardless of trailer.
  // CSS string literals resolve `\/` back to `/`, so any author-intended URL
  // value round-trips identically through the CSS parser.

  it('neutralises </style> so RAWTEXT cannot enter end-tag-open state (CWE-79)', () => {
    const malicious = 'h1{color:red}</style><script>alert(1)</script><style>'
    const sanitized = sanitizeModuleCSS(malicious)
    // The literal `</style` byte sequence must not survive — that is what the
    // RAWTEXT tokenizer scans for. The replacement `<\/style` does survive.
    expect(sanitized).not.toMatch(/<\/style/i)
    expect(sanitized).toContain('<\\/style')
  })

  it('neutralises </STYLE> (case-insensitive)', () => {
    expect(sanitizeModuleCSS('a{}</STYLE><b>')).not.toMatch(/<\/style/i)
  })

  it('neutralises </style  > (whitespace before >)', () => {
    expect(sanitizeModuleCSS('a{}</style  ><b>')).not.toMatch(/<\/style/i)
  })

  // -------------------------------------------------------------------------
  // HTML5 RAWTEXT terminator coverage. Per spec, `</style` followed by `/`,
  // whitespace (incl. tab/LF/FF), or `>` closes the block. The previous
  // `/<\/style\s*>/gi` regex missed the slash terminators.
  // -------------------------------------------------------------------------

  it('neutralises </style/> (HTML5 RAWTEXT slash terminator)', () => {
    expect(sanitizeModuleCSS('a{}</style/><img src=x onerror=alert(1)>')).not.toMatch(/<\/style/i)
  })

  it('neutralises </style /> (whitespace + slash)', () => {
    expect(sanitizeModuleCSS('a{}</style />b')).not.toMatch(/<\/style/i)
  })

  it('neutralises </style/foo> (slash + attribute-name junk)', () => {
    expect(sanitizeModuleCSS('a{}</style/foo>b')).not.toMatch(/<\/style/i)
  })

  it('neutralises </style\t> (tab terminator)', () => {
    expect(sanitizeModuleCSS('a{}</style\t>b')).not.toMatch(/<\/style/i)
  })

  it('neutralises </style at EOF (no trailer)', () => {
    expect(sanitizeModuleCSS('a{}</style')).not.toMatch(/<\/style/i)
  })

  it('passes through safe CSS unchanged', () => {
    const safe = 'h1 { color: red; } .container { display: flex; }'
    expect(sanitizeModuleCSS(safe)).toBe(safe)
  })

  it('handles empty string', () => {
    expect(sanitizeModuleCSS('')).toBe('')
  })
})

describe('CssCollector', () => {
  let collector: CssCollector

  beforeEach(() => {
    collector = new CssCollector()
  })

  it('starts empty', () => {
    expect(collector.size).toBe(0)
    expect(collector.isEmpty).toBe(true)
    expect(collector.collect()).toBe('')
  })

  it('adds one module CSS and collects it', () => {
    collector.add('base.text', 'h1 { color: red; }')
    expect(collector.size).toBe(1)
    expect(collector.collect()).toBe('h1 { color: red; }')
  })

  it('deduplicates: second add for same moduleId is ignored', () => {
    collector.add('base.text', 'h1 { color: red; }')
    collector.add('base.text', 'h1 { color: blue; }') // ignored
    expect(collector.size).toBe(1)
    expect(collector.collect()).toBe('h1 { color: red; }') // first wins
  })

  it('collects CSS from multiple module types', () => {
    collector.add('base.text', 'h1 { margin: 0; }')
    collector.add('base.container', '.container { display: flex; }')
    collector.add('base.image', 'img { max-width: 100%; }')
    expect(collector.size).toBe(3)
    const css = collector.collect()
    expect(css).toContain('h1 { margin: 0; }')
    expect(css).toContain('.container { display: flex; }')
    expect(css).toContain('img { max-width: 100%; }')
  })

  it('50 instances of the same module → size stays 1', () => {
    for (let i = 0; i < 50; i++) {
      collector.add('base.text', 'h1 { font-family: sans-serif; }')
    }
    expect(collector.size).toBe(1)
  })

  it('sanitizes </style> injection in add() — neutralises </style (Constraint #228)', () => {
    // `</style` is rewritten to `<\/style`; the RAWTEXT tokenizer never enters
    // end-tag-open state, so the surrounding <style> block stays intact.
    collector.add('evil.mod', 'a{}</style><script>alert(1)</script><style>')
    const css = collector.collect()
    expect(css).not.toMatch(/<\/style/i)
  })

  it('clear() resets the collector', () => {
    collector.add('base.text', 'h1 { color: red; }')
    collector.clear()
    expect(collector.size).toBe(0)
    expect(collector.isEmpty).toBe(true)
    expect(collector.collect()).toBe('')
  })

  it('collect() joins entries with newline', () => {
    collector.add('mod.a', 'a { }')
    collector.add('mod.b', 'b { }')
    expect(collector.collect()).toBe('a { }\nb { }')
  })
})
