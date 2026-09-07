/** Framework form-field defaults — store action. */
import { resolveInputPresets } from '@core/framework'
import type { SiteSlice, SiteSliceHelpers } from '@site/store/slices/site/types'

type FrameworkInputActions = Pick<SiteSlice, 'updateFrameworkInputs'>

export function createFrameworkInputActions(helpers: SiteSliceHelpers): FrameworkInputActions {
  return {
    updateFrameworkInputs(patch) {
      helpers.mutateSite((draft) => {
        if (!draft.settings.framework) draft.settings.framework = { colors: { tokens: [] } }
        const framework = draft.settings.framework
        framework.inputs = { ...resolveInputPresets(framework.inputs), ...patch }
        return true
      }, { coalesceKey: 'framework-inputs' })
    },
  }
}
