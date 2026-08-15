# Editor & media — where it actually stands

Audit date: 2026-08-15. Everything below was verified against the code, and
the HTTP results were reproduced, not inferred.

**Summary: the rendering is good, the persistence is largely missing.** Media
*output* — variants, `srcset`, lazy loading, blurhash — is thoughtfully built.
Media *metadata* — alt text, titles, captions, tags, folders — has a complete
editor UI and almost no server behind it.

---

## What is genuinely good

`MediaVariants` generates WebP at 320/640/960/1280/1920, quality 82, and skips
rungs wider than the original so it never upscales. Both renderers emit
`srcset`, `width`/`height` (so no layout shift), `loading`, `decoding` and
`fetchpriority`.

The blurhash design is careful: the editor decodes only the DC term into a CSS
background rather than porting the full decoder, and deliberately skips the
placeholder for `loading="eager"` images, where a blur-then-flash is worse than
waiting. That is the right call, thought through.

None of this needs redoing.

---

## 1. Alt text does not exist server-side — the whole feature is a facade

The editor has a **substantial** alt-text feature:

- a per-asset field in `MediaViewerWindow`
- **bulk editing** across a selection (`BulkEditWindow`)
- a smart folder listing images *missing* alt text (`smartFolders.ts:37`)
- alt text included in media search (`filters.ts:60`)

There is no column, no endpoint, and no publisher support. Reproduced:

```
PATCH /admin/api/cms/media/:id  {"altText":"A red bicycle"}  ->  404
```

`updateAsset` catches that, logs to the console and returns `null`. **The UI
reports nothing.** A merchant types alt text, the debounced save appears to
succeed, and it is gone on reload.

Downstream, `MediaPrefetcher` returns only `width`, `height`, `variants`, so
`register_image`'s `media.fetch("altText", "")` is always `""` and **every
published image ships `alt=""`**. `CommercePrefetcher` hardcodes `"alt" => ""`
for product images.

This is the highest-impact item in the codebase right now: it is an
accessibility failure, an SEO failure, and a silent data-loss bug, in a product
whose entire job is making pages look good.

## 2. Two renderers, two divergences

The recurring Dukafi failure mode — an editor feature with no Ruby counterpart.

**BlurHash never publishes.** `src/modules/base/image/index.ts` emits a
`background-image` placeholder; `publisher/modules/base/modules.rb:42` does
not, and Ruby has *no* blurhash code at all. The effect exists only in the
canvas preview.

**`sizes` is hardcoded.** The editor computes per-image `sizes` from the layout
via a publisher pre-pass (`_resolvedAutoSizes`). Ruby emits
`sizes="auto, 100vw"` unconditionally — including for `loading="eager"`, where
`auto` is invalid and the browser falls back to `100vw`. So **hero images, the
LCP element, always fetch the widest variant** regardless of rendered size.

Worth verifying separately: `sizes=auto` is recent and browser support is
uneven. Wherever it is unsupported, *every* image degrades to `100vw` and the
responsive pipeline stops doing anything at all. That is a measurement, not a
guess to act on.

## 3. The media workspace is mostly unbacked

The editor calls **9** media endpoints. Ruby implements **4**, one of which is
a stub.

| Editor calls | Ruby |
|---|---|
| `GET /media` | ✅ |
| `POST /media` | ✅ |
| `DELETE /media/:id` | ✅ |
| `GET /media/folders` | ⚠️ hardcoded `{ folders: [] }` |
| `PATCH /media/:id` | ❌ 404 |
| `POST /media/:id/replace` | ❌ |
| `POST /media/:id/restore` | ❌ |
| `DELETE /media/:id?purge=1` | ❌ |
| `POST /media/:id/folders` | ❌ |
| `GET/POST/DELETE /media/folders[/:id]` | ❌ |
| `GET /media?<filters>` | ❌ ignores params |

`media_assets` holds only `id, path, mime, width, height, variants_json,
created_at`. Everything the UI edits — alt text, title, caption, tags, folder,
blurhash, soft-delete — has nowhere to go.

Shipped UI with no backend: `TagEditor`, `MediaFolderPanel`, `ReplaceFileDialog`,
bulk edit, trash/restore.

Same pattern elsewhere: `GET /components` and `GET /layouts` both return a
hardcoded `{ rows: [] }` (`admin_api.rb:687-688`), which is why Componentize
produces an unpublishable page and saved layouts do not persist.

## 4. Formats

WebP only. No AVIF anywhere in the codebase — typically 20–30% smaller than
WebP at equal quality, and `libvips` is already in the image. A cheap win once
the correctness items are done, not before.

---

## Suggested order

1. **Alt text end to end** — column, `PATCH /media/:id`, include it in
   `media_payload` and `MediaPrefetcher`, and stop hardcoding `"alt" => ""` for
   product images. Makes an existing, polished UI real.
2. **Surface save failures.** `updateAsset` swallowing a 404 into `console.error`
   is why nobody noticed. Whatever else changes, a failed metadata save must be
   visible.
3. **Fix `sizes` for eager images**, then close the blurhash gap — or delete the
   blurhash path from the editor. Either is defensible; a feature that only
   works in preview is not.
4. **Decide about the unbacked workspace.** Every item is "build the backend" or
   "hide the UI". Tags and folders are real work; deciding is cheap and can be
   done per feature.
5. **A parity gate.** `importable_modules_spec.rb` exists because of exactly
   this class of bug. Nothing currently asserts the two `<img>` renderers agree,
   and that is what let blurhash and `sizes` drift.

---

## Text

Modules present: `text`, `link`, `list`, `button`, plus `body`, `container`,
`image`, `video`, `svg`, `loop`, `outlet`, `slotInstance`, `slotOutlet`,
`forms`, `visualComponentRef`.

Inline editing is wired through `NodeRenderer` / `CanvasRoot` /
`IframeFrameSurface`. Typography and self-hosted fonts already publish
correctly — that pipeline was finished and verified earlier.

Text is in noticeably better shape than media. **Media is where the work is.**
