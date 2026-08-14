/**
 * Plugin-scoped ID factory.
 *
 *   const ns = createNamespace('acme.ui-kit')
 *   ns.module('callout')   // 'acme.ui-kit.callout'   — for canvas modules
 *   ns.vc('hero')          // 'acme.ui-kit/hero'      — for Visual Components
 *   ns.classRef('section') // 'acme.ui-kit/section'   — for CSS classes
 *
 * The split between `.` (modules) and `/` (Visual Components / classes)
 * mirrors the host's existing storage conventions:
 *   - Module IDs use `.` like `base.text`, `acme.x.callout`
 *   - VC IDs and class IDs use `/` like `acme.x/hero`, `acme.x/btn-primary`
 *
 * Centralising this helper means plugin authors can't drift between the two
 * separator conventions, and a typo in one place doesn't compile.
 */

const SAFE_TAIL = /^[a-z][a-z0-9-]*$/

export interface PluginNamespace {
  /** The plugin id this namespace is scoped to. */
  readonly pluginId: string
  /** Build a canvas-module ID: `<pluginId>.<name>`. */
  module(name: string): string
  /** Build a Visual Component ID: `<pluginId>/<name>`. */
  vc(name: string): string
  /** Build a CSS class ID: `<pluginId>/<name>`. */
  classRef(name: string): string
}

function assertSafeName(kind: string, name: string): void {
  if (typeof name !== 'string' || !SAFE_TAIL.test(name)) {
    throw new Error(
      `[plugin-sdk] ${kind} name "${name}" is invalid. Use lowercase letters, digits, and dashes; must start with a letter.`,
    )
  }
}

export function createNamespace(pluginId: string): PluginNamespace {
  if (!pluginId.includes('.')) {
    throw new Error(
      `[plugin-sdk] Plugin id "${pluginId}" is invalid. IDs must be namespaced as "<vendor>.<name>" (e.g. "acme.ui-kit").`,
    )
  }
  return {
    pluginId,
    module(name) {
      assertSafeName('module', name)
      return `${pluginId}.${name}`
    },
    vc(name) {
      assertSafeName('Visual Component', name)
      return `${pluginId}/${name}`
    },
    classRef(name) {
      assertSafeName('CSS class', name)
      return `${pluginId}/${name}`
    },
  }
}
