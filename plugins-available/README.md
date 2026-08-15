# Plugins available for Dukafi

These are **not** part of the Dukafi image. Nothing here is loaded unless an
operator installs it.

A store ships with no payment providers at all. That is deliberate: a merchant
in Berlin should not have a Kenyan M-Pesa gateway in their admin because the
image happened to contain one, and "install a plugin" should not mean "rebuild
the image".

## Installing one

Copy the directory into the store's plugins root and restart:

    cp -r plugins-available/payhero /data/plugins/

The root is `DUKAFI_PLUGINS_ROOT`, defaulting to `<storage root>/plugins` — in
a container that is on the mounted volume, so an installed plugin survives the
next deploy. Configure it from **Dashboard → Plugins**, or over MCP with
`configure_plugin`.

## What is here

| Directory | What it is |
|---|---|
| `payhero` | PayHero (Kenya) — M-Pesa STK push. |
| `fake_payments` | A provider that succeeds or fails on command. For testing a checkout without moving money. |
| `ai` | Model settings for the editor's AI features. |

## Writing your own

One file, `plugin.rb`, in a directory named after the plugin:

```ruby
Dukafi::Plugins.register("stripe") do |p|
  p.name "Stripe"
  p.version "1.0.0"
  p.secret :api_key, label: "Secret key"
  p.setting :callback_base_url, label: "Public site URL"
  p.payment_provider "stripe", Stripe::Provider,
                     label: "Card",
                     fields: [{ name: "email", label: "Email", type: "email" }]
end
```

A payment provider implements three verbs — `initiate`, `poll`,
`parse_callback` — and optionally `normalize_amount` for rails that cannot take
arbitrary precision. `label` and `fields` are what let a storefront offer the
provider without naming it: pages loop `paymentProviders` and render whatever
is configured.

Nothing in Dukafi's core knows any provider's name.
