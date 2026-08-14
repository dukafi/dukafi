# Instatic User E2E Protocol

## Purpose

This protocol covers real user-facing testing by an agent with full browser control and disposable local data. It complements the existing Bun tests by exercising complete workflows as a person would: reading labels, clicking visible controls, waiting for feedback, noticing friction, and checking the published result.

The goal is not only "does it pass?" The goal is to find product problems before users do.

## Operating Principles

1. Browser evidence comes first.
   The agent uses the UI as the source of truth. Code, database, API, and localStorage inspection are allowed only for reset, unblock, or post-finding triage.

2. Use disposable data.
   Prefer a dedicated SQLite database and uploads directory per run. Never wipe production-looking data.

3. Test goals, not implementation details.
   Scenario rows describe what a user is trying to accomplish. They should not depend on component names, store actions, internal IDs, or implementation structure.

4. Log friction.
   A completed flow can still be a product defect if it is confusing, mislabeled, visually broken, slow, or missing feedback.

5. Keep findings actionable.
   Every issue should include repro steps, expected behavior, actual behavior, severity, category, scenario ID, and evidence.

6. Separate audit from fix.
   In audit mode, record issues first. Fixing can happen in a follow-up pass so the run log remains a clean description of what a user experienced.

## Default Environment

Use the local development stack unless the user names another target:

```sh
DATABASE_URL=sqlite:./.tmp/e2e-agent.db \
UPLOADS_DIR=./.tmp/e2e-uploads \
bun run dev
```

Default URLs:

- Admin UI: `http://localhost:5173/admin`
- CMS server: `http://localhost:3001`
- Public site: `http://localhost:3001/`

Before destructive reset, confirm the target is disposable:

| Target | Reset Allowed By Default |
|---|---:|
| `.tmp/e2e-*` | Yes |
| `.tmp/dev.db` | Yes |
| `.tmp/e2e-uploads` | Yes |
| `uploads/` | No, unless the run explicitly owns it |
| Postgres URL | No, unless explicitly provided for this run |
| Any non-local URL | No |

## Run Lifecycle

1. **Select scope**
   Choose rows from `docs/e2e/feature-matrix.md`. If unspecified, use the Core Owner Lifecycle: setup, login, edit, save, publish, and public view.

2. **Record starting state**
   Capture branch, HEAD SHA, dirty worktree note, app URL, browser, viewport, database URL, and uploads directory.

3. **Reset data**
   Remove only the run-owned SQLite database and upload directory. Do not reset the git worktree.

4. **Start app**
   Start `bun run dev` with the run-owned environment, or document the existing server being used.

5. **Execute as a user**
   Use browser snapshots and screenshots. Interact through visible UI, labels, keyboard, menus, panels, dialogs, and links.

6. **Observe after every state change**
   Re-snapshot or screenshot after navigation, saves, modal opens/closes, publish, reloads, and viewport changes.

7. **Log results**
   Write a run log in `docs/e2e/runs/YYYY-MM-DD-<scope>.md` using `docs/e2e/run-log-template.md`.

8. **Triage only after logging**
   If an issue needs diagnosis, inspect code or data after the issue entry exists.

9. **Summarize**
   End with scenario totals, top issues by severity, blockers, product questions, and recommended next pass.

## Screenshot Proof Trail

Capture screenshots during autonomous runs so the user can audit what happened without watching every click.

Minimum screenshot points for the Core Owner Lifecycle:

| Moment | Purpose |
|---|---|
| First loaded admin/setup screen | Proves the run started from the expected state. |
| Completed setup or logged-in landing state | Proves authentication/setup succeeded. |
| Editor before the main edit | Establishes baseline UI state. |
| Editor after each major user-visible edit | Proves the intended change appeared in the UI. |
| Save/reload result | Proves persistence from the user's perspective. |
| Publish feedback | Proves the publish flow completed or failed visibly. |
| Public page after publish | Proves visitor-facing output. |
| Any bug, friction, visual issue, or confusing state | Provides evidence for the finding. |

Store screenshot paths or inline image references in the run log. Prefer screenshots for visual/layout claims and browser snapshots for control discovery or text/state claims.

## Result Values

| Result | Meaning |
|---|---|
| Pass | User goal completed cleanly. |
| Pass with friction | Goal completed, but the experience had meaningful friction. |
| Fail | User goal did not complete. |
| Blocked | The scenario could not proceed because of an environment or upstream blocker. |
| Needs retest | A fix landed or the result was inconclusive. |
| Product question | Behavior may be intentional but needs a product decision. |

## Severity

| Severity | Meaning |
|---|---|
| P0 | Data loss, security exposure, or app-wide unusability. |
| P1 | Blocks a core user journey. |
| P2 | User-visible defect or serious friction with a workaround. |
| P3 | Polish, wording, low-risk visual issue, or minor friction. |

## Categories

- Bug
- UX friction
- Wrong or missing label
- Accessibility
- Visual/layout
- Performance
- Data loss or risky action
- Draft/public mismatch
- Missing feedback/state
- Product question

## Evidence Standards

Strong evidence includes:

- Screenshot path or browser-displayed image.
- Current URL.
- Viewport size.
- Exact visible copy.
- Repro steps from a clean state.
- Console or network error only when it helps explain user-visible behavior.

Avoid evidence that only proves internals. A database row is not enough to pass a user-facing scenario.

## Retest Protocol

For a retest pass:

1. Start from the issue ID and original scenario.
2. Re-run the minimal repro first.
3. If fixed, run the surrounding happy path once.
4. Mark the issue as `Closed` or `Still open` in the new run log.
5. Do not edit old run logs except to add a short backlink to the retest, if useful.

## Promotion To Automated Tests

Promote a scenario into scripted automation only when:

- It is stable and critical.
- Expected behavior is unambiguous.
- The value is regression detection, not product judgment.
- The test can use durable user-visible selectors or accessible names.

Promoted scenarios live in `tests/e2e/` as `*.e2e.ts` files and run with
`bun run test:e2e`. Keep each spec focused on one durable user journey, with
explicit saves, fresh/disposable data, and visitor-page checks when publishing
behavior is in scope.

Good candidates:

- Fresh setup creates an owner and reaches the editor.
- Login/logout works.
- Publish updates a public page.
- Draft changes do not leak before publish.

Poor candidates:

- "Does this label feel clear?"
- Exploratory layout review.
- Broad visual polish audits.
- Workflows whose UI is actively changing daily.
