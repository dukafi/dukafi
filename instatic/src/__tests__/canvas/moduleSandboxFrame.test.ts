import { describe, expect, it } from 'bun:test'
import { createSandboxSrcDoc } from '@site/canvas/moduleSandboxSrcDoc'

describe('ModuleSandboxFrame srcDoc', () => {
  it('builds an isolated iframe document with import map, encoded module source, and host bridge', () => {
    const threeUrl = '/_instatic/runtime/cache/abc123/three/build/three.module.js'
    const srcDoc = createSandboxSrcDoc({
      title: 'Runtime preview',
      source: `import * as THREE from 'three'\nexport function mount() {}`,
      importMap: {
        imports: {
          three: threeUrl,
          'three/': '/_instatic/runtime/cache/abc123/three/',
        },
      },
      context: {
        props: { sceneLabel: 'Scene' },
        nodeId: 'node-1',
        isSelected: false,
        className: 'class-1',
        dependencies: { three: threeUrl },
        apiVersion: 1,
      },
      classCSS: '.class-1 {\\n  height: 360px;\\n}',
    })

    expect(srcDoc).toContain('<script type="importmap">')
    expect(srcDoc).toContain(`"three":"${threeUrl}"`)
    expect(srcDoc).toContain('data:text/javascript;base64,')
    expect(srcDoc).not.toContain(`import * as THREE from 'three'`)
    expect(srcDoc).toContain('instatic-module-sandbox')
    expect(srcDoc).toContain('instatic-module-host')
    expect(srcDoc).toContain("message.type !== 'update'")
    expect(srcDoc).toContain('.class-1')
  })
})
