/**
 * Plugins widget — list of installed plugins with their status dot
 * (active / disabled / error). Data comes from `usePluginsStats()`,
 * its own per-widget endpoint — fires in parallel with the rest of the
 * dashboard's data hooks and unblocks as soon as `installed_plugins`
 * has been scanned.
 *
 * Skeleton: `loading={stats === null}` — the Widget primitive renders
 * the universal skeleton body while loading; we gate the real rows
 * on `stats &&` so they never see a null value.
 */
import { PlugSolidIcon } from 'pixel-art-icons/icons/plug-solid'
import type { DashboardWidgetRendererProps } from '@core/dashboard'
import { Widget } from '@ui/components/Widget'
import { cn } from '@ui/cn'
import { usePluginsStats, type DashboardPluginRow } from '../hooks/useDashboardStats'
import styles from './widgets.module.css'

function dotClass(state: DashboardPluginRow['state']): string {
  if (state === 'active') return styles.dotGreen
  if (state === 'error') return styles.dotAmber
  return styles.dotMuted
}

function stateLabel(state: DashboardPluginRow['state']): string {
  if (state === 'active') return 'active'
  if (state === 'error') return 'error'
  return 'off'
}

export function PluginsWidget({ span, editing }: DashboardWidgetRendererProps) {
  const stats = usePluginsStats()
  const isLoading = stats === null
  const plugins = stats?.rows ?? []
  const isEmpty = !isLoading && plugins.length === 0

  return (
    <Widget
      widgetId="plugins"
      title="Plugins"
      icon={PlugSolidIcon}
      tint="mint"
      span={span}
      editing={editing}
      loading={isLoading}
    >
      <div>
        {isEmpty && (
          <p className={cn(styles.feedTime, styles.feedEmpty)}>
            No plugins installed yet.
          </p>
        )}
        {!isLoading && plugins.map((p) => (
          <div key={p.id} className={styles.pluginRow}>
            <span className={styles.pluginIcon}>
              {p.iconUrl ? (
                // Plugin-declared icon (manifest.icon resolved against
                // manifest.assetBasePath on the server). Same glyph the
                // Plugins admin card renders — keeps the dashboard row
                // visually identifiable with the plugin's brand mark.
                <img
                  src={p.iconUrl}
                  alt=""
                  className={styles.pluginIconImg}
                  width={20}
                  height={20}
                  loading="lazy"
                />
              ) : (
                <PlugSolidIcon size={12} aria-hidden="true" />
              )}
            </span>
            <span className={styles.pluginName}>
              {p.name}
              <small>v{p.version}</small>
            </span>
            <span className={styles.wlistMeta}>
              <span className={`${styles.dot} ${dotClass(p.state)}`} />
              {stateLabel(p.state)}
            </span>
          </div>
        ))}
      </div>
    </Widget>
  )
}
