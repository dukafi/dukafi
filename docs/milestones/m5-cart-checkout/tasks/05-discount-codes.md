# 05 — Discount codes

**Depends on:** 01 (`discounts` table)

## Scope

- `dukafy/services/discount_lookup.rb` (or similar): given a code + cart
  subtotal, validate `starts_at`/`ends_at` window and `usage_limit` vs
  `usage_count`, return the computed discount amount for `percentage` or
  `fixed` kind. Case-insensitive code match (compare uppercased).
- Fragment endpoint to apply/remove a code on the cart (session-stored,
  e.g. `session["discount_code"]`, re-validated on every cart render so an
  expired/exhausted code drops silently rather than erroring on next view).
- `usage_count` increments only on successful order creation (task 07), not
  on apply — a customer can apply/remove freely before paying.

## Acceptance

- Spec: expired code rejected; usage-limit-exhausted code rejected;
  percentage and fixed math both correct against a multi-item cart subtotal;
  case-insensitive match (`SAVE10` applies for input `save10`).
- Cart drawer (task 02) shows the applied code + discount line.
