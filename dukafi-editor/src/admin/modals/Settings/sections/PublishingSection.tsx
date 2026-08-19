/**
 * PublishingSection — self-hosted CMS publishing details, plus the sitemap
 * Search Console wants.
 */
import { useCallback, useEffect, useState } from 'react'
import { Type } from '@core/utils/typeboxHelpers'
import { apiRequest } from '@core/http'
import { getErrorMessage } from '@core/utils/errorMessage'
import { useSiteSettingsController } from '../useSiteSettingsController'
import { resolveFrameworkPreferences } from '@core/framework'
import { copyStorefrontUrl } from '@admin/lib/storefrontUrl'
import { Button } from '@ui/components/Button'
import { Switch } from '@ui/components/Switch'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { Copy2SolidIcon } from 'pixel-art-icons/icons/copy-2-solid'
import s from '../SettingsModal.module.css'

const SitemapFileSchema = Type.Object({
  name: Type.String(),
  path: Type.String(),
  url: Type.String(),
  urlCount: Type.Number(),
})
const SitemapPayloadSchema = Type.Object({
  origin: Type.Union([Type.String(), Type.Null()]),
  index: Type.Union([SitemapFileSchema, Type.Null()]),
  files: Type.Array(SitemapFileSchema),
  robots: Type.Union([SitemapFileSchema, Type.Null()]),
  urlCount: Type.Optional(Type.Number()),
})

export function PublishingSection() {
  const { site, error, updateFrameworkPreferences } = useSiteSettingsController()
  const [sitemap, setSitemap] = useState<typeof SitemapPayloadSchema extends never ? never : {
    origin: string | null
    index: { name: string; path: string; url: string; urlCount: number } | null
    files: Array<{ name: string; path: string; url: string; urlCount: number }>
    robots: { name: string; path: string; url: string; urlCount: number } | null
    urlCount?: number
  } | null>(null)
  const [sitemapError, setSitemapError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshSitemap = useCallback(async () => {
    try {
      const payload = await apiRequest('/admin/api/cms/sitemaps', {
        schema: SitemapPayloadSchema,
        fallbackMessage: 'Could not read sitemaps',
      })
      setSitemap(payload)
      setSitemapError(null)
    } catch (err) {
      setSitemapError(getErrorMessage(err, 'Could not read sitemaps'))
    }
  }, [])

  useEffect(() => { void refreshSitemap() }, [refreshSitemap])

  async function generate() {
    setBusy(true)
    setSitemapError(null)
    try {
      const payload = await apiRequest('/admin/api/cms/sitemaps', {
        method: 'POST',
        schema: SitemapPayloadSchema,
        fallbackMessage: 'Could not generate sitemaps',
      })
      setSitemap(payload)
    } catch (err) {
      setSitemapError(getErrorMessage(err, 'Could not generate sitemaps'))
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return <p className={s.sectionDescription} role="alert">{error}</p>
  }

  if (!site) {
    return <SkeletonBlock minHeight={200} ariaLabel="Loading site settings" />
  }

  const frameworkPreferences = resolveFrameworkPreferences(site.settings.framework?.preferences)
  const treeShakeId = 'publishing-tree-shake-framework-utilities'
  const sitemapUrl = sitemap?.index?.url

  return (
    <div>
      <p className={s.sectionDescription}>
        Published pages are served by this self-hosted CMS.
      </p>

      <section aria-labelledby="pub-sitemap-heading" className={s.sectionBlock}>
        <h4 id="pub-sitemap-heading" className={s.subHeading}>
          Sitemap
        </h4>
        <p className={s.sectionDescription}>
          Submit the index URL to Google Search Console. Large catalogues split
          into sitemap-0.xml, sitemap-1.xml, and so on. Publish and catalogue
          edits already refresh these files; the button rewrites them without a
          full publish.
        </p>
        {sitemapError && <p className={s.sectionDescription} role="alert">{sitemapError}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-s)', marginBottom: 'var(--space-l)' }}>
          <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void generate()}>
            {busy ? 'Generating…' : sitemap?.index ? 'Regenerate sitemap' : 'Generate sitemap'}
          </Button>
          {sitemapUrl && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copyStorefrontUrl(sitemap.index!.path, 'Copied sitemap URL')}
            >
              <Copy2SolidIcon size={13} aria-hidden="true" />
              <span>Copy sitemap URL</span>
            </Button>
          )}
        </div>
        {sitemap?.index ? (
          <dl className={s.pubRuntimeList}>
            <div>
              <dt>Index</dt>
              <dd>{sitemap.index.url}</dd>
            </div>
            {sitemap.files.map((file) => (
              <div key={file.name}>
                <dt>{file.name}</dt>
                <dd>{file.urlCount} URL{file.urlCount === 1 ? '' : 's'}</dd>
              </div>
            ))}
            {sitemap.robots && (
              <div>
                <dt>robots.txt</dt>
                <dd>{sitemap.robots.url}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className={s.toggleRowDesc}>No sitemap yet. Publish the store, then generate one.</p>
        )}
      </section>

      <section aria-labelledby="pub-runtime-heading" className={s.sectionBlock}>
        <h4 id="pub-runtime-heading" className={s.subHeading}>
          Runtime
        </h4>

        <dl className={s.pubRuntimeList}>
          <div>
            <dt>Site</dt>
            <dd>/</dd>
          </div>
          <div>
            <dt>Admin</dt>
            <dd>/admin</dd>
          </div>
          <div>
            <dt>Draft source</dt>
            <dd>Database</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="pub-framework-heading" className={s.sectionBlock}>
        <h4 id="pub-framework-heading" className={s.subHeading}>
          Framework CSS
        </h4>

        <div className={s.cardGroup}>
          <div className={s.toggleRow}>
            <div className={s.toggleRowContent}>
              <label htmlFor={treeShakeId} className={s.toggleRowLabel}>
                Tree-shake generated framework utilities
              </label>
              <p className={s.toggleRowDesc}>
                Emit only generated color, typography, and spacing utility classes used in the page
                and component trees. Turn this off when custom runtime code references generated
                utilities outside the editor tree.
              </p>
            </div>
            <Switch
              id={treeShakeId}
              checked={frameworkPreferences.treeShakeGeneratedFrameworkUtilities}
              onCheckedChange={(value) =>
                updateFrameworkPreferences({ treeShakeGeneratedFrameworkUtilities: value })
              }
            />
          </div>
        </div>
      </section>
    </div>
  )
}
