/** Framework button defaults — store action. */
import { resolveButtonPresets } from '@core/framework'
import type { SiteSlice, SiteSliceHelpers } from '@site/store/slices/site/types'

type FrameworkButtonActions = Pick<SiteSlice, 'updateFrameworkButtons'>

export function createFrameworkButtonActions(helpers: SiteSliceHelpers): FrameworkButtonActions {
  return {
    updateFrameworkButtons(patch) {
      helpers.mutateSite((draft) => {
        if (!draft.settings.framework) draft.settings.framework = { colors: { tokens: [] } }
        const framework = draft.settings.framework
        framework.buttons = { ...resolveButtonPresets(framework.buttons), ...patch }
        return true
      }, { coalesceKey: 'framework-buttons' })
    },
  }
}
