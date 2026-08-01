/**
 * Resolve plugin-build / plugin-dev configuration without an explicit
 * `instatic-plugin login` step. The dev workflow is filesystem-direct — the CLI
 * writes built plugin files into the running CMS's `uploads/plugins/<id>/<version>/`
 * directory, and the host's server module loader picks the changes up
 * automatically via the `?v=Date.now()` cache buster on its dynamic import.
 *
 * That means the only thing the CLI needs to know is *where the host's
 * uploads directory lives*. Resolution order, highest-priority first:
 *
 *   1. CLI flag:   `instatic-plugin dev --uploads <path>`
 *   2. Environment: `INSTATIC_UPLOADS_DIR=<path> instatic-plugin dev`
 *   3. Auto-detect: walk up from the plugin source dir looking for an
 *      `uploads/plugins/` sibling — covers the common case of editing a
 *      first-party plugin inside the instatic monorepo.
 *
 * No login, no API tokens, no env-mode flag. The filesystem is the gate.
 * Whoever can write to `uploads/plugins/` already has the same effective
 * authority as a logged-in admin.
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export interface PluginDevTargets {
  /** Absolute path to the host's uploads directory. */
  uploadsDir: string
  /** Where the resolution came from — useful in CLI logs. */
  source: 'flag' | 'env' | 'auto-detect'
}

class PluginDevConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginDevConfigError'
  }
}

/**
 * Walk up from `pluginDir` looking for a sibling that contains an
 * `uploads/plugins/` directory. Stops at filesystem root.
 */
function autoDetectUploadsDir(pluginDir: string): string | null {
  let current = resolve(pluginDir)
  for (let i = 0; i < 16; i++) {
    const candidate = join(current, 'uploads', 'plugins')
    if (existsSync(candidate)) return join(current, 'uploads')
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

export interface ResolvePluginDevConfigInput {
  pluginDir: string
  uploadsDirFlag?: string
  env?: NodeJS.ProcessEnv
}

export function resolvePluginDevConfig(
  input: ResolvePluginDevConfigInput,
): PluginDevTargets {
  const env = input.env ?? process.env

  if (input.uploadsDirFlag) {
    return {
      uploadsDir: isAbsolute(input.uploadsDirFlag)
        ? input.uploadsDirFlag
        : resolve(input.pluginDir, input.uploadsDirFlag),
      source: 'flag',
    }
  }

  const envUploads = env.INSTATIC_UPLOADS_DIR
  if (envUploads && envUploads.trim()) {
    return {
      uploadsDir: isAbsolute(envUploads)
        ? envUploads
        : resolve(input.pluginDir, envUploads),
      source: 'env',
    }
  }

  const autoDetected = autoDetectUploadsDir(input.pluginDir)
  if (autoDetected) {
    return { uploadsDir: autoDetected, source: 'auto-detect' }
  }

  throw new PluginDevConfigError(
    [
      `Could not locate the host CMS uploads directory.`,
      ``,
      `Provide it explicitly with one of:`,
      `  • --uploads <path>            (CLI flag)`,
      `  • INSTATIC_UPLOADS_DIR=<path>        (environment variable)`,
      ``,
      `…or run \`instatic-plugin dev\` from a plugin folder whose ancestor contains an`,
      `\`uploads/plugins/\` directory (the default for first-party plugins inside`,
      `the instatic monorepo).`,
    ].join('\n'),
  )
}
