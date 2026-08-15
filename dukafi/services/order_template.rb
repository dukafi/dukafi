# The page `/orders/<token>` renders — one order, as the customer sees it.
#
# Same shape as `CollectionTemplate` and `ProductTemplate`: one template page
# stands in for every order, with the order in scope as `currentEntry`. What
# is different is that an order page is NEVER baked. A collection page is the
# same for everyone and can be written to disk once; an order belongs to one
# person and is rendered per request, behind the session check in
# `Storefront#live_order`.
#
# The seeded document is the default checkout ending: what was bought, what it
# cost, and — when the order is still unpaid — a payment region with a phone
# field and a pay button. A merchant is expected to restyle it; the point is
# that the flow works before they touch anything.
class OrderTemplate
  SLUG = "order-template".freeze

  def self.find
    Page.where(kind: "template").order(:id).all.find do |page|
      page.slug == SLUG || page.document_data.dig("template", "target", "tableSlugs")&.include?("orders")
    end
  end

  def self.ensure!
    find || Page.create(slug: SLUG, title: "Order template", kind: "template",
                        status: "draft",
                        # Names → class ids, or the template publishes unstyled.
                        document: SiteStyleRules.resolve_document!(document))
  end

  def self.node(id, module_id, children = [], props = {}, extra = {})
    {
      "id" => id, "moduleId" => module_id, "props" => props,
      "breakpointOverrides" => {}, "children" => children, "classIds" => [],
    }.merge(extra)
  end

  # `{currentEntry.field}` in a text prop rather than a dynamic binding: the
  # token form composes with static words ("Order #12" / "Placed 3 August"),
  # which a binding replacing the whole value cannot do.
  # `extra` carries `visibleWhen` / `actions` — the payment states are text
  # nodes that appear only in one condition, so a text helper without it
  # forces those back to raw hashes.
  def self.text(id, tag, template, classes = [], extra = {})
    node(id, "base.text", [], { "tag" => tag, "text" => template },
         { "classIds" => classes }.merge(extra))
  end

  def self.document
    {
      "id" => "order-template", "slug" => SLUG, "title" => "Order template",
      "rootNodeId" => "order-body",
      "nodes" => {
        "order-body" => node("order-body", "base.body", %w[order-main]),
        "order-main" => node("order-main", "base.container",
                             %w[order-number order-meta order-paid order-lines order-totals order-payment],
                             {}, { "classIds" => %w[mx-auto max-w-2xl p-8 flex flex-col gap-6] }),
        "order-number" => text("order-number", "h1", "Order {currentEntry.number}", %w[text-3xl font-bold]),
        "order-meta" => text("order-meta", "p", "{currentEntry.statusLabel} · {currentEntry.date}", %w[text-gray-600]),

        # The receipt, once there is one. Shown from the ORDER rather than the
        # payment region, so it survives a reload — the region only knows about
        # an attempt made in this page view, and a customer coming back
        # tomorrow to check would otherwise see nothing at all.
        "order-paid" => node("order-paid", "base.container", %w[paid-title paid-detail], {},
                             { "classIds" => %w[flex flex-col gap-1 rounded-xl border border-green-200
                                                bg-green-50 p-4],
                               "visibleWhen" => { "source" => "currentEntry", "field" => "paymentReceipt",
                                                  "operator" => "isNotEmpty" } }),
        "paid-title" => text("paid-title", "p", "Payment received",
                             %w[text-sm font-semibold text-green-800]),
        "paid-detail" => text("paid-detail", "p",
                              "{currentEntry.paymentAmountDisplay} · receipt {currentEntry.paymentReceipt} · {currentEntry.paidOn}",
                              %w[text-xs text-green-700]),

        # One row per line. `currentEntry.lines` is a list field of the order
        # in scope, so this is an ordinary nested loop.
        "order-lines" => node("order-lines", "store.relationship-loop", %w[order-line],
                              { "source" => "currentEntry.lines", "perPage" => 50 },
                              { "classIds" => %w[flex flex-col gap-3] }),
        "order-line" => node("order-line", "base.container", %w[line-title line-total], {},
                             { "classIds" => %w[flex items-center justify-between border-b border-gray-100 pb-3] }),
        "line-title" => text("line-title", "p", "{currentEntry.title} × {currentEntry.quantity}"),
        "line-total" => text("line-total", "p", "{currentEntry.linePriceDisplay}", %w[font-medium]),

        "order-totals" => node("order-totals", "base.container", %w[total-line], {},
                               { "classIds" => %w[flex items-center justify-between pt-2] }),
        "total-line" => text("total-line", "p", "Total {currentEntry.totalDisplay}", %w[text-xl font-bold]),

        # The payment region. `payment.*` bindings resolve only inside one, and
        # the fragment endpoint swaps this very node — which is why it is
        # marked rather than being a module.
        "order-payment" => node("order-payment", "base.container", %w[pay-form pay-done pay-waiting pay-status], {},
                                { "classIds" => %w[flex flex-col gap-3 pt-4],
                                  "actions" => { "region" => "payment" } }),
        # Props stated rather than left to defaults. A node authored without
        # them renders on the storefront (Ruby fills defaults) but reaches the
        # editor with `undefined` where a string was promised — which is how a
        # seeded template took the canvas down with "Render failed in
        # node-renderer".
        # One block per CONFIGURED payment method, not one hardcoded provider.
        #
        # An earlier version of this template said "Pay with M-Pesa" and named
        # `payhero` on the button, which would have been wrong for the first
        # merchant to install anything else. The loop asks the store what it
        # has; each provider supplies its own label and the fields it needs.
        "pay-form" => node("pay-form", "base.form", %w[pay-methods],
                           { "mode" => "custom", "formId" => "order-payment",
                             "method" => "post", "action" => "",
                             "successBehavior" => "message", "successMessage" => "",
                             "redirectUrl" => "", "htmlAttributes" => {} },
                           { "classIds" => %w[flex flex-col gap-3],
                             # Nothing left to pay: an payment prompt for a
                             # settled order is worse than no button.
                             "visibleWhen" => { "source" => "currentEntry", "field" => "isAwaitingPayment",
                                                "operator" => "isTrue" } }),
        "pay-methods" => node("pay-methods", "store.relationship-loop", %w[pay-method],
                              { "source" => "paymentProviders", "perPage" => 10 },
                              { "classIds" => %w[flex flex-col gap-3] }),
        "pay-method" => node("pay-method", "base.container", %w[pay-fields pay-button], {},
                             { "classIds" => %w[flex flex-col gap-2] }),
        # The provider's own inputs — a phone number for an STK push, nothing
        # at all for a hosted checkout that collects its own.
        "pay-fields" => node("pay-fields", "store.relationship-loop", %w[pay-field],
                             { "source" => "currentEntry.fields", "perPage" => 10 },
                             { "classIds" => %w[flex flex-col gap-2] }),
        "pay-field" => node("pay-field", "base.input", [],
                            { "name" => "field", "placeholder" => "", "label" => "",
                              "type" => "text", "fieldId" => "field",
                              "required" => false, "htmlAttributes" => {} },
                            { "classIds" => %w[rounded-md border border-gray-300 px-3 py-2],
                              "dynamicBindings" => {
                                "name" => { "source" => "currentEntry", "field" => "name",
                                            "format" => "plain", "fallback" => "static" },
                                "label" => { "source" => "currentEntry", "field" => "label",
                                             "format" => "plain", "fallback" => "static" },
                                "type" => { "source" => "currentEntry", "field" => "type",
                                            "format" => "plain", "fallback" => "static" },
                                "placeholder" => { "source" => "currentEntry", "field" => "placeholder",
                                                   "format" => "plain", "fallback" => "empty" },
                              } }),
        # No `provider` on the action: the entry in scope supplies it, so this
        # one button works for every installed method.
        "pay-button" => node("pay-button", "base.button", [],
                            { "label" => "Pay", "href" => "", "target" => "_self",
                              "disabled" => false, "buttonType" => "button", "htmlAttributes" => {} },
                             { "classIds" => %w[rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white
                                                transition hover:bg-gray-700],
                               "actions" => { "click" => { "type" => "payment.initiate" } },
                               "dynamicBindings" => {
                                 "label" => { "source" => "currentEntry", "field" => "payLabel",
                                              "format" => "plain", "fallback" => "static" },
                               } }),

        # Written by the payment fragment as the attempt moves.
        #
        # Two nodes, because `payment.message` carries only the FAILURE text —
        # on success it is blank, which is how a completed payment came to show
        # nothing at all. The success line reads from fields that are populated
        # when it works.
        "pay-done" => text("pay-done", "p",
                           "Paid — reference {payment.receipt}",
                           %w[text-sm font-semibold text-green-700],
                           { "visibleWhen" => { "source" => "payment", "field" => "succeeded",
                                                "operator" => "isTrue" } }),
        "pay-waiting" => text("pay-waiting", "p",
                              "Waiting for your payment to be confirmed…",
                              %w[text-sm text-gray-600],
                              { "visibleWhen" => { "source" => "payment", "field" => "status",
                                                   "operator" => "equals", "value" => "pending" } }),
        "pay-status" => text("pay-status", "p", "{payment.message}", %w[text-sm text-red-600]),
      },
      "template" => { "enabled" => true, "target" => { "kind" => "postTypes", "tableSlugs" => ["orders"] },
                      "priority" => 0 },
    }
  end
end
