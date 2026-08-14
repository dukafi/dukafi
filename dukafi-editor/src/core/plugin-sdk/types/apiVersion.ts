/**
 * Current host plugin-API version. A plugin manifest declares the API version
 * it was authored against; the host accepts any plugin whose `apiVersion` is
 * within `[MIN_SUPPORTED_PLUGIN_API_VERSION, PLUGIN_API_VERSION]`.
 *
 * Bumping policy:
 *  - `PLUGIN_API_VERSION` is bumped on any breaking change to the SDK shape
 *    (lifecycle, capability set, types).
 *  - `MIN_SUPPORTED_PLUGIN_API_VERSION` is bumped on a major host release
 *    that drops support for older plugins. Set both to N if you want to
 *    require every plugin to be re-released against version N.
 *  - Always equal to the literal accepted at the manifest boundary; tests
 *    enforce this so the schema doesn't drift from the type.
 *
 * Plugins SHOULD declare `apiVersion` explicitly; `definePlugin` defaults to
 * the current host version when omitted.
 */
export const PLUGIN_API_VERSION = 1
export const MIN_SUPPORTED_PLUGIN_API_VERSION = 1
export type PluginApiVersion = number

/**
 * Decide whether a manifest's `apiVersion` is compatible with this host. The
 * manifest validator wires this in so the rejection happens at the ingress
 * boundary (zip read / JSON install) before any side effect.
 */
export function isCompatiblePluginApiVersion(version: number): boolean {
  return (
    Number.isInteger(version) &&
    version >= MIN_SUPPORTED_PLUGIN_API_VERSION &&
    version <= PLUGIN_API_VERSION
  )
}
