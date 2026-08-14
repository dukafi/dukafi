# MCP through the editor — build brief

Status: **designed, not started.** Everything below was settled in discussion;
no code exists yet.

Goal: let a merchant drive their own Dukafy from Cursor, Claude Code or Claude
Desktop — read the site, and edit it — using the tools they already pay for.

---

## Why the bridge, and not a server-side writer

The obvious design is "Ruby owns the pages, so Ruby applies the edits". It does
own them (`pages` table), and **reads really are that simple**. Writes are not:

> `importHtml` is TypeScript-only. Ruby can turn nodes into HTML
> (`RenderPage`); nothing turns HTML into nodes.

That importer is the whole write pipeline — it is what makes "write some HTML"
become editable nodes carrying Tailwind classes in `classIds` and commerce
overlays from `data-dukafy-*`. Reimplementing it in Ruby means two parsers that
must agree forever, which is the exact failure mode that produced the `@font-face`
and `base.svg` bugs this project already paid for.

So writes execute where the parser lives: **the open editor tab**.

Three routes were considered — port the importer to Ruby, run a Bun sidecar, or
bridge to the editor. The bridge wins because the code it needs is already
written, already tested, and already provider-agnostic on purpose.

---

## Shape

```
Cursor / Claude ──HTTP + PAT──▶ Ruby  /admin/api/mcp
                                  │
                 reads ───────────┤  answered directly by Ruby
                                  │    pages, products, orders, form submissions
                                  │
                 writes ──────────┴──NDJSON──▶ open editor tab
                                                 applyAiEdits()
                                                 └── result ──▶ back to Ruby
```

**Reads work with no editor open. Writes need a connected tab.** Expose that in
the UI as a connected / not-connected indicator rather than letting tool calls
hang on nothing listening. Instatic accepted the same constraint.

---

## Pieces

| # | Where | What |
|---|---|---|
| 1 | `db/migrations/` + model | Personal access tokens. Hashed at rest, shown once on creation. |
| 2 | `routes/admin_api.rb` | `r.on("mcp")` speaking MCP over HTTP, authenticated by PAT rather than the admin session cookie. |
| 3 | Ruby | Bridge registry: in-flight tool calls keyed by id, awaiting a result from the tab. |
| 4 | Editor | `useMcpBridge` — holds the NDJSON stream open, executes tool calls, POSTs results. |

### Auth

A **personal access token generated in the admin**, not OAuth. Instatic built
hosted OAuth with S256 PKCE because it was multi-tenant; one Dukafy deploy is
one store with one owner, so a bearer token is the correct primitive and is
perhaps 60 lines against several hundred.

### Tools

Small, because `AiEdit` already is the contract. `core/ai/editSchema.ts` says as
much in its header — *"a macro, a plugin, or a different model later"* — and this
is that. `apply_edits` maps one-for-one onto `applyAiEdits`, which means MCP
writes inherit, for free:

- the same tolerant validation a pasted block gets
- `importHtml`, including `stripUnsafe`
- **one undo step per call** — the merchant can Cmd+Z anything an external
  client did

Read tools worth having on day one: list pages, read page (annotated HTML via
`annotateNodeIds`), list products, list form submissions, and `publish`.

### The raw-fetch exemption already exists

`src/__tests__/architecture/boundary-validation.test.ts` still allowlists
`src/admin/ai/useMcpWorkspaceBridge.ts`, with the justification written out:
long-lived NDJSON streams, `apiRequest` cannot stream a response body, tool
results still go through `apiRequest`. That entry is **stale** — it points at a
file that no longer exists. Building this makes it real again rather than adding
a new exception.

---

## Prior art

`reference/instatic/server/ai/mcp/` — useful for the **transport** only.

Do not copy: its OAuth (multi-tenant, irrelevant here) or its tool count
(35 site tools; we need about six).

---

## Reachability, before designing for remote clients

Cursor and Claude Code run on the merchant's machine and can reach
`localhost:9292` directly — that is the honest v1.

Claude Desktop's custom connectors need a public HTTPS URL, so a merchant on
localhost or behind a home router cannot be reached at all. Treat remote as a
"you already have a domain" feature.

**Lovable is a different category** — it generates React apps rather than
editing an existing store, and its MCP client support was not verified. Check
before designing for it.

---

## Also outstanding

Unrelated to MCP, but live in the same area:

- **Toast region.** Settled design, not built. A fourth `actions.region` value
  plus a `toast` frame (`hasMessage` / `isError` / `message`) reading a
  one-shot flash. `FormFlash` already exists and already does read-and-clear.
  Post/Redirect/Get — just added for form submits — is what makes it necessary:
  the outcome has to survive the redirect.

- **Componentize produces an unpublishable page.** `base.visual-component-ref`
  is not in the Ruby registry, `visualComponents` is not in the persisted site
  shell, and `GET /admin/api/cms/components` is a hardcoded `{ rows: [] }`.
  A component created today is not saved and any page referencing one fails to
  publish. Either build storage + API + publish path, or hide the button.
  The importable-modules gate does not catch this, because the HTML importer
  cannot produce that node.

- **Apostrophes double-escape** in form success messages — `we'll` publishes as
  `we&amp;#39;ll`.

- **Two boundary-validation failures** predate all recent work:
  `dashboard/api.ts` uses raw `fetch()` and a `res.json()` cast. Converting that
  one file to `apiRequest` closes both.

- **`dukafy-overlay.js` has no test coverage.** Overlays are verified
  structurally — attributes, CSS, publisher output — but the open/close path has
  never been clicked in a browser.
