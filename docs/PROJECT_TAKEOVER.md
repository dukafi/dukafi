# Project takeover — UI restructuring brief

Date: 2026-08-01. Written after reading `VISION.md`, `MILESTONES.md`,
`docs/architecture/admin-store.md`, `docs/architecture/publishing.md`,
`docs/editor-commerce-workflow.md`, `docs/api-contract.md`, and the relevant
`dukafy-editor/` and `dukafy/` source (module registry, publisher, prefetcher,
Commerce workspace). This is a planning document, not a changelog — nothing
in the codebase has been changed yet.

Two restructuring efforts were requested. Each is documented below as:
current state (with file references) → problem → proposed direction →
open questions that need a decision before implementation starts.

---

## 1. Commerce workspace: visual polish + editor sidebar navigation

### Current state

- The Commerce admin lives at `dukafy-editor/src/admin/pages/commerce/CommercePage.tsx`.
  It's a single ~55-line hand-rolled component: inline hex colors
  (`#4f46e5`, `#d4d4d8`, `#dc2626`...) in `CommercePage.module.css` instead of
  the design tokens the rest of the admin uses, no `Panel`/`PanelHeader`
  shared chrome, raw `<button>`/`<form>` markup. It works, but looks and
  behaves nothing like Site, Media, or Dashboard.
- Top-level workspace switching is handled by
  `dukafy-editor/src/admin/shared/AdminSectionNavigation/AdminSectionNavigation.tsx`,
  which renders three flat items: Commerce, Site, Media
  (`docs/architecture/admin-store.md:13-19` confirms these are the only three
  authenticated destinations). Switching to Commerce replaces the whole
  workspace — there's no persistent left-hand navigation once inside it, and
  no way to jump to a specific product/collection from within the Site
  canvas editor.
- By contrast, the Site workspace has a real navigation surface:
  `dukafy-editor/src/admin/pages/site/sidebars/LeftSidebar/` (a page tree,
  `PanelRail`, `RightSidebar` for properties). Commerce has nothing
  equivalent — products/collections are two flat `<select>`-driven lists
  inside one page.

### Problem

Two distinct complaints bundled as "make it look good and put it in the
sidebar":
1. Visual — Commerce doesn't look like the rest of the product.
2. Navigational — Commerce is an all-or-nothing tab switch, not integrated
   into the editor's persistent sidebar the way page navigation is.

### Proposed direction

- Rebuild `CommercePage` on the shared primitives already proven out in
  Site/Media: `AdminPageLayout`, `Panel`/`PanelHeader`, and the token-based
  CSS variables the rest of the admin uses (grep `Panel.module.css` for the
  variable names to reuse, not re-derive).
- Give Commerce a left sidebar in the same shape as `LeftSidebar` for
  Site: a tree of Products / Collections / Import, with the selected
  product/collection driving a right-hand detail panel — replacing the
  current single-page master/detail grid.
- Decide whether "in the editor sidebar" means (a) Commerce gets its own
  sidebar once you're inside the Commerce workspace (straightforward,
  mirrors Site), or (b) products/collections should be reachable *from
  inside the Site canvas editor's own sidebar* (e.g. so a merchant editing
  the Product template can jump to "canvas-bag" without leaving Site) — this
  is a bigger change since it blurs the Commerce/Site workspace boundary
  that `docs/architecture/admin-store.md` currently treats as intentional
  ("Catalog versus layout" section).

### Open question

Which of (a) or (b) above did you mean? They're both reasonable reads of
"in the editor sidebar for easier navigation" but imply different amounts of
work and touch the Commerce/Site separation differently.

---

## 2. Composable, field-level dynamic content (the bigger change)

This is the core of milestone M4's `store.*` modules, and it currently works
the *opposite* way from what you're describing.

### Current state — monolithic card modules

`dukafy-editor/src/modules/store/productCard/index.ts` registers
`store.product-card` as one opaque module: `canHaveChildren: false`, one
icon, one editor component. Dropping it on canvas gives you a single
non-decomposable block. Its Ruby counterpart,
`dukafy/publisher/modules/store/modules.rb:28-48`, builds the entire
`<a><img/><strong/><span/></a>` markup as one hardcoded HTML string inside
the module's `render` block — title, image, and price are baked into that
one function, not separate elements a merchant can select, restyle, or
reorder independently. The same pattern repeats for `store.image-gallery`,
`store.variant-picker`, and `store.buy-button` in the same file.

