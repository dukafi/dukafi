/**
 * Package-name validation shared by dependency UI, module manifests, and export.
 * Keeps package manifest writes data-only and safe for the future bridge layer.
 */

const SAFE_PACKAGE_NAME =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export function isSafePackageName(name: string): boolean {
  return SAFE_PACKAGE_NAME.test(name)
}
