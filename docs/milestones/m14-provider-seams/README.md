# M14 — Provider seams: mail, plugin job scheduler, shipping

Scope: add the two provider seams the launch cannot ship without (mail, so order
confirmations exist; a scheduler, so plugin jobs actually run) plus the shipping seam
definition with a minimal flat-rate provider. All three follow the payments pattern
already proven in `dukafi/services/payments.rb`. Independent of M11–M13; M15 depends on
the scheduler's leader lock. Launch-blocking except carrier shipping.

TL;DR: `p.mail_provider` seam + first-party `smtp` and `fake_mail` plugins + a core
listener on `order.paid` that sends the confirmation email; a leader-elected 60s timer
thread that finally calls `PluginJobs.run_due` (today: zero callers); a
`p.shipping_provider` seam with one flat-rate plugin wiring the currently hardcoded
`shipping_cents = 0`.

---

## Current state (verified in-tree)

- **Mail: nothing.** Greps for smtp/mailer/sendgrid/postmark hit only comments and
  `dukafi/docs/plugin-api.md` design prose. `docs/milestones/m5-cart-checkout/tasks/
  08-order-confirmation-email.md` is an unimplemented task file.
- **Scheduler: nothing calls it.** `PluginJobs.run_due` (`dukafi/services/plugin_jobs.rb:30`)
  is exercised only by its own spec; the file's comment says "a future timer". Plugins can
  declare `p.job(name, every: "6h")` today and it silently never fires.
- **Shipping: hardcoded zero.** `orders.shipping_cents` exists;
  `dukafi/services/create_order.rb:94` and `charge.rb:72` write `0`. `shipping` is a
  registry category with no host seam. Parking lot says "real shipping-rate providers" —
  carriers stay parked; the *seam* and flat rate land now.
- Events that exist and matter here: `order.paid` (emitted by `Payments.settle`),
  `order.created`, `payment_*` (see `Plugins.emit` call sites).

## Design

### 1. Mail seam (D8)

Registration, next to `payment_provider` in `dukafi/plugins/registry.rb`:

```ruby
Dukafi::Plugins.register("smtp") do |p|
  p.setting :host,  label: "SMTP host"
  p.integer :port,  label: "Port"            # default 587
  p.setting :username, label: "Username"
  p.secret  :password, label: "Password"
  p.setting :from,  label: "From address"    # e.g. "Duka <orders@duka.co.ke>"
  p.mail_provider "smtp", Smtp::Provider, label: "SMTP"
end

# Provider contract — ONE verb:
#   deliver(message:, config:) -> DeliveryResult
#   Message        = Data.define(:to, :subject, :text, :html, :reply_to)
#   DeliveryResult = Data.define(:ok, :provider_id, :error)
```

- Discovery mirrors payments: `Plugins.configured_mail_providers`, filtered by
  `settings.configured?`. If several are configured, the **first by plugin id** is the
  active one (single active mailer; no fan-out).
- Core service `dukafi/services/mailer.rb`:
  `Mailer.deliver(:order_confirmation, order:)` — resolves the template, renders text +
  minimal inline-styled HTML, hands off to the provider, emits `email.sent` /
  `email.failed` (new events), logs through `plugin_logs`-style records
  (new `mail_log` table: to, template, ok, error, created_at — no bodies stored).
  **No provider configured ⇒ log-and-skip, never raise** — a store without email is
  valid.
- Templates: plain Ruby methods in `dukafi/services/mail_templates.rb` (order
  confirmation for 1.0: order number, line items, totals, payment reference, store
  name/URL from site state). ERB/liquid engines are parking-lot; a plugin `filter`
  (`email.render`) lets plugins replace the body — declare the filter, document it,
  done.
- Wire-up: a core subscriber registered in `Plugins.boot!` (host-owned, not a plugin) on
  `order.paid` → `Mailer.deliver(:order_confirmation, order:)` when the order has a
  customer email. Runs after commit like every event handler; a raise is swallowed by
  `Plugins.emit`'s existing warn-and-continue, and additionally recorded in `mail_log`.
- First-party plugins in `plugins-available/`:
  - `smtp/` — net/smtp from stdlib, STARTTLS, auth login/plain, 15s timeouts. No mail
    gem dependency.
  - `fake_mail/` — dev-only (same `RACK_ENV` guard as `fake_payments`), stores the last
    20 messages in `p.storage`, exposes `p.page` dashboard listing them; used by specs.
  - Resend/SES/Mailgun are community/registry material post-launch; the seam is the
    deliverable, and the docs page must show a complete third-party example.

### 2. Plugin job scheduler (D9)

