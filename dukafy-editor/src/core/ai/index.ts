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
