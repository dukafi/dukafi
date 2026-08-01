/**
 * Data scope — search data tables via dataProvider.
 *
 * Phase 3: wires the live server-backed data provider plus static commands
 * for creating tables and fields.
 */

import type { Scope, Command } from '../types'
import { dataProvider } from '../providers/dataProvider'

function getDataScopeCommands(): Command[] {
  return [
    {
      id: 'data.newTable',
      title: 'New table…',
      subtitle: 'Create a new data table',
      group: 'data',
      iconName: 'table-solid',
      keywords: ['new', 'create', 'table', 'database'],
      workspaces: ['data'],
      run: (ctx) => {
        ctx.closeSpotlight()
        ctx.navigate('/admin/data?action=newTable')
      },
    },
    {
      id: 'data.newField',
      title: 'New field in current table…',
      subtitle: 'Add a field to the currently open table',
      group: 'data',
      iconName: 'plus-circle-solid',
      keywords: ['new', 'create', 'field', 'column', 'attribute'],
      workspaces: ['data'],
      run: (ctx) => {
        ctx.closeSpotlight()
        ctx.navigate('/admin/data?action=newField')
      },
    },
  ]
}

export const dataScope: Scope = {
  id: 'data',
  title: 'Open table',
  placeholder: 'Search tables…',
  commands: getDataScopeCommands,
  providers: [dataProvider],
}
