# M13 — Theme marketplace: registry endpoints, starter themes, in-app gallery

Scope: finish the themes story so a merchant can browse themes inside the app and install
one with a click. The store-side half (archive format, export, inspect, apply, registry
client, admin routes, apply UI) already exists; this milestone builds the missing server
half in the Go registry, produces actual theme content, and adds the browse/gallery UI.
Independent of M11/M12. Launch-blocking.

TL;DR: implement `/v1/themes` (list/get/default) plus submission + approval in
`registry/`, reusing the plugin listing machinery; author and bundle one starter theme
into the Docker image as the offline fallback for `themes/default`; add a theme gallery
to the dashboard that lists registry themes with previews and drives the existing
install→inspect→apply flow; record the applied theme on the site.

---

## Current state (verified in-tree)

Store side — **exists, keep as-is**:

- Archive format: gzipped tar of 9 JSON files, media as URLs never bytes
  (`dukafi/services/theme_archive.rb` `FILES`).
- `theme_exporter.rb` (8 sections), `theme_importer.rb` (transactional apply with
  per-section `override*` options + media remap), `theme_catalogue.rb` (registry client:
  `GET /v1/themes/default`, `GET /v1/themes/{id}`, `download(id)` with
  `distribution.sha256` verification).
- Routes in `dukafi/routes/admin_api.rb` (~931–1004): `themes/export`, `themes/default`,
  `themes/inspect`, `themes/install`, `themes/apply`.
- Editor: `ThemeApplyForm.tsx` (apply options), `DefaultThemePrompt.tsx` (first-run
  prompt), `themeApi` in `src/admin/pages/dashboard/api.ts`.

Missing — **grep-verified**:

- `registry/*.go` contains **zero** occurrences of "theme". Every store-side call to
  `/v1/themes/*` currently 404s.
- No theme archive exists anywhere in the repo; `StarterSite.create!` seeds one blank
  `index` page. First-run `DefaultThemePrompt` has nothing to offer.
- No browse/gallery UI — the store can install a theme only by id it cannot discover.
- Nothing records which theme a site applied.

## Design

### Registry side (Go)

Reuse the plugin machinery wholesale — themes are listings with a different kind, not a
new subsystem. Files: `registry/themes.go`, extend `registry/migrate.go` (or the
migrations file the plugin tables live in), reuse `s3blobs.go`, the approval queue,
rate limiting, and SSRF-guarded fetching as they already work for plugins.

Schema (mirroring the plugin listing table):

```
themes
  id            text pk           -- slug, e.g. "duka-classic"
  name, summary, description
  author_account_id fk
  version       text              -- semver of the current approved archive
  categories    text              -- csv from: fashion, food, electronics, services, general
  preview_urls  text              -- json array; first item is the card image
  demo_url      text nullable
  status        text              -- pending | approved | rejected | delisted
  sha256        text              -- of the approved archive
  archive_key   text              -- bucket key
  default_rank  integer nullable  -- non-null marks it eligible for /v1/themes/default;
                                  -- lowest rank wins
  created_at / updated_at
```

Endpoints (all shapes chosen to satisfy the existing store client in
`theme_catalogue.rb` — read that file first and match it exactly; where it expects
`distribution.sha256`/`distribution.url`, serve that):

```
GET  /v1/themes                     list approved; ?category=, ?q=, paged
GET  /v1/themes/{id}                one listing incl. distribution {url, sha256, size}
GET  /v1/themes/default             the approved theme with lowest default_rank
POST /v1/themes                     authenticated submission: multipart archive + metadata
POST /v1/admin/themes/{id}/approve  admin approval (same auth as plugin approvals)
```

Validation on submission: archive is gzip, ≤ 10 MB, contains exactly the
`theme_archive.rb` FILES set, `theme.json` parses and `id` matches the listing slug,
every `media.json` URL is https. Compute sha256 server-side; never trust the submitted
one. Preview images are uploaded to the bucket as listing assets, not taken from the
archive.

### Starter theme(s) — content work, not plumbing

