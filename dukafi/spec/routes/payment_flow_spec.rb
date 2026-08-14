require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# A payment page the MERCHANT designed: their form, their phone field, their
# button, their status text. Dukafi supplies verbs and data, no components.
class PaymentFlowSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    PaymentAttempt.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    PluginSetting.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    clear_cookies
    SiteState.create(site: JSON.generate({ "name" => "S", "settings" => {}, "styleRules" => {} }))
    Dukafi::Plugins.find("fake_payments").settings[:endpoint] = "https://example.test"
    @order = Order.create(
      email: "buyer@example.com", status: "pending", currency: "USD",
      subtotal_cents: 27_900, discount_cents: 0, shipping_cents: 0, total_cents: 27_900,
      public_token: "order-token", created_at: Time.now, updated_at: Time.now
    )
  end

  def node(id, module_id, children: [], props: {}, extra: {})
    { "id" => id, "moduleId" => module_id, "children" => children, "props" => props,
      "classIds" => [], "breakpointOverrides" => {} }.merge(extra)
  end

  def payment_document
    {
      "id" => "pay", "slug" => "pay", "title" => "Pay", "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", children: %w[region]),
        # The merchant marks THIS container as the live payment area.
        "region" => node("region", "base.container", children: %w[form status],
                         props: { "tag" => "div" },
                         extra: { "actions" => { "region" => "payment" } }),
        "form" => node("form", "base.form", children: %w[phone pay],
                       props: { "mode" => "custom", "action" => "", "method" => "post" }),
        "phone" => node("phone", "base.input",
                        props: { "inputType" => "tel", "fieldId" => "phone", "placeholder" => "07…" }),
        "pay" => node("pay", "base.button", props: { "label" => "Pay by M-Pesa", "href" => "" },
                      extra: { "actions" => { "click" => { "type" => "payment.initiate",
                                                           "provider" => "fake" } } }),
        # Their own status line, bound to the payment frame.
        "status" => node("status", "base.text", props: { "text" => "—", "tag" => "p" },
                         extra: { "dynamicBindings" => {
                           "text" => { "source" => "payment", "field" => "status" } } }),
      },
    }
  end

  def publish!(document)
    json = JSON.generate(document)
    Page.create(slug: document.fetch("slug"), title: "T", kind: "page",
                status: "published", document: json, published_document: json)
  end

  def start_checkout_session
    # Puts `order_token` in the session the way checkout does.
    post "/fragments/cart/order", email: "x@example.com"
    Order.exclude(id: @order.id).delete
  end

  def test_the_baked_page_wires_the_merchants_button_to_the_payment_api
    publish!(payment_document)
    result = Dukafi::Publisher::RenderPage.call(
      document: Page.first.published_document_data,
      registry: Dukafi::Publisher::REGISTRY, prefetched: {}
    )

    assert_includes result.html, 'data-dukafy-payment="region"'
    assert_includes result.html, 'hx-post="/fragments/payment/initiate"'
    # The button swaps the region it lives in, and submits the merchant's form.
    assert_includes result.html, 'hx-target="closest [data-dukafy-payment]"'
    assert_includes result.html, 'hx-include="closest form"'
    # hx-vals is escaped inside the attribute, as it must be.
    assert_includes result.html, "&quot;provider&quot;:&quot;fake&quot;"
    assert_includes result.html, "&quot;node&quot;:&quot;region&quot;"
    # No cart/payment data is baked into a page served from disk.
    refute_includes result.html, "hx-get=\"/fragments/payment/status"
  end

  def test_initiating_swaps_in_the_merchants_own_region_and_starts_polling
    publish!(payment_document)

    post "/fragments/payment/initiate", provider: "fake", node: "region",
                                        order_token: "order-token", phone: "0712345678"

    assert_equal 200, last_response.status, last_response.body
    # The merchant's bound status node, filled from the payment frame.
    assert_includes last_response.body, "<p>processing</p>"
    # In flight, so the region watches itself — a lost callback still resolves.
    assert_includes last_response.body, "/fragments/payment/status"
    assert_equal "processing", PaymentAttempt.first.status
    assert_equal "pending", Order[@order.id].status
  end

  def test_polling_settles_the_attempt_and_stops_watching
    publish!(payment_document)
    post "/fragments/payment/initiate", provider: "fake", node: "region",
                                        order_token: "order-token", outcome: "poll_succeeds"
    attempt = PaymentAttempt.first

    get "/fragments/payment/status", node: "region", ref: attempt.reference

    assert_equal 200, last_response.status
    assert_includes last_response.body, "<p>succeeded</p>"
    # Terminal: no further polling wiring.
    refute_includes last_response.body, "hx-get"
    assert_equal "dukafi:payment-succeeded", last_response.headers["hx-trigger"]
    assert_equal "paid", Order[@order.id].status
  end

  def test_a_provider_callback_settles_the_order
    publish!(payment_document)
    post "/fragments/payment/initiate", provider: "fake", node: "region", order_token: "order-token"
    attempt = PaymentAttempt.first

    post "/payments/fake/callback/#{attempt.reference}",
         JSON.generate({ status: "ok", receipt: "SAE3YULR0Y", provider_reference: "ws_CO_1" }),
         "CONTENT_TYPE" => "application/json"

    assert_equal 200, last_response.status, last_response.body
    assert_equal "succeeded", PaymentAttempt[attempt.id].status
    assert_equal "SAE3YULR0Y", PaymentAttempt[attempt.id].receipt
    assert_equal "paid", Order[@order.id].status
  end

  def test_a_callback_with_the_wrong_reference_or_provider_reveals_nothing
    publish!(payment_document)
    post "/fragments/payment/initiate", provider: "fake", node: "region", order_token: "order-token"
    attempt = PaymentAttempt.first

    post "/payments/fake/callback/not-a-real-reference", JSON.generate({ status: "ok" }),
         "CONTENT_TYPE" => "application/json"
    assert_equal 404, last_response.status

    # Right reference, wrong provider — same 404, so probing learns nothing.
    post "/payments/stripe/callback/#{attempt.reference}", JSON.generate({ status: "ok" }),
         "CONTENT_TYPE" => "application/json"
    assert_equal 404, last_response.status

    assert_equal "processing", PaymentAttempt[attempt.id].status
    assert_equal "pending", Order[@order.id].status
  end

  def test_a_callback_claiming_the_wrong_amount_cannot_buy_the_order
    publish!(payment_document)
    post "/fragments/payment/initiate", provider: "fake", node: "region", order_token: "order-token"
    attempt = PaymentAttempt.first

    post "/payments/fake/callback/#{attempt.reference}",
         JSON.generate({ status: "ok", amount_cents: 100 }), "CONTENT_TYPE" => "application/json"

    assert_equal "failed", PaymentAttempt[attempt.id].status
    assert_equal "pending", Order[@order.id].status
  end

  def test_paying_without_an_order_is_refused
    publish!(payment_document)

    post "/fragments/payment/initiate", provider: "fake", node: "region"

    assert_equal 422, last_response.status
    assert_equal 0, PaymentAttempt.count
  end

  def test_an_unconfigured_provider_tells_the_customer_something_useful
    PluginSetting.dataset.delete
    publish!(payment_document)

    post "/fragments/payment/initiate", provider: "fake", node: "region", order_token: "order-token"

    assert_equal 422, last_response.status
    assert_includes last_response.body, "set up"
  end
end
