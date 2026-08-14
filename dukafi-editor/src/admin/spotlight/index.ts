/**
 * spotlight — public module exports.
 *
 * Import from '@admin/spotlight' to mount the global ⌘K palette via
 * <SpotlightRoot>. Everything else (hooks, types, the keybindings registry)
 * is consumed via direct module paths inside the spotlight feature, not
 * through this barrel.
 *
 * The heavy dialog chunk (Spotlight.tsx, SpotlightResults.tsx, …) is
 * lazy-loaded on first ⌘K press via React.lazy inside SpotlightRoot.
 */

export { SpotlightRoot } from './SpotlightRoot'
