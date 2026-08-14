# 02 — Cart drawer fragment

**Depends on:** — (uses existing `carts`/`cart_items`, migration 014)

## Scope

`dukafi/routes/fragments.rb` already has `cart_fragment` (a one-line count
summary, ~line 19) used by add-to-cart. Add a fuller drawer fragment:

- `GET /fragments/cart/drawer` — full line-item list (title, variant, qty,
  unit price, line total), subtotal, and an empty-cart state. Follows the
  same `hx-trigger="revealed"` skeleton pattern already used by
  `store.stock-badge`/`store.cart-badge` (see `docs/editor-commerce-workflow.md`
  "Current cart boundary").
- A `store.cart-drawer` canvas+publisher module pair (mirrors `store.cart-badge`'s
  shape in `dukafi-editor/src/modules/store/cartBadge/` and
  `dukafi/publisher/modules/store/modules.rb`'s `store.cart-badge`
  registration) — always a fragment, never baked, same as the badge.

## Acceptance

- Golden test in `dukafi/spec/publisher/store_modules_spec.rb` for the new
  module's baked (loading) placeholder.
- Fragment spec in `dukafi/spec/routes/` (mirror existing fragments spec if
  present) covering: empty cart, one item, multiple items, subtotal math.
- Drawer updates on `dukafi:cart-updated` the same way the badge does
  (`hx-trigger="revealed, dukafi:cart-updated from:body"`).
