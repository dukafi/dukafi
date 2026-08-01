# 03 — Remove item / update quantity fragment endpoints

**Depends on:** 02 (drawer is the natural place these actions live)

## Scope

`dukafy/routes/fragments.rb`'s `r.on("cart")` block (~line 62) currently only
has `POST items` (add) and `GET badge`. Add, following the exact same
`active_cart`/`CartItem`/`request.halt` idioms already in that file:

- `PATCH /fragments/cart/items/:id` — update quantity. Re-run the same stock
  check `POST items` already does (`new_quantity > variant.stock` → 409 with
  a `cart_fragment` notice); quantity `0` removes the row.
- `DELETE /fragments/cart/items/:id` — remove a line item outright.
- Both return the drawer fragment (task 02) with `HX-Trigger:
  dukafy:cart-updated`, same as add-to-cart does today (line 81).

## Acceptance

- Spec coverage mirroring the existing add-to-cart tests: quantity increase
  within stock succeeds; increase beyond stock 409s with the current cart
  state unchanged; remove drops the row and updates the badge count.
- Manual check: `curl` the endpoints against a seeded cart, confirm
  `dukafy-cart-badge__count` reflects the change without any page rebake.
