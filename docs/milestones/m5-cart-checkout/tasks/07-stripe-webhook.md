# 07 — Stripe webhook

**Depends on:** 01 (orders schema), 06 (pending order + session id exist to reconcile against)

## Scope

- `POST /webhooks/stripe` (verify signature against `STRIPE_WEBHOOK_SECRET`,
  per `SETUP.md`'s env contract in the M7 folder).
- On `checkout.session.completed`: look up the pending `Order` by
  `stripe_checkout_session_id`, create `order_items` (snapshotting product/
  variant title + price at purchase time — never re-read the live catalog
  for historical orders), decrement each `variant.stock`, mark the order
  `paid`, clear the session's cart (`Cart#status = "converted"` rather than
  deleting — keeps the row for analytics), increment `discounts.usage_count`
  if a code was applied.
- **Idempotent by event id**: a redelivered webhook for an already-processed
  session must no-op, not double-decrement stock or double-create order_items.

## Acceptance

- Spec: replaying the same webhook payload twice results in exactly one
  order/order_items set and one stock decrement.
- Spec: webhook with a bad/missing signature is rejected (401/400), no DB
  writes.
- Manual: Stripe CLI (`stripe trigger checkout.session.completed` or a real
  test-card checkout) → order appears `paid`, stock decremented, cart badge
  reflects the cleared cart without a page rebake.
