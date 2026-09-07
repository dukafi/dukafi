# Commerce plugin API

How a Dukafi plugin extends a store without putting coffee-shop code, salon
bookings, or a car-loan calculator into the image.

This is the target shape. Today the store plugin (`plugin.rb`) can register
settings, a payment rail, and fire-and-forget events. The editor SDK already
ships modules, packs, hooks, routes, and install lifecycle — see
`dukafi-editor/docs/features/plugin-system.md`. The gap is the **commerce
runtime**: amounts that are not a cart total, forms that plugins can halt,
events a mailer can listen to, jobs on install. This document is that gap,
written so the two sides stay one product.

Speed is the constraint, not a slogan. Published pages stay static HTML.
Plugins add work on the paths that already hit the server (checkout, forms,
webhooks, admin). They do not inject a runtime onto every page unless a
module on that page opted in.

---

## Two runtimes, one plugin

A plugin is a directory named after its id. It may contain either or both:

```text
payhero/
  plugin.rb              store runtime (Ruby, in-process)
  plugin.json            editor / CMS contract (optional)
  modules/index.js       canvas modules / sections (optional)
  pack/site.json         Visual Components + page sections (optional)
  server/index.js        sandboxed CMS jobs, tables, routes (optional)
  editor/index.js        editor chrome (optional)
```

| Runtime | Runs | For | Must stay off the hot path |
|---|---|---|---|
| **Store** (`plugin.rb`) | Puma, in-process Ruby | Money, orders, form intake, inbound webhooks that settle a payment | Sandboxes, outbound HTTP on the request that charges a card |
| **Editor / CMS** (`plugin.json`) | Admin, publisher, QuickJS worker | Modules, sections, admin pages, content tables, scheduled sync | Checkout, `Payments.start`, form POST |

Checkout never waits on QuickJS. A booking plugin that needs a calendar UI
ships a **module** (HTML at publish time, a little JS on that page) and a
**store handler** that validates the slot when the form posts.

Permissions are declared, approved at install, and fail closed. A mailer
that needs `network.outbound` says so. A plugin that registers a public
webhook says `cms.routes.public` (editor) or `p.public_route` (store).

---

## What a store plugin is allowed to be

Not a second application. A plugin registers into seams the host already
owns:

1. **Settings** — secrets and config the admin form already renders.
2. **Payment rails** — how money moves. Never what the amount is.
3. **Quotes** — how an amount is *computed* when it is not a cart.
4. **Filters** — may halt or reshape a host action *before* it commits.
5. **Events** — may react *after* commit. Raising never fails the customer.
6. **Routes** — inbound HTTP (provider callbacks, Zapier, WhatsApp).
7. **Jobs** — install, activate, scheduled sync. Not on the storefront POST.
8. **Modules / packs** — what the merchant drops onto a page.
9. **Dashboard pages** — host-rendered stats, info, tables, and actions.
10. **Provider seams** — mail, shipping, image generation, and media storage.

Provider contracts stay deliberately small:

```ruby
p.mail_provider "smtp", Smtp::Provider, label: "SMTP"
# deliver(message:, config:) -> Mailer::DeliveryResult

p.shipping_provider "flat", Flat::Provider, label: "Flat rate"
# rates(cart:, address:, config:) -> [Shipping::Rate]

p.image_provider "replicate", Replicate::Provider, label: "Replicate"
# generate(prompt:, size:, count:, config:) -> result with images/error

p.media_storage "s3", S3::Adapter, label: "S3-compatible"
# store(io:, path:, content_type:), read_url(path), delete(path), verify!
```

Discovery exposes only fully configured plugins. Secrets remain write-only over
HTTP. Provider errors must be returned as typed results or raised without including
credentials; the host sanitizes and logs them.

If a feature needs a new table in core (orders, customers, products), it
does not belong in a plugin. If it needs a table the core has never heard
of (bookings, loan quotes, imported Woo rows), the plugin owns it —
`p.storage` on the store, or `api.cms.storage` / `content.tables.create`
on the CMS side.

---

## Amounts

Payment plugins charge. They do not price.

Today `Payments.start` always takes `order.total_cents`. That is correct
for a coffee shop and wrong for a salon deposit, a booking fee, or a car
down-payment. The host resolves an amount **before** the rail is called.
The rail sees `attempt.amount_cents` and must not invent another figure
(it may only `normalize_amount` for a rail that cannot take cents).