- `dukafi/services/scheduler.rb`: a single Thread started from `config.ru`-adjacent boot
  (guarded so specs and `scripts/*` don't start it; env kill-switch
  `DUKAFI_DISABLE_SCHEDULER=1`). Loop: every 60s → `SchedulerLock.claim` → if leader,
  `PluginJobs.run_due` + `ScheduledPublisher.run_due` (future hook, no-op now) inside
  begin/rescue that logs and never kills the thread.
- `SchedulerLock` (`dukafi/services/scheduler_lock.rb`): DB-row claim that works on both
  engines — table `scheduler_lock(id=1, holder text, heartbeat_at timestamp)`;
  claim = atomic `UPDATE ... WHERE heartbeat_at < now - 90s OR holder = me`; row seeded
  by migration. Holder id = hostname+pid+random suffix per boot. On Postgres this gives
  real multi-replica leader election; on SQLite (single box) it degrades to a no-op
  claim that always succeeds for the only process. **This lock is reused by M15 for
  single-flight publish.**
- Puma note: `workers 0` (single process, threaded — `dukafi/config/puma.rb`), so one
  thread per container is the correct shape; if workers are ever enabled, the boot guard
  must start the thread only in the master or one worker — leave a comment saying so.
- Observability: last-run timestamp + last error per job already live in plugin storage
  via `PluginJobs`; add `GET /admin/api/cms/plugins/jobs` returning due/last-run/last
  error, surfaced on the plugin's dashboard page.

### 3. Shipping seam

```ruby
#   rates(cart:, address:, config:) -> [Rate]
#   Rate = Data.define(:id, :label, :amount_cents, :meta)
p.shipping_provider "flat_rate", FlatRate::Provider, label: "Flat rate"
```

- Discovery: `Plugins.configured_shipping_providers`; **zero configured ⇒ shipping step
  absent and `shipping_cents` stays 0** — exactly today's behavior, so this is purely
  additive.
- Checkout integration: when ≥1 provider is configured, checkout collects/uses the
  address, requests rates from every configured provider, renders the union as radio
  options, and the **server re-resolves the chosen rate** at order creation
  (`create_order.rb`) writing `shipping_cents` + `shipping_meta` JSON (rate id, label,
  provider) — same never-trust-the-browser rule as `Charge.resolve`'s
  `quote_mismatch`. Rate re-resolution mismatch ⇒ same error family.
- First-party `flat_rate/` plugin: settings `amount` (integer, cents) + optional
  `free_over` (cents); one rate always. Carrier APIs (Sendy, Pickup Mtaani, DHL…) are
  registry plugins post-launch.

## Tasks

1. **`p.mail_provider` seam** in `plugins/registry.rb` + `configured_mail_providers` +
   spec (mirrors payment provider discovery spec).
2. **`Mailer` + `mail_templates` + `mail_log` migration** + order-confirmation
   subscriber. AC: order.paid with configured provider ⇒ delivered + logged; without ⇒
   skipped + logged; provider raise ⇒ email.failed + order flow unaffected.
3. **`plugins-available/smtp`** + spec against a fake SMTP server (spec-local TCP
   server, no gem). **`plugins-available/fake_mail`** + dashboard page.
4. **Finish m5 task 08** using the above; mark
   `docs/milestones/m5-cart-checkout/tasks/08-order-confirmation-email.md` done with a
   pointer here.
5. **`SchedulerLock` + migration + spec** (claim, steal-after-90s, heartbeat renew;
   postgres + sqlite).
6. **`Scheduler` thread** + boot guard + kill-switch + spec (time-travel: due job fires
   once; raising job logged, thread survives; non-leader does nothing).
7. **Jobs status route + dashboard surfacing** + spec.
8. **`p.shipping_provider` seam + checkout wiring + re-resolution guard** + spec
   (no provider ⇒ unchanged golden checkout; flat rate present ⇒ shipping line correct;
   tampered amount ⇒ rejected). Update `probe` to register a test shipping provider.
9. **`plugins-available/flat_rate`** + spec.
10. **Docs**: extend `docs/src/content/docs/en/store-plugins.mdx` with mail + shipping
    seams (same style as the existing "Payment rails" section); `plugin-api.md` updated;
    new short `email.mdx` for merchants (configure SMTP, what gets sent).

## Out of scope

Carrier shipping integrations, SMS seam (parking lot — but when it comes, it is
`p.sms_provider` with a single `deliver` verb, same shape), marketing email/campaigns,
email template editor, per-order resend UI (add `POST /admin/api/cms/orders/:id/resend_confirmation`
only if trivial after task 2).

## Related

- `docs/LAUNCH-PLAN.md` D8–D9
- `dukafi/services/payments.rb` — the seam pattern all three copy
- M15 reuses `SchedulerLock` for publish single-flight
- `dukafi/docs/plugin-api.md` — "Host checklist" items this milestone closes
