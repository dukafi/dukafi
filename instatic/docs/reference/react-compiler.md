# React Compiler and memoization

The **React Compiler is enabled** for the whole app (`babel({ presets: [reactCompilerPreset()] })` in `vite.config.ts`). It auto-memoizes every component and hook at build time, so hand-written memoization is **noise** — it adds clutter without improving performance.

---

## TL;DR

- Don't write `useMemo`, `useCallback`, or `memo()` — the compiler handles it.
- Three exceptions exist (dep-array functions, hot-list `React.memo`, lint escape hatches); add a comment on each.
- **Enforcement gate:** `eslint-plugin-react-compiler` in `bun run lint` / CI.
- `react-doctor` surfaces violations as **warnings** only (`react-doctor.config.json`); it cannot distinguish the three legitimate exceptions.

## The rule

- **No `useMemo`, no `useCallback`, no `memo()`.** Write the plain value, the plain function, the plain component — the compiler memoizes them for you. New code must not introduce manual memoization, and existing manual memoization is being removed.
- **`useState(() => …)` lazy initializers and `useRef(…)` are NOT memoization** — always fine, unaffected by this rule.

## The three exceptions

Memoization legitimately stays in exactly three cases. **Keep it, and add a one-line comment saying why** so the next reader (and the linters) know it's deliberate.

1. **The value/function is referenced in a hook dependency array.** The static `react-hooks/exhaustive-deps` rule can't see the compiler's runtime memoization, so it still demands a stable identity for anything in a `useEffect`/`useMemo`/`useCallback` dep array. Wrapping a *function* used as a dep in `useCallback` (plus the transitive closure it depends on) is required to keep `bun run lint` clean. Only **functions** trip the rule — a plain value feeding a dep array can be inlined.

2. **A `React.memo` re-render bailout on a hot, list-rendered component** (e.g. a recursive per-node canvas/tree renderer rendered O(N) times). `React.memo` skips re-rendering on equal props — a *different* mechanism from the compiler's within-component memoization — so dropping it on an O(N) critical path is not behavior-preserving without runtime perf validation. Rare; justify in a comment. Examples: `NodeRenderer`, `DomPanel/TreeNode`, `AgentPanel`'s `MessageBubble`/`MarkdownTextBubble`.

3. **A lint escape hatch the compiler/linters force.** Two sub-cases:
   - **`react-hooks/refs`**: a render-scoped event handler that reads/writes a ref (`someRef.current = …`) trips "Cannot access refs during render" when written as a bare function, because the linter can't tell the closure only runs at event time. Wrapping it in `useCallback` satisfies the rule. (See `CanvasLiveSurface`'s pointer handlers.)
   - **Compiler bail-out**: when the compiler genuinely cannot compile a function, add the `"use no memo"` directive (or the existing `eslint-disable react-compiler/react-compiler` pattern) and keep the manual memoization it needs.

## The gate

Enforcement is **`eslint-plugin-react-compiler` + `eslint-plugin-react-hooks`**, run in `bun run lint` / CI — that is the authoritative gate:

- `eslint-plugin-react-compiler` flags functions the compiler had to bail out on.
- `react-hooks/exhaustive-deps` and `react-hooks/refs` enforce exceptions (1) and (3).

`react-doctor`'s `react-compiler-no-manual-memoization` rule *also* flags manual memoization, but it cannot recognize the three exceptions above, so it false-positives on them. It is therefore configured as an **advisory warning** (`react-doctor.config.json`), not an error gate — it surfaces genuinely-gratuitous memoization on new code without blocking on the legitimate exceptions. Treat a new `useMemo`/`useCallback`/`memo()` outside the three exceptions as drift and remove it.

---

## Related

- `CLAUDE.md` → "React Compiler and memoization" — the rule summary with direct agent instructions
- `vite.config.ts` — compiler setup (`reactCompilerPreset`)
- `eslint.config.js` — `eslint-plugin-react-compiler` and `react-hooks` configuration
- `react-doctor.config.json` — advisory downgrade for `react-compiler-no-manual-memoization`
