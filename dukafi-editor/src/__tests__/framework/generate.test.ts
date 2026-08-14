import { describe, expect, it } from 'bun:test'
import {
  frameworkColorClassId,
  generateFrameworkColorUtilityClasses,
} from '@core/framework'
import { buildDefaultSpacingSettings, buildDefaultTypographySettings } from '@core/framework'
import {
  buildFrameworkPlan,
  generateFrameworkRootCss,
  generateFrameworkUtilityClasses,
} from '@core/framework'
import { generateFrameworkCss } from '@core/publisher'
import { resolveFrameworkPreferences } from '@core/framework'
import type { VisualComponent } from '@core/visualComponents'
import { makePage, makeSite } from '../publisher/helpers'

const colors = {
  tokens: [
    {
      id: 'primary-token',
      category: 'Brand',
      slug: 'primary',
      lightValue: 'hsla(238, 100%, 62%, 1)',
      darkValue: 'hsla(238, 100%, 42%, 1)',
      darkModeEnabled: false,
      generateUtilities: {
        text: true,
        background: true,
        border: false,
        fill: false,
      },
      generateTransparent: false,
      generateShades: { enabled: false, count: 0 },
      generateTints: { enabled: false, count: 0 },
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}

function makeFrameworkSite(treeShakeGeneratedFrameworkUtilities?: boolean) {
  const textClassId = frameworkColorClassId('primary-token', 'base', 'text')
  const page = makePage({
    root: {
      moduleId: 'base.text',
      props: { text: 'Hi' },
      classIds: [textClassId],
    },
  })
  return makeSite({
    pages: [page],
    settings: {
      ...makeSite().settings,
      framework: {
        colors,
        preferences:
          treeShakeGeneratedFrameworkUtilities === undefined
            ? undefined
            : {
                rootFontSize: 10,
                minScreenWidth: 320,
                maxScreenWidth: 1400,
                isRem: true,
                treeShakeGeneratedFrameworkUtilities,
              },
      },
    },
    classes: generateFrameworkColorUtilityClasses(colors),
  })
}

describe('framework generation facade', () => {
  it('defaults generated framework utility tree-shaking on', () => {
    expect(resolveFrameworkPreferences(undefined).treeShakeGeneratedFrameworkUtilities).toBe(true)
  })

  it('emits only used generated framework utilities by default', () => {
    const css = generateFrameworkCss(makeFrameworkSite())

    expect(css).toContain('--primary: hsla(238, 100%, 62%, 1);')
    expect(css).toContain('.text-primary {')
    expect(css).toContain('color: var(--primary);')
    expect(css).not.toContain('.bg-primary')
  })

  it('emits all generated framework utilities when tree-shaking is disabled', () => {
    const css = generateFrameworkCss(makeFrameworkSite(false))

    expect(css).toContain('.text-primary {')
    expect(css).toContain('.bg-primary {')
    expect(css).toContain('background-color: var(--primary);')
  })

  it('emits one base :root for color, typography, and spacing variables', () => {
    const css = generateFrameworkRootCss({
      colors: {
        tokens: [
          {
            ...colors.tokens[0],
            darkModeEnabled: true,
          },
        ],
      },
      typography: buildDefaultTypographySettings(),
      spacing: buildDefaultSpacingSettings(),
    })
    const baseRootBlocks = css.match(/^:root \{/gm) ?? []
    const baseRoot = css.match(/^:root \{\n[\s\S]*?\n\}/m)?.[0] ?? ''

    expect(baseRootBlocks).toHaveLength(1)
    expect(baseRoot).toContain('--primary: hsla(238, 100%, 62%, 1);')
    expect(baseRoot).toContain('--text-')
    expect(baseRoot).toContain('--space-')
    expect(css).toContain(':root.theme-alt')
    expect(css).toContain('--primary: hsla(238, 100%, 42%, 1);')
  })

  it('buildFrameworkPlan output equals the separate root-css + utility-class generators', () => {
    // All three families, dark mode (theme scopes), and two colliding color
    // slugs — so the shared-traversal plan is exercised on the full surface.
    const settings = {
      colors: {
        tokens: [
          { ...colors.tokens[0], id: 'tok-a', slug: 'Primary Color', darkModeEnabled: true, order: 0 },
          { ...colors.tokens[0], id: 'tok-b', slug: 'Primary_Color', order: 1 },
        ],
      },
      typography: buildDefaultTypographySettings(),
      spacing: buildDefaultSpacingSettings(),
    }

    const plan = buildFrameworkPlan(settings)

    // Behaviour-preserving: identical to composing the two public generators,
    // just without the duplicated per-family traversals.
    expect(plan.rootCss).toBe(generateFrameworkRootCss(settings))
    expect(plan.utilityClasses).toEqual(generateFrameworkUtilityClasses(settings))
  })

  it('keeps generated framework utilities used only inside visual component trees', () => {
    const textClassId = frameworkColorClassId('primary-token', 'base', 'text')
    const vc: VisualComponent = {
      id: 'vc-card',
      name: 'Card',
      tree: {
        rootNodeId: 'vc-root',
        nodes: {
          'vc-root': {
            id: 'vc-root',
            moduleId: 'base.text',
            props: { text: 'VC text' },
            children: [],
            breakpointOverrides: {},
            classIds: [textClassId],
            locked: false,
            hidden: false,
          },
        },
      },
      params: [],
      breakpoints: [],
      classIds: [],
      createdAt: 0,
    }
    const site = makeSite({
      pages: [
        makePage({
          root: {
            moduleId: 'base.text',
            props: { text: 'Page text' },
          },
        }),
      ],
      visualComponents: [vc],
      settings: {
        ...makeSite().settings,
        framework: { colors },
      },
      classes: generateFrameworkColorUtilityClasses(colors),
    })

    const css = generateFrameworkCss(site)

    expect(css).toContain('.text-primary {')
    expect(css).toContain('color: var(--primary);')
    expect(css).not.toContain('.bg-primary')
  })
})