```text
  page / form / cart
          │
          ▼
   Charge request     { subject, inputs, provider }
          │
          ▼
   Amount resolver    (host, not the payment plugin)
          │
          ▼
   PaymentAttempt     amount_cents is frozen here
          │
          ▼
   payment_provider.initiate
```

### Subjects

| Subject | Amount comes from | Example |
|---|---|---|
| `order` | `order.total_cents` after discounts | Coffee shop checkout |
| `form` | a named field on the submission, or a number on the `base.form` node | Tip jar, donation, “pay what you booked” |
| `preset` | cents stored on the module / page / plugin setting | “Deposit KES 2,000 to hold the chair” |
| `quote` | a plugin `quote` re-run on the server with the posted inputs | Car finance calculator, quantity-break pricing |

The browser never has the last word. A calculator module may show “KES
14,800 / month” in JS; the charge POST sends the *inputs* (price, deposit,
term). The host calls the same `quote` the module used. Mismatch → 422,
no attempt.

```ruby
# Store plugin — a quote is a pure function the host can re-run.
p.quote :car_finance do |inputs, settings|
  principal = inputs.fetch("price_cents").to_i - inputs.fetch("deposit_cents").to_i
  months    = inputs.fetch("term_months").to_i
  rate      = settings["annual_rate"].to_f / 12.0 / 100.0
  payment   = finance_payment(principal, rate, months)
  { amount_cents: payment, currency: inputs.fetch("currency"), label: "#{months} months" }
end
```

A payment plugin stays a rail:

```ruby
p.payment_provider "payhero", PayHero::Provider,
                   label: "M-Pesa",
                   fields: [{ name: "phone", label: "M-Pesa number", type: "tel" }]
```

`PayHero::Provider#initiate` still receives `attempt:` with
`amount_cents` already set. Salon, coffee, cars — same initiate.

### Orders stay the ledger

A charge that is not “a cart of SKUs” still lands on an **order** (one
line, origin `booking` / `quote` / `form`) so receipts, refunds, and
“already paid” stay one code path. Plugins do not invent a second money
table. They invent the *subject that priced the line*.

---

## Filters and events

Two different verbs. Mixing them is how a broken mailer takes down
checkout.

| | Filter | Event |
|---|---|---|
| When | Before commit | After commit |
| May halt the customer? | Yes | No |
| Raising | Treated as halt (filter) or logged (event) | Logged, swallowed |
| Use | “this slot is taken”, “email bounced”, spam | send mail, Slack, import row |

### Filters (halt)

```ruby
p.filter :form.submitting do |ctx|
  # ctx.form_id, ctx.fields, ctx.customer, ctx.halt(message)
  next ctx unless ctx.form_id == "booking"

  unless Bookings.slot_open?(ctx.fields["starts_at"], ctx.fields["service"])
    ctx.halt("That time is no longer free. Pick another.")
  end
  ctx
end
```

Host pipeline for `POST /forms/:id`:

1. Locate the form, honeypot, timing (already in `FormSubmissionIntake`).
2. Run `form.submitting` filters in install order. First `halt` wins —
   nothing is stored, the visitor sees the message.
3. Insert the submission (and, if the form is a charge form, create the
   order line + start payment).
4. Emit `form.submitted`.

A filter that takes more than a few milliseconds belongs on a job, not
here. The host should time-box filters; a timeout is a halt with a
generic error, not a silent pass (fail closed on money and bookings,
fail open on “cc me on this contact form”).

### Events (listen)

```ruby
p.on :form.submitted do |submission|
  Mailer.deliver(
    to: settings["notify_email"],
    subject: "New #{submission.form_id}",
    body: submission.payload,
  )
end

p.on :order.created do |order|
  Mailer.deliver(to: order.email, template: :order_received, order: order)
end

p.on :payment.succeeded do |attempt|
  Bookings.confirm!(attempt.order)
end
```

Core events the host must emit (most are missing today — only
`payment_*` fire):

| Event | Payload | When |
|---|---|---|
| `form.submitted` | submission | After a CMS / store form is stored |
| `form.discarded` | form_id, reason | Honeypot / timing drop |
| `order.created` | order | After `CreateOrder` commits |
| `order.paid` | order | After `Payments.settle` marks paid |
| `payment.initiated` | attempt | Existing `payment_initiated` |
| `payment.succeeded` | attempt | Existing |
| `payment.failed` | attempt | Existing |
| `customer.created` | customer | First identity upsert |
| `plugin.installed` | plugin | After files are on disk and `plugin.rb` loaded |
| `plugin.uninstalled` | id | After files and settings are gone |

