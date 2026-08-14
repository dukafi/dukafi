/**
 * Shared async-load shape for workspace hooks that expose a single
 * loading flag + error string. Hooks with two independent fetches
 * (e.g. useDataWorkspace) are intentional exceptions — they keep
 * their granular fields instead of extending this type.
 */
export interface WorkspaceLoadState {
  loading: boolean
  error: string | null
}
