require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# The composable cart: Dukafy ships NO cart markup. A merchant builds the cart
# out of plain nodes bound to CartPayload fields, and this endpoint re-renders
# that same subtree with the visitor's live cart.
class CartLinesSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafy.app
  end

  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    Discount.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    clear_cookies
    SiteState.create(site: JSON.generate({ "name" => "S", "settings" => {}, "styleRules" => {} }))
    @product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    @variant = Variant.create(
      product_id: @product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
      currency: "USD", stock: 5, position: 0
    )
  end

  # A merchant-authored cart: a loop whose single child is a plain container
  # "row" holding two bound text nodes. One child per loop is the established
  # pattern — the loop round-robins its children across items, so a multi-field
  # row must be wrapped in one container. Nothing here is a Dukafy component.
  def cart_document(relationship: "cartItems")
    {
      "id" => "cart-page", "slug" => "cart", "title" => "Cart",
      "rootNodeId" => "body",
      "nodes" => {
        "body" => { "id" => "body", "moduleId" => "base.body", "children" => ["loop"],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "loop" => {
          "id" => "loop", "moduleId" => "store.relationship-loop", "children" => %w[row],
          "props" => { "relationship" => relationship, "perPage" => 20 },
          "classIds" => [], "breakpointOverrides" => {},
        },
        "row" => {
          "id" => "row", "moduleId" => "base.container", "children" => %w[title total],
          "props" => { "tag" => "div" }, "classIds" => [], "breakpointOverrides" => {},
        },
        "title" => {
          "id" => "title", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "text" => "fallback", "tag" => "p" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title" } },
        },
        "total" => {
          "id" => "total", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "text" => "fallback", "tag" => "p" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "linePriceDisplay" } },
        },
      },
    }
  end

  def publish_page!(document)
    json = JSON.generate(document)
    Page.create(
      slug: "cart", title: "Cart", kind: "page", status: "published",
      document: json, published_document: json
    )
  end

  def test_baked_page_emits_a_placeholder_and_never_cart_contents
    publish_page!(cart_document)
    document = Page.first.published_document_data
    result = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}
    )

    assert_includes result.html, 'hx-get="/fragments/cart/lines?node=loop"'
    assert_includes result.runtimes, :htmx
    # The baked file is served from disk to everyone — it must carry no cart.
    refute_includes result.html, "Canvas Bag"
    refute_includes result.html, "$"
  end

  def test_fragment_renders_the_merchants_own_nodes_with_live_cart_data
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    get "/fragments/cart/lines", node: "loop"

    assert_equal 200, last_response.status
    assert_equal "no-store", last_response.headers.fetch("cache-control")
    # The merchant's bound <p> nodes, filled from CartPayload.
    assert_includes last_response.body, "<p>Canvas Bag</p>"
    assert_includes last_response.body, "<p>$279.00</p>"
  end

  def test_fragment_is_empty_for_a_visitor_with_no_cart
    publish_page!(cart_document)

    get "/fragments/cart/lines", node: "loop"

    assert_equal 200, last_response.status
    refute_includes last_response.body, "Canvas Bag"
    assert_equal 0, Cart.count
  end

  def test_fragment_refuses_a_node_that_is_not_a_cart_loop
    # Same node id, but a products loop — must not be renderable through the
    # cart endpoint.
    publish_page!(cart_document(relationship: "products"))

    get "/fragments/cart/lines", node: "loop"

    assert_equal 404, last_response.status
  end

  def test_fragment_refuses_unknown_unsafe_and_draft_only_nodes
    get "/fragments/cart/lines", node: "nope"
    assert_equal 404, last_response.status

    get "/fragments/cart/lines", node: "../../etc/passwd"
    assert_equal 404, last_response.status

    # Draft content is not public — a cart loop that was never published
    # must not be reachable.
    draft = cart_document
    draft["id"] = "draft-page"
    draft["slug"] = "draft-cart"
    Page.create(slug: "draft-cart", title: "Draft", kind: "page", status: "draft",
                document: JSON.generate(draft))
    get "/fragments/cart/lines", node: "loop"
    assert_equal 404, last_response.status
  end

  # ---------------------------------------------------------------------
  # Mutation API — the endpoints a merchant's own buttons post to.
  # Dukafy ships no stepper or remove button; it ships these verbs.
  # ---------------------------------------------------------------------

  def add_to_cart(quantity: 2)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: quantity.to_s
  end

  # A quantity change re-renders ONE row, not the whole list, and announces
  # itself as a LINE update — `dukafy:cart-updated` would make the lines loop
  # re-fetch itself wholesale and undo the targeted swap.
  def test_update_sets_an_exact_quantity_and_rerenders_only_that_line
    publish_page!(cart_document)
    add_to_cart(quantity: 2)

    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "3", node: "loop"

    assert_equal 200, last_response.status
    assert_equal "dukafy:cart-line-updated", last_response.headers.fetch("hx-trigger")
    assert_equal 3, CartItem.first.quantity
    # Absolute, not a delta — and the response is the merchant's own markup.
    assert_includes last_response.body, "<p>$418.50</p>" # 3 x 139.50
    # One row, carrying its own key — not the enclosing loop.
    assert_includes last_response.body, 'data-dukafy-cart-line="BAG-L"'
    refute_includes last_response.body, "dukafy-collection-loop"
  end

  def test_update_to_zero_removes_the_line
    publish_page!(cart_document)
    add_to_cart

    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "0", node: "loop"

    assert_equal 200, last_response.status
    assert_equal 0, CartItem.count
  end

  def test_update_refuses_more_than_stock_and_invalid_quantities
    publish_page!(cart_document)
    add_to_cart

    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "99"
    assert_equal 409, last_response.status
    assert_includes last_response.body, "Only 5 available."

    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "-1"
    assert_equal 422, last_response.status

    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "abc"
    assert_equal 422, last_response.status

    # Nothing above may have changed the cart.
    assert_equal 2, CartItem.first.quantity
  end

  def test_remove_deletes_the_line_and_fires_the_update_event
    publish_page!(cart_document)
    add_to_cart

    post "/fragments/cart/items/remove", variant_sku: "BAG-L", node: "loop"

    assert_equal 200, last_response.status
    assert_equal "dukafy:cart-line-updated", last_response.headers.fetch("hx-trigger")
    assert_equal 0, CartItem.count
    # Empty body: an outerHTML swap with nothing in it deletes the row, which
    # is exactly what "this line is gone" should do to the DOM.
    assert_empty last_response.body
  end

  def test_mutations_only_touch_the_callers_own_cart
    publish_page!(cart_document)
    add_to_cart # session A

    # A different visitor cannot mutate A's line by guessing the SKU — SKUs
    # are public, so the lookup must be scoped to the caller's own cart.
    clear_cookies
    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "1"
    assert_equal 404, last_response.status

    post "/fragments/cart/items/remove", variant_sku: "BAG-L"
    assert_equal 404, last_response.status

    assert_equal 1, CartItem.count
    assert_equal 2, CartItem.first.quantity
  end

  def test_mutations_work_without_a_node_returning_just_the_event
    publish_page!(cart_document)
    add_to_cart

    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "1"

    assert_equal 200, last_response.status
    assert_equal "dukafy:cart-line-updated", last_response.headers.fetch("hx-trigger")
    assert_equal 1, CartItem.first.quantity
  end

  # ---------------------------------------------------------------------
  # Action overlay — plain nodes wired to cart verbs.
  # ---------------------------------------------------------------------

  def cart_document_with_actions
    document = cart_document
    document["nodes"]["row"]["children"] = %w[title total remove plus]
    document["nodes"]["remove"] = {
      "id" => "remove", "moduleId" => "base.button", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "label" => "Remove", "href" => "" },
      "actions" => { "click" => { "type" => "cart.removeItem" } },
    }
    document["nodes"]["plus"] = {
      "id" => "plus", "moduleId" => "base.button", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "label" => "+", "href" => "" },
      "actions" => { "click" => { "type" => "cart.setQuantity", "delta" => 1 } },
    }
    document
  end

  def test_a_plain_button_becomes_a_cart_control_carrying_its_own_line_sku
    publish_page!(cart_document_with_actions)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    get "/fragments/cart/lines", node: "loop"

    # Still an ordinary <button> the merchant styled — just wired up.
    assert_includes last_response.body, "<button"
    assert_includes last_response.body, "Remove"
    assert_includes last_response.body, 'hx-post="/fragments/cart/items/remove"'
    # The SKU is filled from the loop iteration — a merchant could not have
    # hand-written "this line's SKU" into htmlAttributes.
    assert_includes last_response.body, "BAG-L"
    assert_includes last_response.body, 'hx-post="/fragments/cart/items/update"'
  end

  def test_a_wired_button_actually_drives_the_endpoint_end_to_end
    publish_page!(cart_document_with_actions)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    # Replay what the rendered button posts.
    post "/fragments/cart/items/update", variant_sku: "BAG-L", delta: "1", node: "loop"
    assert_equal 200, last_response.status
    assert_equal 3, CartItem.first.quantity

    post "/fragments/cart/items/update", variant_sku: "BAG-L", delta: "-1", node: "loop"
    assert_equal 2, CartItem.first.quantity

    post "/fragments/cart/items/remove", variant_sku: "BAG-L", node: "loop"
    assert_equal 0, CartItem.count
  end

  def test_a_delta_stepping_below_zero_is_refused_not_silently_clamped
    publish_page!(cart_document_with_actions)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"

    post "/fragments/cart/items/update", variant_sku: "BAG-L", delta: "-5"

    assert_equal 422, last_response.status
    assert_equal 1, CartItem.first.quantity
  end

  def test_a_cart_action_outside_a_cart_loop_renders_inert
    # Same button, but not inside a cartItems loop — there is no line to act
    # on, so it must NOT emit a request that could never resolve a target.
    document = cart_document
    document["nodes"]["body"]["children"] = %w[loop stray]
    document["nodes"]["stray"] = {
      "id" => "stray", "moduleId" => "base.button", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "label" => "Remove", "href" => "" },
      "actions" => { "click" => { "type" => "cart.removeItem" } },
    }
    publish_page!(document)

    result = Dukafy::Publisher::RenderPage.call(
      document: Page.first(slug: "cart").published_document_data,
      registry: Dukafy::Publisher::REGISTRY, prefetched: {},
      cart: CartPayload.call(nil)
    )

    assert_includes result.html, "Remove"
    refute_includes result.html, "items/remove"
  end

  # ---------------------------------------------------------------------
  # Discount codes — session-applied, re-validated on every render.
  # ---------------------------------------------------------------------

  def make_discount(code:, kind: "percentage", value: 10, starts_at: Time.now - 3600,
                    ends_at: nil, usage_limit: nil, usage_count: 0)
    Discount.create(
      code: code, kind: kind, value: value, starts_at: starts_at, ends_at: ends_at,
      usage_limit: usage_limit, usage_count: usage_count,
      created_at: Time.now, updated_at: Time.now
    )
  end

  def subtotal_document
    document = cart_document
    document["nodes"]["body"]["children"] = %w[loop discount total]
    document["nodes"]["discount"] = {
      "id" => "discount", "moduleId" => "base.text", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "text" => "-", "tag" => "p" },
      "dynamicBindings" => { "text" => { "source" => "cart", "field" => "discountDisplay" } },
    }
    document["nodes"]["total"] = {
      "id" => "total-line", "moduleId" => "base.text", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "text" => "-", "tag" => "p" },
      "dynamicBindings" => { "text" => { "source" => "cart", "field" => "totalDisplay" } },
    }
    document
  end

  def test_applying_a_code_discounts_the_cart_total
    Discount.dataset.delete
    make_discount(code: "SAVE10", kind: "percentage", value: 10)
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    post "/fragments/cart/discount", code: "save10", node: "loop"
    assert_equal 200, last_response.status

    payload = CartPayload.call(Cart.first, discount_code: "SAVE10").fetch("cart")
    assert_equal "SAVE10", payload.fetch("discountCode")
    assert_equal 2_790, payload.fetch("discountCents")   # 10% of 279.00
    assert_equal 25_110, payload.fetch("totalCents")
  end

  def test_an_invalid_code_is_refused_and_not_stored
    Discount.dataset.delete
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"

    post "/fragments/cart/discount", code: "NOPE", node: "loop"

    assert_equal 422, last_response.status
    assert_includes last_response.body, "isn’t valid"

    # The rejected code must not linger in the session.
    get "/fragments/cart/lines", node: "loop"
    assert_equal 200, last_response.status
  end

  def test_removing_a_code_restores_the_full_total
    Discount.dataset.delete
    make_discount(code: "SAVE10")
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"
    post "/fragments/cart/discount", code: "SAVE10", node: "loop"

    post "/fragments/cart/discount/remove", node: "loop"

    assert_equal 200, last_response.status
    assert_equal "dukafy:cart-updated", last_response.headers.fetch("hx-trigger")
    payload = CartPayload.call(Cart.first).fetch("cart")
    assert_equal "", payload.fetch("discountCode")
    assert_equal 27_900, payload.fetch("totalCents")
  end

  def test_a_code_that_expires_mid_session_drops_silently_instead_of_erroring
    Discount.dataset.delete
    discount = make_discount(code: "SAVE10")
    publish_page!(subtotal_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"
    post "/fragments/cart/discount", code: "SAVE10", node: "loop"

    # It expires while the customer is still browsing.
    discount.update(ends_at: Time.now - 60)

    get "/fragments/cart/lines", node: "loop"
    assert_equal 200, last_response.status, "an expired code must not break the cart"

    payload = CartPayload.call(Cart.first, discount_code: "SAVE10").fetch("cart")
    assert_equal "", payload.fetch("discountCode")
    assert_equal 0, payload.fetch("discountCents")
    assert_equal 27_900, payload.fetch("totalCents")
  end

  def test_discount_and_total_bind_through_the_cart_frame
    Discount.dataset.delete
    make_discount(code: "SAVE10")
    publish_page!(subtotal_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    result = Dukafy::Publisher::RenderPage.call(
      document: Page.first(slug: "cart").published_document_data,
      registry: Dukafy::Publisher::REGISTRY, prefetched: {},
      cart: CartPayload.call(Cart.first, discount_code: "SAVE10")
    )

    assert_includes result.html, "<p>$27.90</p>"   # discountDisplay
    assert_includes result.html, "<p>$251.10</p>"  # totalDisplay
  end

  # ---------------------------------------------------------------------
  # cart.createOrder — cart + identity, nothing else.
  # ---------------------------------------------------------------------

  def test_creating_an_order_from_the_cart_and_an_identity
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    post "/fragments/cart/order", email: "buyer@example.com", name: "Ada"

    assert_equal 204, last_response.status, last_response.body
    assert_empty last_response.body
    assert_equal "dukafy:order-created", last_response.headers.fetch("hx-trigger")
    order = Order.first
    assert_equal 27_900, order.total_cents
    assert_equal "buyer@example.com", order.email
    assert_equal 1, Customer.count
    assert_equal 3, Variant[@variant.id].stock
  end

  def test_a_phone_only_order_is_accepted
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"

    post "/fragments/cart/order", phone: "+254 712 345 678"

    assert_equal 204, last_response.status, last_response.body
    assert_equal "+254712345678", Order.first.phone
  end

  def test_order_creation_requires_some_identity
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"

    post "/fragments/cart/order"

    assert_equal 422, last_response.status
    assert_includes last_response.body, "email address or phone number"
    assert_equal 0, Order.count
  end

  def test_an_out_of_stock_order_reports_which_line_is_short
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "3"
    @variant.update(stock: 1)

    post "/fragments/cart/order", email: "buyer@example.com"

    assert_equal 409, last_response.status
    assert_includes last_response.body, "only 1 left"
    assert_equal 0, Order.count
  end

  def test_the_cart_is_spent_after_ordering
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"
    post "/fragments/cart/order", email: "buyer@example.com"

    # A fresh cart_key is issued on the next add — the old cart is converted,
    # not reused, so a reload can't re-submit the same basket.
    get "/fragments/cart/lines", node: "loop"
    assert_equal 200, last_response.status
    refute_includes last_response.body, "Canvas Bag"
    assert_equal "converted", Cart.first.status
  end

  def test_the_merchant_chooses_where_to_go_next_and_only_locally
    publish_page!(cart_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"

    post "/fragments/cart/order", email: "b@example.com", redirect: "/thank-you"
    assert_equal "/thank-you", last_response.headers["hx-redirect"]

    # An off-site redirect must never be honoured.
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"
    post "/fragments/cart/order", email: "b@example.com", redirect: "//evil.example.com"
    assert_nil last_response.headers["hx-redirect"]
  end

  def test_cart_level_fields_bind_through_the_cart_frame
    document = cart_document
    document["nodes"]["body"]["children"] = %w[loop subtotal]
    document["nodes"]["subtotal"] = {
      "id" => "subtotal", "moduleId" => "base.text", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "text" => "fallback", "tag" => "p" },
      "dynamicBindings" => { "text" => { "source" => "cart", "field" => "subtotalDisplay" } },
    }
    publish_page!(document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    # The subtotal node lives OUTSIDE the loop, so render the whole page the
    # way the cart-lines endpoint renders its subtree — with a cart in scope.
    result = Dukafy::Publisher::RenderPage.call(
      document: Page.first(slug: "cart").published_document_data,
      registry: Dukafy::Publisher::REGISTRY, prefetched: {},
      cart: CartPayload.call(Cart.first)
    )

    assert_includes result.html, "<p>$279.00</p>"
  end

  # Cart-wide values (count, subtotal, total) belong OUTSIDE the lines loop —
  # inside it they would repeat once per line. But outside it they are also
  # outside the only thing on a baked page that re-fetches per visitor, so
  # they rendered blank. A cart REGION is the fix: any node can be marked as
  # one, and the whole subtree re-fetches with the visitor's cart.
  def cart_region_document
    document = cart_document
    document["nodes"]["body"]["children"] = ["region"]
    document["nodes"]["region"] = {
      "id" => "region", "moduleId" => "base.container", "children" => %w[loop count subtotal],
      "props" => { "tag" => "div" }, "classIds" => [], "breakpointOverrides" => {},
      "actions" => { "region" => "cart" },
    }
    document["nodes"]["count"] = {
      "id" => "count", "moduleId" => "base.text", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "text" => "Items count : {cart.count}", "tag" => "p" },
    }
    document["nodes"]["subtotal"] = {
      "id" => "subtotal", "moduleId" => "base.text", "children" => [], "classIds" => [],
      "breakpointOverrides" => {}, "props" => { "text" => "fallback", "tag" => "p" },
      "dynamicBindings" => { "text" => { "source" => "cart", "field" => "subtotalDisplay" } },
    }
    document
  end

  def test_baked_cart_region_carries_no_cart_data_and_fetches_itself
    publish_page!(cart_region_document)
    result = Dukafy::Publisher::RenderPage.call(
      document: Page.first(slug: "cart").published_document_data,
      registry: Dukafy::Publisher::REGISTRY, prefetched: {}
    )

    assert_includes result.html, 'hx-get="/fragments/cart/region?node=region"'
    assert_includes result.runtimes, :htmx
    # One fetch, not two: the region swallows the loop's own placeholder.
    refute_includes result.html, "/fragments/cart/lines"
    refute_includes result.html, "Items count"
  end

  def test_cart_region_fragment_renders_cart_wide_values_over_http
    publish_page!(cart_region_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    get "/fragments/cart/region", node: "region"

    assert_equal 200, last_response.status
    assert_equal "no-store", last_response.headers.fetch("cache-control")
    # The token the merchant actually typed, and a structured binding, and the
    # per-line loop — all in one swap.
    assert_includes last_response.body, "Items count : 2"
    assert_includes last_response.body, "<p>$279.00</p>"
    assert_includes last_response.body, "<p>Canvas Bag</p>"
  end

  def test_cart_region_fragment_stays_subscribed_after_it_swaps_itself
    publish_page!(cart_region_document)

    get "/fragments/cart/region", node: "region"

    # Without this the region renders once and then silently stops tracking
    # the cart, because the swap replaced the element that carried the wiring.
    assert_includes last_response.body, 'hx-get="/fragments/cart/region?node=region"'
    assert_includes last_response.body, "dukafy:cart-updated from:body"
    # …but NOT on `revealed`, which would make the response re-request itself
    # forever. Both halves matter: only one of them is a refresh.
    refute_includes last_response.body, "revealed"
  end

  # Same defect, same shape: any fragment that swaps ITSELF via outerHTML must
  # not answer with `revealed` still attached.
  def test_no_self_replacing_cart_fragment_answers_with_a_reveal_trigger
    publish_page!(cart_region_document)
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"

    %w[/fragments/cart/region /fragments/cart/badge /fragments/cart/lines].each do |path|
      get path, node: "region"
      next unless last_response.status == 200

      refute_includes last_response.body, "revealed",
                      "#{path} swaps itself via outerHTML, so `revealed` on the response is an infinite loop"
    end
  end

  def test_cart_region_fragment_refuses_unmarked_unsafe_and_draft_nodes
    publish_page!(cart_region_document)

    # A real, published node — but not marked as a cart region.
    get "/fragments/cart/region", node: "row"
    assert_equal 404, last_response.status

    get "/fragments/cart/region", node: "nope"
    assert_equal 404, last_response.status

    get "/fragments/cart/region", node: "../../etc/passwd"
    assert_equal 404, last_response.status
  end

  def test_cart_region_fragment_refuses_a_draft_only_region
    draft = cart_region_document
    draft["id"] = "draft-page"
    draft["slug"] = "draft-cart"
    Page.create(slug: "draft-cart", title: "Draft", kind: "page", status: "draft",
                document: JSON.generate(draft))

    get "/fragments/cart/region", node: "region"

    assert_equal 404, last_response.status
  end
end
