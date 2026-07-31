/**
 * Server-side catalog derivations for the site agent.
 *
 * Document reads live in `@core/ai` so the browser executor and server tests
 * share the same annotated HTML + compact CSS surface.
 */

import { registry } from '@core/module-engine'
import type {
  AnyModuleDefinition,
  PropertyControl,
  PropertySchema,
} from '@core/module-engine'
import { describeFrameworkTokens } from '@core/framework'
import { describeFontTokens } from '@core/fonts'
import type { SiteDocument } from '@core/page-tree'
import type { ModuleInfo, ModulePropInfo, ModuleStyleInfo, SnapshotTokens } from './snapshot'

/** A single token family name within `SnapshotTokens`. */
export type TokenFamily = keyof SnapshotTokens

// ---------------------------------------------------------------------------
// Catalog derivations — the module/token surface the agent's catalog tools
// (`list_modules`, `list_tokens`) return. Sourced from the server registry +
// the posted site, replacing the old browser-flattened snapshot fields.
// ---------------------------------------------------------------------------

/** Describe every insertable module from the registry (excludes `base.body`). */
export function describeAgentModules(): ModuleInfo[] {
  return registry
    .list()
    .filter((mod) => mod.id !== 'base.body')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(moduleDefinitionToModuleInfo)
}

/** Describe the site's design tokens (framework colors/typography/spacing + fonts). */
export function describeAgentTokens(site: SiteDocument): SnapshotTokens {
  return {
    ...describeFrameworkTokens(site.settings.framework),
    fonts: describeFontTokens(site.settings.fonts),
  }
}

/**
 * Narrow a token digest to one family, leaving the others empty so the shape
 * stays stable. Returns the full digest when no family is given.
 */
export function filterTokenFamily(tokens: SnapshotTokens, family?: TokenFamily): SnapshotTokens {
  if (!family) return tokens
  return {
    colors: family === 'colors' ? tokens.colors : [],
    typography: family === 'typography' ? tokens.typography : [],
    spacing: family === 'spacing' ? tokens.spacing : [],
    fonts: family === 'fonts' ? tokens.fonts : [],
  }
}

function moduleDefinitionToModuleInfo(mod: AnyModuleDefinition): ModuleInfo {
  return {
    id: mod.id,
    name: mod.name,
    description: mod.description,
    category: mod.category,
    canHaveChildren: mod.canHaveChildren,
    defaults: toSerializableRecord(mod.defaults ?? {}),
    props: schemaToModuleProps(mod.schema, mod.defaults ?? {}),
    styles: genericStyleHintsForModule(mod),
  }
}

function genericStyleHintsForModule(mod: AnyModuleDefinition): ModuleStyleInfo[] {
  if (mod.id === 'base.text' || mod.category.toLowerCase() === 'typography') {
    return [
      { key: 'fontFamily', type: 'text', label: 'Font family', defaultValue: 'inherit', cssProperties: ['fontFamily'] },
      { key: 'fontSize', type: 'text', label: 'Font size', defaultValue: '16px', cssProperties: ['fontSize'] },
      { key: 'fontWeight', type: 'select', label: 'Font weight', defaultValue: '400', cssProperties: ['fontWeight'], options: [
        { label: 'Regular', value: '400' },
        { label: 'Medium', value: '500' },
        { label: 'Semi bold', value: '600' },
        { label: 'Bold', value: '700' },
        { label: 'Black', value: '900' },
      ] },
      { key: 'lineHeight', type: 'text', label: 'Line height', defaultValue: '1.4', cssProperties: ['lineHeight'] },
      { key: 'letterSpacing', type: 'text', label: 'Letter spacing', defaultValue: '0px', cssProperties: ['letterSpacing'] },
      { key: 'color', type: 'color', label: 'Text color', defaultValue: 'inherit', cssProperties: ['color'] },
      { key: 'textAlign', type: 'select', label: 'Text align', defaultValue: 'left', cssProperties: ['textAlign'], options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
        { label: 'Justify', value: 'justify' },
      ] },
      { key: 'marginBottom', type: 'text', label: 'Bottom margin', defaultValue: '0px', cssProperties: ['marginBottom'] },
    ]
  }

  return []
}

function schemaToModuleProps(
  schema: PropertySchema,
  defaults: Record<string, unknown>,
): ModulePropInfo[] {
  const props: ModulePropInfo[] = []

  for (const [key, control] of Object.entries(schema)) {
    if (control.type === 'group') {
      props.push(...schemaToModuleProps(control.children, defaults))
      continue
    }
    props.push(controlToModuleProp(key, control, defaults[key]))
  }

  return props
}

function controlToModuleProp(
  key: string,
  control: Exclude<PropertyControl, { type: 'group' }>,
  defaultValue: unknown,
): ModulePropInfo {
  const prop: ModulePropInfo = {
    key,
    type: control.type,
    label: control.label,
    description: control.description,
    defaultValue: toSerializableValue(defaultValue),
  }

  if (control.breakpointOverridable === true) {
    prop.breakpointOverridable = true
  }

  if (control.type === 'select') {
    prop.options = control.options.map((option) => ({
      label: option.label,
      value: toSerializableValue(option.value),
    }))
  }

  return prop
}

function toSerializableRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    result[key] = toSerializableValue(value)
  }
  return result
}

function toSerializableValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) return value.map(toSerializableValue)

  if (typeof value === 'object' && value) {
    const result: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toSerializableValue(nestedValue)
    }
    return result
  }

  return String(value)
}
