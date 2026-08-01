# Error Boundaries

Cookbook for `<ErrorBoundary>` placements and error reporting in the admin app. Where boundaries live, what `location` tags to use, and how to add a new one.

The codebase uses **one** error boundary primitive — `src/ui/components/ErrorBoundary/`. Every architectural seam where a render-time failure could blank a tree the user expects to be independent wraps with it. The `error-boundary-coverage.test.ts` gate enforces the placements.

---

## TL;DR

- Primitive: `<ErrorBoundary location="...">` from `@ui/components/ErrorBoundary`.
- Required placements (gated): admin shell, per-route, canvas, per-node renderer, plugin page, plugin editor panel, plugin canvas overlay.
- React 19 root callbacks (`onCaughtError`, `onUncaughtError`, `onRecoverableError`) wired in `src/admin/main.tsx`.
- Caught errors log with `[<module>]` prefix; uncaught ones additionally show a toast.
- `flattenErrorChain(err)` walks `error.cause` so domain-typed errors surface their full provenance.

---

## The primitive

`src/ui/components/ErrorBoundary/ErrorBoundary.tsx`:

```tsx
interface ErrorBoundaryProps {
  /** Unique location tag — appears in logs and the dev fallback */
  location:    string
  /** Optional values that, when changed, reset the boundary */
  resetKeys?:  unknown[]
  /** Optional custom fallback */
  fallback?:   (info: ErrorBoundaryFallbackInfo) => ReactNode
  children:    ReactNode
}

<ErrorBoundary location="my-feature" resetKeys={[someKey]}>
  <MyFeature />
</ErrorBoundary>
```

When the boundary catches an error:

1. It calls `logErrorChain('[my-feature]', flattenErrorChain(err), info.componentStack)`.
2. It surfaces a `pushToast({ kind: 'error', title: ..., body: ..., location: 'my-feature' })`.
3. It renders the fallback (or the default — "Something broke in this view. Try refreshing.").

When `resetKeys` change, the boundary resets — useful for per-route boundaries that should clear when the route changes.

---

## Required placements

Gated by `src/__tests__/architecture/error-boundary-coverage.test.ts`. The gate scans for the literal `location="..."` strings; renaming a tag or removing a placement fails the build.

### 1. `admin-shell` — last-resort, full-page

`src/admin/main.tsx`:

```tsx
<ErrorBoundary location="admin-shell">
  <Router>
    <AdminRoutes />
  </Router>
</ErrorBoundary>
```

Catches anything not handled by inner boundaries. The fallback is a plain "Something went wrong" full-page surface — at this level, navigation may be unsafe, so the user reloads.

### 2. `admin-route` — per-section

`src/admin/router.tsx`:

```tsx
function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary location="admin-route" resetKeys={[pathname]}>
      {children}
    </ErrorBoundary>
  )
}
```

Wraps every `<Route>`. `resetKeys={[pathname]}` means navigating away from a broken route clears the error — the user isn't stuck on the broken page forever.

### 3. `canvas` — editor canvas transform layer

`src/admin/pages/site/canvas/CanvasRoot.tsx`:

```tsx
<ErrorBoundary location="canvas">
  <CanvasTransformLayer>...</CanvasTransformLayer>
</ErrorBoundary>
```

A bad render inside the canvas (e.g. a module render throws) doesn't break the editor chrome. The user can switch to a different page, fix the bad node in the DOM panel, or reload.

### 4. `node-renderer` — per-module isolation

`src/admin/pages/site/canvas/NodeRenderer.tsx`:

```tsx
<ErrorBoundary location="node-renderer">
  <ModuleRender ... />
</ErrorBoundary>
```

A single broken module renders an error placeholder; sibling nodes render fine. Essential for canvas robustness — the editor doesn't crash because one plugin module has a bug.

### 5. `plugin-page` — plugin admin pages

`src/admin/pages/plugins/components/PluginPageRenderer/PluginPageRenderer.tsx`:

```tsx
<ErrorBoundary location="plugin-page">
  <PluginPageMount ... />
</ErrorBoundary>
```

