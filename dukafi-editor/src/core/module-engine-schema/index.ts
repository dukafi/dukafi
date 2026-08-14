/**
 * Module-engine schema/type leaf.
 *
 * Use this from low-level core modules that only need module definition or
 * property-control shapes. Importing the broad `@core/module-engine` barrel also
 * pulls registry/runtime helpers into the dependency graph.
 */

export type {
  AnyModuleDefinition,
  IModuleRegistry,
  InlineEditBinding,
  ModuleComponentProps,
  ModuleDefinition,
  ModuleDependencies,
  NodeWrapperProps,
  RenderOutput,
} from '../module-engine/types'

export type {
  PropertyCondition,
  PropertyControl,
  PropertyControlLayout,
  PropertySchema,
  TextControlNormalize,
} from '../module-engine/propertySchema'

export {
  PropertyControlSchema,
  PropertySchemaSchema,
  resolvePropertyControlCategory,
} from '../module-engine/propertySchema'

export { resolveHtmlTagBadge } from '../module-engine/htmlTagBadge'
