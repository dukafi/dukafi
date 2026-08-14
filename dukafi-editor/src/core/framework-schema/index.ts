/**
 * Public barrel for the Framework data schemas.
 *
 * These TypeBox schemas + derived types describe the *persisted* framework
 * token settings (a branch of `SiteSettings`) and generated-class metadata
 * (attached to `StyleRule`). They are a pure leaf — no dependency on the
 * framework engine (`@core/framework`) or the page tree (`@core/page-tree`).
 *
 * Both the framework engine and the page-tree site-document model depend on
 * this module, which keeps the engine⇄page-tree relationship one-directional
 * (engine → page-tree) instead of cyclic.
 *
 * Everything outside `src/core/framework-schema/` imports from
 * `@core/framework-schema`. Internal files import each other via relative paths.
 */

export * from './schemas'
