# 04 — Transactional stock recheck at checkout

**Depends on:** 01 (orders schema exists so this can live next to order creation)

## Scope

`fragments.rb`'s add-to-cart already checks `new_quantity > variant.stock`
(line 74) — but that's a point-in-time check at add time, not at checkout,
so two customers can both add the last unit before either pays. Add a
recheck that runs **inside the same DB transaction** as order creation
(task 07 will call into this):

- A service (e.g. `dukafy/services/checkout_stock_check.rb`) that, given a
  cart, re-verifies every `CartItem`'s quantity against current
  `variant.stock` — Dukafy's SQLite single-writer model (see VISION.md
  "Money is exact... Stock is checked at the write, inside the one writer
  SQLite gives us") makes this safe without row locking.
- On failure: which line(s) are now short, so checkout (task 06) can show
  "Only N left" instead of a generic error.

## Acceptance

- Spec: two sequential checkout attempts for the same last-unit variant —
  first succeeds, second is rejected with the specific short item identified,
  cart is not double-decremented.
- This service has no HTTP layer of its own — it's called from task 06/07.
