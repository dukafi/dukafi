require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# End to end, with NO Dukafy-supplied UI anywhere: the merchant builds a form
# out of base primitives, puts a plain button in it carrying `cart.createOrder`,
# and that is checkout.
class CheckoutFlowSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafy.app

  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    clear_cookies
    SiteState.create(site: JSON.generate({ "name" => "S", "settings" => {}, "styleRules" => {} }))
    product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    @variant = Variant.create(
      product_id: product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
      currency: "USD", stock: 5, position: 0
    )
  end

  def node(id, module_id, children: [], props: {}, extra: {})
    { "id" => id, "moduleId" => module_id, "children" => children, "props" => props,
      "classIds" => [], "breakpointOverrides" => {} }.merge(extra)
  end

  # A merchant's own checkout page: a form, two inputs they chose, and a button.
  def checkout_document
    {
      "id" => "co", "slug" => "checkout", "title" => "Checkout", "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", children: %w[form]),
        # Editor prop names — `mode`/`inputType`, exactly what the canvas emits.
        "form" => node("form", "base.form", children: %w[email phone submit],
                       props: { "mode" => "custom", "action" => "", "method" => "post" }),
        "email" => node("email", "base.input",
                        props: { "inputType" => "email", "fieldId" => "email", "placeholder" => "Email" }),
        "phone" => node("phone", "base.input",
                        props: { "inputType" => "tel", "fieldId" => "phone", "placeholder" => "Phone" }),
        "submit" => node("submit", "base.button", props: { "label" => "Place order", "href" => "" },
                         extra: { "actions" => { "click" => { "type" => "cart.createOrder",
                                                              "redirect" => "/thank-you" } } }),
      },
    }
  end

  def publish!(document)
    json = JSON.generate(document)
    Page.create(slug: document.fetch("slug"), title: "T", kind: "page",
                status: "published", document: json, published_document: json)
  end

  def test_the_rendered_checkout_is_plain_html_wired_to_the_order_api
    publish!(checkout_document)
    result = Dukafy::Publisher::RenderPage.call(
      document: Page.first.published_document_data,
      registry: Dukafy::Publisher::REGISTRY, prefetched: {}
    )

    # An ordinary form with the merchant's own fields.
    assert_includes result.html, 'method="post"'
    assert_includes result.html, 'name="email"'
    assert_includes result.html, 'type="email"'
    assert_includes result.html, 'name="phone"'
    assert_includes result.html, 'type="tel"'
    # The button is wired to the order API and submits its surrounding form,
    # so the field list is the merchant's, not ours.
    assert_includes result.html, 'hx-post="/fragments/cart/order"'
    assert_includes result.html, 'hx-include="closest form"'
    assert_includes result.html, "thank-you"
    # htmx is pulled in because this page needs it.
    assert_includes result.runtimes, :htmx
    # No Dukafy checkout component anywhere.
    refute_includes result.html, "dukafy-checkout"
  end

  def test_posting_that_form_places_a_real_order
    publish!(checkout_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    # Exactly what the rendered button submits: the form's own fields.
    post "/fragments/cart/order", email: "buyer@example.com", phone: "", redirect: "/thank-you"

    assert_equal 200, last_response.status, last_response.body
    assert_equal "/thank-you", last_response.headers["hx-redirect"]
    order = Order.first
    assert_equal 27_900, order.total_cents
    assert_equal "buyer@example.com", order.email
    assert_equal 1, OrderItem.where(order_id: order.id).count
    assert_equal 3, Variant[@variant.id].stock
    assert_equal 1, Customer.count
  end

  def test_a_merchant_can_collect_whatever_identity_they_want
    # Same API, phone-only form — no schema change, no Dukafy opinion.
    publish!(checkout_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"

    post "/fragments/cart/order", phone: "+254 712 345 678"

    assert_equal 200, last_response.status, last_response.body
    assert_equal "+254712345678", Order.first.phone
    assert_nil Order.first.email
  end
end
