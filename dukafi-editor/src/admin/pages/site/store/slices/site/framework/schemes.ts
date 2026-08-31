import { nanoid } from 'nanoid'
import type { FrameworkColorScheme, FrameworkColorSchemeRoles } from '@core/framework-schema'
import type { SiteDocument } from '@core/page-tree'
import { defaultColorSchemeRoles, deriveSchemeFromColor, schemeClassName } from '@core/framework'
import { createFrameworkColorTokenFromInput, ensureFrameworkColors } from './colors'
import { reconcileFrameworkClasses } from './reconcile'
import { nextOrderValue } from './shared'
import type { SiteSlice, SiteSliceHelpers } from '@site/store/slices/site/types'

function ensureColorSchemes(site: SiteDocument): FrameworkColorScheme[] {
  if (!site.settings.framework) {
    site.settings.framework = { colors: { tokens: [] } }
  }
  if (!site.settings.framework.colorSchemes) {
    site.settings.framework.colorSchemes = { schemes: [] }
  }
  site.settings.framework.colorSchemes.schemes ??= []
  return site.settings.framework.colorSchemes.schemes
}

function nextSchemeSlug(schemes: readonly FrameworkColorScheme[]): string {
  const used = new Set(schemes.map((scheme) => schemeClassName(scheme.slug)))
  let index = schemes.length + 1
  while (used.has(`scheme-${index}`)) index += 1
  return `scheme-${index}`
}

type SchemeActions = Pick<
  SiteSlice,
  'createColorScheme' | 'generateColorSchemeFromColor' | 'updateColorScheme' | 'deleteColorScheme'
>

export function createColorSchemeActions({ get, mutateSite }: SiteSliceHelpers): SchemeActions {
  return {
    createColorScheme: () => {
      const { site } = get()
      if (!site) throw new Error('[siteSlice] Site document is not initialized')
      const tokens = site.settings.framework?.colors?.tokens ?? []
      const existing = site.settings.framework?.colorSchemes?.schemes ?? []
      const slug = nextSchemeSlug(existing)
      const scheme: FrameworkColorScheme = {
        id: nanoid(),
        slug,
        name: `Scheme ${existing.length + 1}`,
        order: nextOrderValue(existing),
        roles: defaultColorSchemeRoles(tokens),
      }

      mutateSite((draft) => {
        ensureColorSchemes(draft).push(scheme)
        reconcileFrameworkClasses(draft)
        return true
      })
      return scheme
    },

    generateColorSchemeFromColor: (seed) => {
      const { site } = get()
      if (!site) throw new Error('[siteSlice] Site document is not initialized')
      const existing = site.settings.framework?.colorSchemes?.schemes ?? []
      const slug = nextSchemeSlug(existing)
      const derived = deriveSchemeFromColor(seed, slug)
      if (!derived) return null

      const scheme: FrameworkColorScheme = {
        id: nanoid(),
        slug: derived.prefix,
        name: `Scheme ${existing.length + 1}`,
        order: nextOrderValue(existing),
        roles: derived.roles,
      }

      mutateSite((draft) => {
        const colors = ensureFrameworkColors(draft)
        const roles = { ...scheme.roles }
        for (const token of derived.tokens) {
          const created = createFrameworkColorTokenFromInput({
            slug: token.slug,
            lightValue: token.lightValue,
            category: scheme.name,
            generateTransparent: false,
            generateShades: { enabled: true, count: 4 },
            generateTints: { enabled: true, count: 4 },
          }, colors)
          colors.tokens.push(created)
          roles[token.role] = created.slug
        }
        scheme.roles = roles
        ensureColorSchemes(draft).push(scheme)
        reconcileFrameworkClasses(draft)
        return true
      })
      return scheme
    },

    updateColorScheme: (schemeId, patch) => {
      mutateSite((draft) => {
        const schemes = ensureColorSchemes(draft)
        const scheme = schemes.find((row) => row.id === schemeId)
        if (!scheme) return false
        if (patch.name !== undefined) scheme.name = patch.name.trim() || scheme.name
        if (patch.roles) scheme.roles = { ...scheme.roles, ...patch.roles }
        reconcileFrameworkClasses(draft)
        return true
      })
    },

    deleteColorScheme: (schemeId) => {
      mutateSite((draft) => {
        const schemes = ensureColorSchemes(draft)
        const index = schemes.findIndex((row) => row.id === schemeId)
        if (index < 0) return false
        schemes.splice(index, 1)
        reconcileFrameworkClasses(draft)
        return true
      })
    },
  }
}
