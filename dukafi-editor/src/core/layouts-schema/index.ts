/**
 * Saved-layout schema/type leaf.
 *
 * Keeps persisted layout shapes available to the page-tree shell without
 * importing the broad `@core/layouts` barrel back into the page-tree graph.
 */

export {
  SavedLayoutSchema,
  layoutNameError,
  layoutSlugFromName,
  parseSavedLayout,
} from '../layouts/schemas'
export type { SavedLayout } from '../layouts/schemas'