A bad plugin admin page doesn't take down the admin shell — the user sees the error placeholder + a link to disable the plugin.

### 6. `plugin-editor-panel` — plugin editor sidebar panel

`src/admin/pages/site/panels/PluginEditorPanel/PluginEditorPanel.tsx`:

```tsx
<ErrorBoundary location="plugin-editor-panel">
  <PluginPanelMount ... />
</ErrorBoundary>
```

Same idea, scoped to plugin-registered editor panels.

### 7. `plugin-canvas-overlay` — plugin canvas overlay

```tsx
<ErrorBoundary location="plugin-canvas-overlay">
  <PluginOverlay ... />
</ErrorBoundary>
```

For `editor.canvas` permission overlays (annotation pins, custom selection adornments).

---

## React 19 root callbacks

`src/admin/main.tsx` wires the React 19 root-level error callbacks:

```tsx
const root = createRoot(rootElement, {
  onCaughtError: (error, info) => {
    handleRootError('react-root:caught', error, info, null)
  },
  onUncaughtError: (error, info) => {
    handleRootError('react-root:uncaught', error, info, 'Unhandled render error')
  },
  onRecoverableError: (error, info) => {
    handleRootError('react-root:recoverable', error, info, null)
  },
})
```

| Callback           | When it fires                                                    | Toast?      |
|--------------------|------------------------------------------------------------------|-------------|
| `onCaughtError`    | After an `<ErrorBoundary>` catches                               | No (the boundary already toasted) |
| `onUncaughtError`  | No boundary caught — the whole tree is broken                    | Yes — loud  |
| `onRecoverableError`| React recovered (e.g. failed hydration → client render)         | No (logged) |

`handleRootError` walks the error.cause chain via `flattenErrorChain`, logs the whole chain, and (if asked) pushes a toast.

---

## Error reporting helpers

`src/ui/components/ErrorBoundary/errorReporting.ts`:

```ts
flattenErrorChain(input)            → ErrorChainEntry[]
logErrorChain(prefix, chain, info?) → void
formatErrorReport(chain, info?)     → string
```

### `flattenErrorChain`