Plugin-emitted events are namespaced `plugin.<id>.<name>` so a mailer
cannot pretend to be `order.paid`.

Handlers run after the transaction commits (already true in
`Dukafi::Plugins.emit`). There is no job runner yet; a handler that
calls SMTP on the request is acceptable for v1 if it is wrapped in
rescue. A later `p.job` moves that off the request.

---

## Routes (webhooks in, HTTP out)

Inbound: the host mounts plugin routes under a stable prefix so a
provider dashboard can be configured once.

```ruby
# PayHero callback — anonymous, signed by the unguessable reference.
p.public_post "/webhooks/payhero" do |req|
  result = PayHero::Provider.parse_callback(body: req.json, config: settings.to_h)
  next [404, {}, ["no"]] unless result

  attempt = Payments.find_by_reference(result.reference)
  Payments.settle(attempt, result) if attempt
  [200, {}, ["ok"]]
end
```

Outbound: not a host feature. A mail/WhatsApp plugin uses
`network.outbound` (editor sandbox) or ordinary Ruby `Net::HTTP` in
`plugin.rb`. The host does not proxy arbitrary URLs; that is how you
accidentally build an open relay.

---

## Install, activate, jobs

Yes, a plugin may do several things on install. No, those things may
not run on the storefront request that installed it if they can take
more than a second.

```ruby
p.on_install do |ctx|
  # Fast: create the plugin's storage, seed a “Bookings” table, register
  # default settings. Must be idempotent — install can retry.
  Bookings.ensure_schema!
end

p.on_activate do |ctx|
  # Enable routes, start schedules. Safe to call twice.
end

p.on_uninstall do |ctx|
  # Drop routes. Do not destroy merchant data unless ctx.purge == true.
end

p.job :woo_import, every: "6h" do
  WooImporter.sync!(settings["store_url"], settings["key"])
end
```

The editor SDK already has `install` / `activate` / `migrate` /
`uninstall` on `ServerPluginModule`. Store `plugin.rb` needs the same
four plus `p.job`. A WooCommerce importer is:

- `on_install` → ensure tables
- `on_activate` → enqueue first sync
- `job :woo_import` → pull products into store `Product` rows through
  `CommerceWrites`, never by inserting SQL
- Dashboard page (`p.page`) → stats, a paginated log, **Import now**

A plugin does not get raw `DB[]`. It gets `p.storage.collection("rows")`
or the commerce write services. That is what keeps an importer from
corrupting orders.

---

## Editor: modules, sections, third-party components

The merchant builds the page. The plugin fills the inserter.

### Modules (one block)

`defineModule` — already in the editor SDK. Render is **pure HTML** at
publish time. Optional `js` is one file per module type, loaded only on
pages that contain it.

```ts
export default defineModule({
  id: 'acme.cars.finance',
  name: 'Finance calculator',
  category: 'Commerce',
  defaults: { termMonths: 36, annualRate: 14 },
  schema: {
    termMonths: control.number('Term (months)', { min: 6, max: 72 }),
    annualRate: control.number('APR %'),
  },
  render: ({ props }) => html`
    <form data-dukafy-quote="acme.cars.finance">
      <input name="deposit_cents" type="number" />
      <output data-quote-preview></output>
      <button type="submit">Pay deposit with M-Pesa</button>
    </form>
  `,
  js: calculatorRuntime, // only on pages that include this module
})
```

The JS preview is cosmetic. Submit posts inputs to the host; the host
runs `p.quote :car_finance`.

### Sections (several blocks, ready to drop in)

A `pack` (`definePack`, `visualComponents.register`) ships Visual
Components and optional page templates. On activate they land in the
site’s component library — “Salon hero”, “Service menu”, “Book this
slot”. The merchant inserts them; they are ordinary nodes after that.
Uninstall does not delete pages the merchant already used (those copies
are theirs). The pack is a starting kit, not a live binding.

### Third-party components

Three honesty levels:

| Kind | How | Speed cost |
|---|---|---|
| **Host module** | `defineModule` HTML + optional small JS | Best. Publishes as HTML. |
| **Iframe widget** | module that renders `<iframe src="https://cal.example/...">` | Fine. Third-party JS stays off our origin. |
| **npm runtime** | `dependencies: { three: '^0.169.0' }` + iframe preview | Allowed for editor preview; published page must still be HTML + one module JS file. Do not load React onto the storefront. |

