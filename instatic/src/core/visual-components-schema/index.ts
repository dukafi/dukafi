/**
 * Visual Components schema/type leaf.
 *
 * Import this from lower-level core modules that only need the persisted Visual
 * Component shapes. The broad `@core/visualComponents` barrel also exports
 * instantiation, slot-sync, deletion-impact, and virtual-page behavior.
 */

export {
  VCNodeSchema,
  VisualComponentSchema,
  parseVisualComponent,
} from '../visualComponents/schemas'
export type {
  VCNode,
  VCParam,
  VCParamType,
  VisualComponent,
} from '../visualComponents/schemas'
