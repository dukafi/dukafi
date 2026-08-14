/**
 * Module-level DataMeta cache for DynamicBindingControl.
 *
 * Lives in a separate `.ts` file so `DynamicBindingControl.tsx` can remain a
 * pure component file (required for React Fast Refresh to work correctly).
 *
 * `clearDataMetaCache` is exported for test isolation; import it from this
 * module directly — do not re-export it from the `.tsx` component file.
 *
 * Dukafi has NO generic `data_tables`/`data_rows` system — products,
 * variants and collections are first-class entities instead (see
 * `commerceEntry.ts`). `GET /admin/api/cms/data/_meta` therefore does not
 * exist on the Ruby side and never will, so a failed fetch is treated as
 * "there are no tables", not as an error. Surfacing it turned "Insert data
 * token" into a dead end reading "Could not load tables" — for a backend the
 * product deliberately does not have.
 */

import type { DataMeta } from '@core/data/schemas'
import { getDataMeta } from '@core/persistence/cmsData'

export let _cachedMeta: DataMeta | null = null
let _metaPromise: Promise<DataMeta> | null = null

/** @internal - for test use only */
export function clearDataMetaCache(): void {
  _cachedMeta = null
  _metaPromise = null
}

export function loadDataMeta(): Promise<DataMeta> {
  if (_cachedMeta) return Promise.resolve(_cachedMeta)
  if (_metaPromise) return _metaPromise
  _metaPromise = getDataMeta()
    .then((m) => {
      _cachedMeta = m
      _metaPromise = null
      return m
    })
    .catch(() => {
      // No tables endpoint (Dukafi) or a transient failure — either way the
      // picker's other scopes (commerce entities, page/site/route/cart) are
      // unaffected and must still render.
      const empty: DataMeta = { tables: [] }
      _cachedMeta = empty
      _metaPromise = null
      return empty
    })
  return _metaPromise
}
