/**
 * Mock site document factory for siteImport tests.
 *
 * Provides a minimal `SiteDocument` that tests can pass to `buildImportPlan`
 * and `detectConflicts` without needing a full DB-backed site.
 */

import type { SiteDocument } from '@core/page-tree'
import { DEFAULT_BREAKPOINTS, DEFAULT_SITE_SETTINGS } from '@core/page-tree'
import { normalizeSiteRuntimeConfig } from '@core/site-runtime/runtimeConfig'

// Re-export for convenience
export { makeSampleFileMap } from './fixtures'

/**
 * A minimal SiteDocument with:
 *   - one existing page (slug: 'existing')
 *   - one existing class rule (name: 'existing-class')
 *   - default breakpoints (mobile/tablet/desktop)
 */
export function makeMockSiteDocument(): SiteDocument {
  const now = Date.now()
  return {
    id: 'mock-site-id',
    name: 'Mock Site',
    breakpoints: DEFAULT_BREAKPOINTS,
    settings: DEFAULT_SITE_SETTINGS,
    styleRules: {
      'existing-rule-id': {
        id: 'existing-rule-id',
        name: 'existing-class',
        kind: 'class',
        selector: '.existing-class',
        order: 0,
        styles: { color: 'red' },
        contextStyles: {},
        createdAt: now,
        updatedAt: now,
      },
      'ambient-rule-id': {
        id: 'ambient-rule-id',
        name: 'h1',
        kind: 'ambient',
        selector: 'h1',
        order: 1,
        styles: { fontSize: '2rem' },
        contextStyles: {},
        createdAt: now,
        updatedAt: now,
      },
    },
    files: [],
    packageJson: { dependencies: {}, devDependencies: {} },
    runtime: normalizeSiteRuntimeConfig(undefined),
    createdAt: now,
    updatedAt: now,
    pages: [
      {
        id: 'existing-page-id',
        title: 'Existing Page',
        slug: 'existing',
        rootNodeId: 'root-id',
        nodes: {
          'root-id': {
            id: 'root-id',
            moduleId: 'base.body',
            props: {},
            breakpointOverrides: {},
            children: [],
            classIds: [],
          },
        },
      },
    ],
    visualComponents: [],
  }
}

/**
 * A site document with NO existing pages (for clean-import tests).
 */
export function makeEmptySiteDocument(): SiteDocument {
  const now = Date.now()
  return {
    id: 'empty-site-id',
    name: 'Empty Site',
    breakpoints: DEFAULT_BREAKPOINTS,
    settings: DEFAULT_SITE_SETTINGS,
    styleRules: {},
    files: [],
    packageJson: { dependencies: {}, devDependencies: {} },
    runtime: normalizeSiteRuntimeConfig(undefined),
    createdAt: now,
    updatedAt: now,
    pages: [
      {
        id: 'home-id',
        title: 'Home',
        slug: 'home',
        rootNodeId: 'root-id',
        nodes: {
          'root-id': {
            id: 'root-id',
            moduleId: 'base.body',
            props: {},
            breakpointOverrides: {},
            children: [],
            classIds: [],
          },
        },
      },
    ],
    visualComponents: [],
  }
}
