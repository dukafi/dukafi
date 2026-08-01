# 06 — Checkout flow

**Depends on:** 01 (orders/addresses schema), 04 (stock recheck)

## Scope

`dukafy/routes/checkout.rb` is currently a bare `response.status = 501` stub
(6 lines) — this task builds it from scratch:

- Server-rendered (not baked — matches VISION.md's "dynamic by necessity"
  classification): address form → shipping choice (flat/manual rates, v1
  scope per `MILESTONES.md`) → runs task 04's stock recheck → creates a
  pending `Order` + `Address` rows → redirects to a Stripe Checkout Session.
- Cart must be non-empty and every item in-stock (post-recheck) before a
  Stripe session is created; failed recheck re-renders checkout with the
  specific short line flagged.
- Discount (task 05) subtotal reduction carried into the Stripe line items /
  session total.

## Acceptance

- Manual: full flow from a seeded cart to landing on Stripe's hosted
  checkout page with the correct total (subtotal − discount + shipping).
- Spec: empty cart redirects back to cart; out-of-stock item blocks with the
  specific item named; pending `Order` row exists before redirect with
  `stripe_checkout_session_id` set (webhook idempotency key, task 07).