This is inconsistent with how `ProductTemplate` *already* builds the title:
`dukafy/services/product_template.rb:20-22` uses a plain `base.text` node
with `tag: "h1"` and a `dynamicBindings: {"text": {"source": "currentEntry",
"field": "title", ...}}` binding. That's precisely the shape you're asking
for — a predefined HTML element, individually selectable, wired to a data
field by binding rather than by being hardcoded into a bespoke component.
The gallery/price/variant-picker/card modules never adopted that pattern;
they're pre-Instatic-style "smart components" bolted onto a system whose
binding primitive (`dynamicBindings` + `currentEntry`, resolved generically
in `dukafy/publisher/render_page.rb:97-112`) already supports what you want.

### Current state — relationships (collection → products, product → variants)

`store.collection-loop` is the one relationship-hydration mechanism that
exists today, and it's special-cased rather than generic:
- `CommercePrefetcher.call` (`dukafy/services/commerce_prefetcher.rb`) always
  eager-loads **every** active product with **every** variant, and **every**
  collection with its **full** resolved product list — regardless of
  whether a given page's document even references price, images, or
  variants. This is the overfetching you flagged: there's no step that
  looks at what a document actually binds to before deciding what to load.
- `RenderPage#render_collection_loop` (`dukafy/publisher/render_page.rb:62-95`)
  hardcodes the relationship path: it reads `prefetched["collections"][slug]["products"]`,
  then re-renders the loop's single child subtree once per product, with
  `current_entry` swapped to that product. The child subtree today is always
  `store.product-card` (see `collection_template.rb:31`), but the mechanism
  itself (swap `current_entry`, re-render children) is already
  relationship-agnostic — it just isn't exposed as a general "loop over a
  relationship" primitive. Product → variants has no loop equivalent at all
  today; `store.variant-picker` reads `product["variants"]` internally and
  renders a `<select>`, rather than letting a merchant iterate variants as
  freeform child markup.

### Problem, restated

- No predefined "product_card"/"collection_card" component should exist.
  Adding a product to a page should scaffold plain elements (a div, an
  image, a title, a price, ...) each bound to a field — fully
  selectable/rearrangeable/deletable afterward, same as any other canvas
  node.
- Relationships (variants on a product, products on a collection) need a
  generic "loop over related rows" primitive, not a hardcoded pairing of one
  loop module with one card module.
- The API/prefetcher should only load the columns a document's bindings
  (including relationship loops) actually reference, not the full row +
  full association every time.

### Proposed direction

1. **Scaffold, don't componentize.** Replace the "Add product" action (and
   equivalent for collections) with an editor command that inserts a plain
   `base.container` subtree — image, text (title), text (price), etc. — each
   child pre-populated with a `dynamicBindings` entry pointing at a
   `currentEntry` field, exactly like `product_template.rb`'s title node.
   `store.image-gallery`/`price`/`product-card` as opaque HTML-string
   modules should be retired in favor of composing `base.image`/`base.text`
   with bindings; `store.buy-button` and the two fragment badges
   (stock/cart) are the legitimate exceptions — they're live/interactive,
   not display-only, so keeping them as dedicated modules is fine.
2. **Generalize the relationship loop.** Turn `store.collection-loop` into
   (or add alongside it) a relationship-agnostic loop node: a prop naming
   the relationship (`variants`, or a collection's `products`) rather than
   collection-specific `collectionSlug`/`perPage` props, whose children are
   an arbitrary subtree (not a fixed card) rendered once per related row with
   `current_entry` swapped — reusing the swap mechanism already in
   `render_collection_loop`, just decoupled from the one hardcoded path and
   from the assumption that the child is `store.product-card`.
3. **Field-projection prefetching.** Before prefetching, scan a document's
   node tree for every `dynamicBindings[...].field` path (plus relationship
   loop targets), and have `CommercePrefetcher` (and the equivalent template
   prefetch for variants) request only those columns/associations instead of
   the current always-eager-load-everything behavior. This needs a place to
   run the scan — likely inside `bake.rb` before prefetching, once per
   template/page, since the document is already loaded there.

### Open questions

- Confirm the two legitimate exceptions (buy button, stock/cart badges)
  match your intent — they're behavior, not just field display, so I'd
  argue they should stay as dedicated modules rather than being decomposed.
- For the generalized relationship loop: is a simple relationship name
  (`"variants"`, `"products"`) sufficient, or do you need nested/filtered
  relationships (e.g. "only in-stock variants") in v1?
- Field-projection prefetching is a real perf feature, not just a refactor —
  worth confirming you want it now versus after the composability change
  ships, since they're separable.
- This reopens work `MILESTONES.md` marks `[x]` under M4 (the `store.*`
  module pairs). Worth deciding whether to track this as an M4 revision or a
  new milestone, so the checklist stays honest.

---

## Suggested sequencing

Item 2 (composable content model) is the larger, more structural change and
item 1 (Commerce UI) is comparatively contained. They don't block each
other. Recommend tackling them as separate pieces of work rather than one
combined change, and resolving the open questions above before writing code
for either.