A Calendly-shaped booking UI that we do not control is an iframe
module. A booking UI we own is a host module plus a store filter that
halts when the slot is gone.

---

## Scenarios

### 1. Coffee shop

Core is enough: products, cart, `order` subject, PayHero. Plugin is
only the rail. Optional: `order.created` → “we are grinding your beans”
email.

### 2. Salon (form + payment)

Not a cart of SKUs. It is a form that becomes a paid hold.

- Pack: “Services”, “Book a chair” section (date/time, service select).
- Form `booking` with `attachTo: charge`, amount `preset` from the
  selected service’s price (a plugin storage row, not a product — or a
  product with stock = slots, if you want the catalogue to be the menu).
- Filter `form.submitting`: refuse a taken slot.
- On success: create a one-line order, `Payments.start` with that
  amount, same PayHero rail.
- Event `payment.succeeded`: mark the slot taken, email the stylist.

The payment plugin does not know what a slot is.

### 3. Car dealer (calculator + deposit)

- Product = the car (catalogue, already fast).
- Module `finance calculator` bound to `currentEntry.price`.
- Quote plugin recomputes monthly payment and a deposit.
- Charge subject `quote`, amount = deposit cents.
- After `payment.succeeded`, a sales event (email / WhatsApp plugin).

The calculator is allowed to be JS on the product page because that
page opted into the module. The rest of the site stays static.

### 4. Contact form → email

- No payment.
- Event `form.submitted` where `form_id == "contact"`.
- Mailer plugin settings: `notify_email`, SMTP secret.
- Filter optional: halt if `email` is empty (the form required flag
  should already do this; the filter is for “this domain is blocked”).

### 5. Order → email

- Event `order.created` (receipt) and `order.paid` (fulfilment).
- Same mailer plugin. One plugin, two listeners.

### 6. WooCommerce import

- Settings: store URL, API key (`p.secret`).
- `on_install`: ensure a mapping table in `p.storage`.
- `job :woo_import`: pull products, write through `CommerceWrites`.
- `p.page`: stats (last sync, imported count), paginated log, **Import now**.

A plugin does not invent a second products table. It writes through the
host, and the Dashboard draws the progress page from JSON.

### 7. Blog / messaging

Blog is CMS content (posts table), not a store plugin. A “newsletter”
plugin listens to `content.entry.published` (editor hook bus) and
sends. Messaging (WhatsApp, SMS) is a rail like PayHero: settings +
`p.on :order.paid` + outbound HTTP. It does not sit in the publisher.

---

## Dashboard pages (host chrome, plugin data)

Certain plugins need a page in Dashboard — not a settings form, and not
a React app. Railway usage, a WooCommerce import, a sync log. The UI is
predefined:

| Widget | For |
|---|---|
| **Stat cards** | A number with an optional hint and tone (`default`, `good`, `warn`, `bad`) |
| **Info rows** | A label and a value (project name, last sync, store URL) |
| **Tables** | Paginated rows. The host clamps `limit` (max 100). |
| **Actions** | Buttons the merchant clicks: Refresh, Import now. Optional confirm. |

The plugin declares the layout and later fills it. It never returns HTML.
API keys are `p.secret` settings, not process env, and never appear in
page JSON.

```ruby
Dukafi::Plugins.register("railway-usage") do |p|
  p.name "Railway usage"
  p.secret :api_token, label: "Railway API token"
  p.setting :project_id, label: "Project ID"

  p.page :usage, title: "Railway usage", description: "This project's billable usage." do |page|
    page.stat :used, label: "Used this month"
    page.stat :remaining, label: "Remaining"
    page.info :project, label: "Project"
    page.table :services, label: "Services", columns: [
      { key: "name", label: "Service" },
      { key: "cpu", label: "CPU" },
    ]
    page.action :refresh, label: "Refresh"

    page.load do |ctx|
      usage = Railway.fetch(ctx.settings)
      {
        "stats" => {
          "used" => { "value" => usage.used, "hint" => "of #{usage.included}", "tone" => "default" },
          "remaining" => { "value" => usage.remaining },
        },
        "info" => { "project" => usage.project_name },
      }
    end
    page.rows :services do |ctx|
      rows = Railway.services(ctx.settings)
      { "rows" => rows.drop(ctx.offset).first(ctx.limit), "total" => rows.length }
    end
    page.run :refresh do |_ctx|
      { "ok" => true, "message" => "Updated just now", "reload" => true }
    end
  end
end
```

