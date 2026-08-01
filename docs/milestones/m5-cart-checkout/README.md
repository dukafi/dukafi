# M5 — Cart + checkout

Mirrors `MILESTONES.md`'s M5 section, broken into small, independently
implementable tasks. Status legend and ordering rules are the same as
`MILESTONES.md`: sequential unless a task says `(dep: ...)`.

**Goal:** money moves. A guest can add to cart, check out with a Stripe test
card, and see the order land in the merchant's admin — without any page
needing a re-bake.

**Already shipped** (do not redo): anonymous session cart (`carts`/`cart_items`,
migration 014), add-to-cart with a stock check, the cart-count badge fragment,
and the `hx-trigger="revealed"` skeleton pattern baked pages use to hydrate
live fragments. All three live in `dukafy/routes/fragments.rb`.

**Not started at all:** `dukafy/routes/checkout.rb` is currently a bare
`response.status = 501` stub — every task from 06 onward starts from nothing.

## Tasks

| # | Task | Depends on |
|---|---|---|
| [01](tasks/01-schema-orders-addresses-discounts.md) | Migrations: orders, order_items, addresses, discounts | — |
| [02](tasks/02-cart-drawer-fragment.md) | Cart drawer fragment (list, subtotal, empty state) | — |
| [03](tasks/03-cart-remove-update-qty.md) | Remove item / update quantity fragment endpoints | 02 |
| [04](tasks/04-checkout-time-stock-recheck.md) | Transactional stock recheck at checkout | 01 |
| [05](tasks/05-discount-codes.md) | Discount codes: validation + cart application | 01 |
| [06](tasks/06-checkout-flow.md) | Checkout flow: address → shipping → Stripe redirect | 01, 04 |
| [07](tasks/07-stripe-webhook.md) | Stripe webhook: create order, decrement stock, clear cart | 01, 06 |
| [08](tasks/08-order-confirmation-email.md) | Order confirmation page + email | 07 |
| [09](tasks/09-orders-admin-screen.md) | Orders admin screen (list, detail, status, refund) | 07 |

**DEMO (unchanged from MILESTONES.md):** full purchase on the demo store with
a Stripe test card; order appears in admin; stock decremented; cart badge
updated everywhere without a re-bake.