Walks `error.cause` recursively, collecting each link as `{ name, message, stack }`. Handles cycles defensively (won't loop forever on a malformed chain).

### `logErrorChain`

Calls `console.error` with a `[prefix]` tag, the full chain, and the React component stack. Used by every error boundary's `componentDidCatch`.

### `formatErrorReport`

Returns a human-readable string of the chain — used in the dev fallback UI and in copy-to-clipboard affordances.

---

## Cookbook

### Add a new error boundary

1. Pick a unique `location` tag — kebab-case, namespaced by feature (`my-feature-something`).
2. Wrap the seam:
   ```tsx
   <ErrorBoundary location="my-feature">
     <MyFeature />
   </ErrorBoundary>
   ```
3. If the boundary is at one of the gated seams, update `error-boundary-coverage.test.ts`'s `REQUIRED_BOUNDARIES` array to include the new placement. Otherwise it's not gated (free placement).
4. The boundary auto-logs and auto-toasts on catch.

### Reset on navigation

```tsx
const { pathname } = useLocation()
<ErrorBoundary location="my-route" resetKeys={[pathname]}>
  <RouteContent />
</ErrorBoundary>
```

Any change to `resetKeys` resets the boundary's internal error state. Use it for per-route boundaries, per-id surfaces (a workspace selector that needs to reset when the user picks a new item), etc.

### Custom fallback

```tsx
<ErrorBoundary
  location="my-feature"
  fallback={({ error, reset, componentStack }) => (
    <div role="alert">
      <h2>This panel didn't load</h2>
      <p>{error.message}</p>
      <Button variant="primary" onClick={reset}>Retry</Button>
    </div>
  )}
>
  <MyFeature />
</ErrorBoundary>
```

The default fallback is fine for most cases — only customize when the surface really needs something specific (e.g. a plugin page that should offer "Disable plugin" as a recovery action).

### Throw a typed error inside a boundary

```ts
throw new SiteValidationError('Page tree node has invalid shape', { path: ['nodes', nodeId] })
```

The boundary catches it like any error. The chain includes the typed class name (`SiteValidationError`) and the path field via the `formatErrorReport` helper.

### Async error inside a component (boundaries don't catch these)

React error boundaries **don't** catch errors thrown in async event handlers / `setTimeout` / promise rejections. For those:

```tsx
const handler = useCallback(async () => {
  try {
    await doSomethingThatMightFail()
  } catch (err) {
    console.error('[my-feature] save failed:', err)
    pushToast({ kind: 'error', title: 'Save failed', body: getErrorMessage(err, 'Save failed') })
    setError(err)
  }
}, [])
```

Pattern: `try/catch` in async handlers, log with `[<module>]` prefix, surface via toast + component state. See [docs/reference/typebox-patterns.md](typebox-patterns.md) and CLAUDE.md's "Error handling" rules.

### Use the error boundary's fallback to hide a feature

```tsx
<ErrorBoundary location="optional-feature" fallback={() => null}>
  <OptionalFeature />
</ErrorBoundary>
```

If the optional feature throws, render nothing. The error still logs (for diagnostics) but the user doesn't see anything.

---

## Logging conventions

| Source         | Prefix                                                  |
|----------------|---------------------------------------------------------|
| Error boundary | `[<location>]`, e.g. `[admin-route]`, `[canvas]`        |
| React root     | `[react-root:caught]`, `[react-root:uncaught]`, `[react-root:recoverable]` |
| Async handler  | `[<module>] <description>:`, e.g. `[toolbar] Manual save failed:` |
| Plugin worker  | `[plugin:<pluginId>]`, e.g. `[plugin:acme.workflow]`    |
| Server         | `[<module>]`, e.g. `[router]`, `[server]`, `[plugin-host]` |

The square-bracket prefix is **load-bearing** — log scrapers in production filter on it. Don't drop it.

---

## Forbidden patterns

| Pattern                                                              | Use instead                                              |
|----------------------------------------------------------------------|----------------------------------------------------------|
| Inventing a new error-boundary primitive                             | One primitive — `@ui/components/ErrorBoundary`           |
| Multiple boundaries with the same `location` value                   | Each location must be unique (gated)                     |
| Removing a gated boundary placement                                  | Update the gate at the same time, with reason            |
| `catch (err) {}` (silently swallowing in async)                      | Name it `catch (_err)` with a comment, or handle it      |
| `console.log` for errors                                             | `console.error` with `[<module>]` prefix                 |
| Throwing without a useful message                                     | Include the path / context (`'failed to load page X'`)   |
| Re-throwing without `cause`                                          | `throw new Error('wrapped', { cause: err })` preserves the chain |
| Using `error.message` directly without `instanceof Error` check      | `getErrorMessage(err, 'Unknown error')` from `@core/utils/errorMessage`   |
| Using `alert(error.message)`                                          | `pushToast` or the error boundary fallback               |

---

## Related

- [docs/architecture.md](../architecture.md) — system layer overview
- [docs/editor.md](../editor.md) — boundaries inside the editor (canvas, node-renderer)
- [docs/features/plugin-system.md](../features/plugin-system.md) — plugin-page / plugin-editor-panel / plugin-canvas-overlay boundaries
- [docs/reference/typebox-patterns.md](typebox-patterns.md) — async error handling patterns
- [docs/reference/ui-primitives.md](ui-primitives.md) — `Toast` for surfacing errors
- Source-of-truth files:
  - `src/ui/components/ErrorBoundary/ErrorBoundary.tsx` — the primitive
  - `src/ui/components/ErrorBoundary/errorReporting.ts` — chain + log helpers
  - `src/admin/main.tsx` — React root callbacks + outermost boundary
  - `src/admin/router.tsx` — `RouteBoundary` per route
  - `src/core/utils/errorMessage.ts` — `getErrorMessage` utility
- Gate tests:
  - `src/__tests__/architecture/error-boundary-coverage.test.ts`
