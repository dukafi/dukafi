/**
 * Framework icons — store action.
 */
import { resolveIconPresets } from '@core/framework'
import type { FrameworkIconsSettings } from '@core/framework-schema'
import type { SiteSlice, SiteSliceHelpers } from '@site/store/slices/site/types'

type FrameworkIconActions = Pick<SiteSlice, 'updateFrameworkIcons'>

export function createFrameworkIconActions(
  helpers: SiteSliceHelpers,
): FrameworkIconActions {
  return {
    updateFrameworkIcons(patch) {
      helpers.mutateSite((draft) => {
        if (!draft.settings.framework) {
          draft.settings.framework = { colors: { tokens: [] } }
        }
        const framework = draft.settings.framework
        framework.icons = { ...resolveIconPresets(framework.icons), ...patch }
        return true
      }, { coalesceKey: 'framework-icons' })
    },
  }
}
