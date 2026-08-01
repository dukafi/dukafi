# 01 — Migrations: orders, order_items, addresses, discounts

**Depends on:** — (first task, everything else in M5 needs these tables)

## Scope

New migration(s) after `015_fix_template_slugs.rb` (next number: `016`, though
this task may consume more than one file if the schema warrants it).

- `orders`: id, cart_id (nullable FK, cart may be cleared after), email,
  status (`pending → paid → fulfilled → shipped → refunded`), currency,
  subtotal_cents, discount_cents, shipping_cents, total_cents,
  stripe_checkout_session_id (unique, for webhook idempotency),
  stripe_payment_intent_id, created_at, updated_at.
- `order_items`: id, order_id FK (cascade), variant_id FK, product_title,
  variant_title, sku (denormalized — snapshot the product/variant at
  purchase time so later catalog edits don't rewrite historical orders),
  unit_price_cents, quantity, created_at.
- `addresses`: id, order_id FK (cascade), kind (`shipping`|`billing`), name,
  line1, line2, city, region, postal_code, country, created_at.
- `discounts`: id, code (unique, case-insensitive — store uppercased),
  kind (`percentage`|`fixed`), value (integer — percent points or cents
  depending on kind), starts_at, ends_at (nullable), usage_limit (nullable),
  usage_count (default 0), created_at, updated_at.

## Acceptance

- Fresh DB migrates cleanly; `bundle exec ruby scripts/migrate.rb` idempotent.
- Sequel models added (`Order`, `OrderItem`, `Address`, `Discount`) mirroring
  the existing bare-model style (`Product`, `Variant` in `dukafy/models/`).
- No route/service code yet — this task is schema only.
