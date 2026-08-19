/**
 * The AI edit contract. Barrel — external callers import from `@core/ai`, never
 * from a concrete file underneath it.
 */
export {
  AiEditSchema,
  MAX_EDITS_PER_REPLY,
  extractEditsFromReply,
  parseAiEdits,
  type AiEdit,
} from './editSchema'

export {
  compileBuildPlan,
  matchLibraryAsset,
  parseBuildPlan,
  resolvePlanMedia,
  type BuildPlan,
  type LibraryAsset,
} from './buildPlan'

export {
  applyEditsToTree,
  type EditableSite,
  type EditableTree,
} from './applyEdits'
