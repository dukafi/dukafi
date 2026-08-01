# 08 — Order confirmation page + email

**Depends on:** 07 (an order must exist to confirm)

## Scope

- `GET /checkout/confirmation/:order_id` (or similar) — server-rendered
  order summary (items, totals, shipping address). Not baked; reads the
  live `Order`/`OrderItem` rows.
- Plain SMTP email via the `mail` gem (already the documented v1 choice —
  `MILESTONES.md` M5) sent from the webhook handler (task 07) once the order
  is marked paid: same summary content as the confirmation page.
- `SMTP_*` env vars documented in `.env.example` alongside the other M7
  env-contract entries (`SETUP.md`/M7 folder owns the full contract; this
  task only adds the SMTP_* keys it needs).

## Acceptance

- Manual: complete a test-card purchase, confirmation page renders the
  correct order, and a real email (or a dev-mode log/letter_opener capture)
  is produced with matching content.
- Confirmation page 404s (not 500s) for an unknown/foreign order id.
