/**
 * siteExportCommands.test.ts
 *
 * Unit tests for the `getSiteExportCommands()` Spotlight command factory —
 * makes "Export site" reachable from cmd+k anywhere. Mirrors
 * `siteImportCommands.test.ts`.
 */

import { describe, it, expect } from 'bun:test'
import { getSiteExportCommands } from '@admin/spotlight/commands/siteExport'
import { useAdminUi } from '@admin/state/adminUi'

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    closeSpotlight: () => {},
    ...overrides,
  }
}

describe('getSiteExportCommands', () => {
  it('returns the Site Export spotlight command contract', () => {
    const [command] = getSiteExportCommands()
    expect(command).toMatchObject({
      id: 'data.exportSite',
      title: 'Export Site',
      group: 'data',
      workspaces: ['any'],
    })
    expect(getSiteExportCommands()).toHaveLength(1)
    expect(command.subtitle?.toLowerCase()).toMatch(/bundle|backup|export|download/)
    expect(command.capability).toBe('data.export')
    expect(command.iconName).toBeTruthy()
    expect(command.keywords).toEqual(
      expect.arrayContaining(['export', 'site', 'bundle', 'backup', 'download']),
    )
  })

  it('closes Spotlight before opening the Site Export modal', async () => {
    useAdminUi.setState({ siteExport: null } as Parameters<typeof useAdminUi.setState>[0])

    const callOrder: string[] = []
    const ctx = makeCtx({ closeSpotlight: () => callOrder.push('closeSpotlight') })
    const origOpen = useAdminUi.getState().openSiteExport
    useAdminUi.setState({
      openSiteExport: ((context) => {
        callOrder.push('openModal')
        origOpen(context)
      }) as typeof origOpen,
    } as Parameters<typeof useAdminUi.setState>[0])

    await getSiteExportCommands()[0].run(ctx as never)

    expect(callOrder).toEqual(['closeSpotlight', 'openModal'])
    expect(useAdminUi.getState().siteExport).not.toBeNull()

    useAdminUi.setState({ openSiteExport: origOpen } as Parameters<typeof useAdminUi.setState>[0])
    useAdminUi.getState().closeSiteExport()
  })
})