- Author **one** complete storefront theme using the editor itself against a dev store:
  home, product template, collection template, cart/checkout-adjacent pages, header/footer
  partials, sample products with hosted placeholder images, a form, design tokens that
  don't look like a default. Export via `GET /admin/api/cms/themes/export`.
- Commit the result as `dukafi/themes/starter.theme.tar.gz` + `starter.json`
  (listing metadata + preview PNGs under `dukafi/themes/previews/`). `COPY` into the
  image in the `Dockerfile`.
- `ThemeCatalogue.default`: try the registry; on any error or 404, serve the bundled
  archive (new `theme_catalogue.rb` branch reading `dukafi/themes/`). First-run therefore
  always has a theme, air-gapped installs included.
- Media caveat: the archive format carries media as URLs. For the bundled theme those
  URLs must be **long-lived hosted URLs** (registry bucket / GitHub raw on a tagged
  release), because the importer's browser fetches them at apply time. Document this in
  the theme's listing. (Extending the archive format to carry bytes is parking-lot.)
- Two more themes are a stretch goal after the pipeline works; one excellent theme beats
  three drafts.

### Store side additions

- **Gallery UI**: new dashboard section "Themes" —
  grid of cards (preview image, name, author, categories) fed by a new pass-through route
  `GET /admin/api/cms/themes/catalogue` (server-side proxy to registry list; the browser
  never talks to the registry directly, consistent with `themes/install` today).
  Card → detail (screenshots, description) → Install button → existing
  inspect/apply flow (`ThemeApplyForm` with its override options, unchanged).
- **Applied-theme record**: store `{themeId, version, appliedAt}` in `SiteState.site`
  under `settings.theme` when apply came from a catalogue install (manual archive applies
  record `themeId: null`). Display in dashboard. This is bookkeeping for future update
  notifications — no update mechanism in 1.0.
- **Creator path**: "Submit to registry" stays out of the app for 1.0; document the
  manual flow (export → registry account → POST /v1/themes via curl or the registry web
  form if one exists) in the docs site.

## Tasks

1. **Registry: schema + list/get/default endpoints** (`registry/themes.go`).
   AC: Go tests for list filtering, default_rank selection, 404s; response shape
   verified against `theme_catalogue.rb` expectations (write the Go test asserting the
   exact JSON keys that file reads).
2. **Registry: submission + approval** reusing account auth, rate limits, bucket
   storage; validation set above. AC: tests for each rejection reason; approved
   submission appears in list; sha256 is server-computed.
3. **Starter theme** authored + exported + committed under `dukafi/themes/` with
   previews; Dockerfile COPY. AC: `themes/inspect` on the bundled archive reports all
   sections non-empty; apply on a fresh store then `publish` produces a browsable
   storefront (manual checklist in this folder).
4. **Bundled-default fallback** in `theme_catalogue.rb` + spec (registry down ⇒ bundled
   archive served with correct sha).
5. **Catalogue proxy route** `GET /admin/api/cms/themes/catalogue` + spec (registry
   error ⇒ `{themes: [bundled]}` degraded response, never a 500).
6. **Gallery UI** (dashboard section, cards, detail, install wiring into existing
   `ThemeApplyForm`). AC: `bun run build` clean; zero-network state renders the bundled
   theme card.
7. **Applied-theme record** in site state + dashboard display + spec.
8. **Seed default theme on first run**: wire `DefaultThemePrompt` so a fresh store's
   owner-setup flow ends with "Start with a theme?" offering the default. AC: declining
   leaves today's blank starter behavior.
9. **Docs**: `docs/src/content/docs/en/themes.mdx` (what a theme is, install, export,
   submit-to-registry manual flow); update `registry/README.md`.

## Out of scope

Theme updates/uninstall/rollback (one-shot apply stays), paid themes (registry refuses
licensed listings today — keep), archive format changes (media bytes), in-app submission.

## Related

- `docs/LAUNCH-PLAN.md` D7
- `dukafi/services/theme_archive.rb` — the format contract the registry must validate
- `registry/README.md` — deployment env (bucket vars) the theme storage reuses
- M16 first-run experience consumes task 8
