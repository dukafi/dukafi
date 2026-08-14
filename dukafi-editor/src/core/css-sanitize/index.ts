// Public API for the CSS-value sanitiser leaf.
//
// A dependency-free module owning the single canonical `sanitiseCssValue`.
// Both `@core/publisher` (which re-exports it) and `@core/framework` import from
// here, so the function has one home and the module graph stays one-directional
// (the framework engine can't import the publisher barrel — that would cycle).

export { sanitiseCssValue } from './sanitiseCssValue'