Admin HTTP (authenticated):

- `GET /admin/api/cms/plugins/:id/pages`
- `GET /admin/api/cms/plugins/:id/pages/:pageId`
- `GET /admin/api/cms/plugins/:id/pages/:pageId/data`
- `GET /admin/api/cms/plugins/:id/pages/:pageId/tables/:tableId?limit=&offset=&q=`
- `POST /admin/api/cms/plugins/:id/pages/:pageId/actions/:actionId` body `{ "params": {} }`

MCP: `read_plugin_page`, `run_plugin_page_action`. Layout is also listed
on `list_plugins` under `pages`.

Handlers are time-boxed. A raising handler becomes a generic error so a
token never leaks in the message. `reload: true` on an action means the
client should fetch cards and tables again.

---

## Package and `plugin.rb` shape

Minimum store plugin:

```ruby
Dukafi::Plugins.register("notify") do |p|
  p.name "Notify"
  p.version "1.0.0"
  p.secret :smtp_password, label: "SMTP password"
  p.setting :notify_email, label: "Send form mail to"

  p.on :form.submitted do |submission|
    Notify.mail(settings["notify_email"], submission)
  end
end
```

Full commerce plugin (salon):

```ruby
Dukafi::Plugins.register("salon") do |p|
  p.name "Salon bookings"
  p.version "1.0.0"

  p.on_install { Salon.ensure_schema! }

  p.filter :form.submitting, &Salon::Intake
  p.quote :booking_price, &Salon::Price
  p.on :payment.succeeded, &Salon::Confirm

  p.public_post "/webhooks/salon-calendar", &Salon::CalendarWebhook
  p.job :expire_holds, every: "15m", &Salon::ExpireHolds
end
```

Editor half of the same product (optional zip / same id):

```ts
export default definePlugin({
  id: 'salon',
  name: 'Salon bookings',
  version: '1.0.0',
  apiVersion: 1,
  permissions: ['modules.register', 'visualComponents.register', 'cms.hooks'],
  entrypoints: { modules: 'modules/index.js' },
  pack: { path: 'pack/site.json' },
})
```

The merchant installs **one** listing from the registry. The archive
may contain `plugin.rb` and the editor pack together. The store loads
Ruby; the editor loads modules. Same id, one configure form.

---

## Host checklist (what to build)

Exists today:

- Settings, payment rails, `normalize_amount`
- `payment_initiated` / `succeeded` / `failed`
- Form intake (store `FormSubmissionIntake`, CMS-native forms)
- Editor: modules, packs, hooks, public routes, install lifecycle, jobs
- Registry install of a `.tar.gz`
- **Dashboard pages** — `p.page` layout + JSON data/actions (HTTP + MCP)

Missing, in the order that unblocks the scenarios:

1. **Charge subjects** — `Payments.start` takes a resolved amount, not
   only `order.total_cents`. Form/preset/quote resolvers.
2. **Core events** — `form.submitted`, `order.created`, `order.paid`.
3. **Filters** — `form.submitting` with `halt`. Time-boxed.
4. **Store lifecycle** — `on_install` / `on_activate` / `on_uninstall`.
5. **Store public routes** — prefix `/plugins/:id/...` for webhooks.
6. **Quotes** — register + re-run on POST; never trust client amounts.
7. **Jobs** — first-class, off the request (even a Puma timer is enough).
8. **Unified package** — registry archive with `plugin.rb` + editor pack.

Non-goals:

- Letting a payment plugin pick the amount.
- Running QuickJS on checkout.
- A generic “plugin can alter any SQL”.
- A plugin shipping its own Dashboard React tree. Stats, tables, actions
  are host widgets filled with JSON.
- Shipping blog, chat, or SMTP in the image. Those are plugins.

---

## Speed rules (non-negotiable)

1. If it can be HTML at publish time, it is. Modules render HTML.
2. JS on the storefront is per-module, opt-in, one file, no framework.
3. Filters on `form.submitting` / charge resolve in milliseconds or they
   halt.
4. Events never fail the visitor. Mail goes out after commit.
5. Install/import/sync is a job. The install HTTP response is “queued”.
6. Third-party widgets are iframes or host HTML. They are not a second
   React tree on the published page.

That is how a coffee shop, a salon, and a car lot share one rails
plugin and stay fast.
