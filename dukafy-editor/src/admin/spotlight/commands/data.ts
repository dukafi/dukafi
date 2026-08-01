/**
 * Data workspace commands — §4.9 of the Command Spotlight master plan.
 */

import type { Command } from '../types'
import { queuePendingAction } from '../pendingAction'

export function getDataCommands(): Command[] {
  return [
    // ── New data table ──────────────────────────────────────────────────────
    {
      id: 'data.newTable',
      title: 'New data table…',
      subtitle: 'Create a new structured-data table',
      group: 'data',
      iconName: 'database-solid',
      keywords: ['data', 'table', 'database', 'schema', 'new', 'create', 'add'],
      workspaces: ['any'],
      // Creating a data table always creates a CUSTOM table, gated by
      // `data.custom.tables.manage` (system tables are seeded, never created).
      capability: 'data.custom.tables.manage',
      run: (ctx) => {
        queuePendingAction('data.newTable')
        ctx.navigate('/admin/data')
      },
    },
  ]
}
