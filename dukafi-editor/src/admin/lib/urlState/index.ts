/**
 * Shared URL-state primitives — make an admin workspace's current selection
 * directly linkable through the query string. Used by the Site editor, the
 * Content workspace, and the Data workspace.
 */
export { useInitialQueryParams, useUrlQuerySync } from './urlState'
