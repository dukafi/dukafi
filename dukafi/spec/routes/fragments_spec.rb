require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class FragmentsSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafi.app
  end

  def setup
    CartItem.dataset.delete
    Cart.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    clear_cookies
    @product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    @variant = Variant.create(
      product_id: @product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
      currency: "USD", stock: 3, position: 0
    )
  end

  # 204 and an EMPTY body on purpose. This endpoint has no hx-target, so htmx
  # swaps the response into the merchant's own button — any markup here would
  # overwrite their label. htmx skips the swap on 204; the cart badge and cart
  # regions refresh themselves off `dukafi:cart-updated` instead.
  def test_add_item_creates_an_anonymous_cart_and_returns_no_markup
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    assert_equal 204, last_response.status
    assert_equal "dukafi:cart-updated", last_response.headers.fetch("hx-trigger")
    assert_empty last_response.body
    assert_equal 2, CartItem.first.quantity

    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"
    assert_equal 3, CartItem.first.quantity
    assert_equal 1, Cart.count
  end

  def test_add_item_rejects_quantity_above_stock_without_mutating_cart
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "4"

    assert_equal 409, last_response.status
    assert_includes last_response.body, "Only 3 available."
    assert_equal 0, CartItem.count
  end

  def test_add_item_rejects_unknown_and_invalid_input
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "missing", quantity: "1"
    assert_equal 404, last_response.status

    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "0"
    assert_equal 422, last_response.status
    assert_equal 0, CartItem.count
  end

  # A product with ONE variant needs no picker, so nothing on the merchant's
  # page supplies `variant_sku` — and requiring it 404'd every "Add to cart"
  # on a simple product.
  def test_add_item_without_a_sku_uses_the_only_variant
    post "/fragments/cart/items", product_slug: "canvas-bag", quantity: "2"

    assert_equal 204, last_response.status
    assert_equal @variant.id, CartItem.first.variant_id
  end

  # With a real choice to make, guessing would silently add the wrong size.
  def test_add_item_without_a_sku_refuses_when_the_product_has_several_variants
    Variant.create(
      product_id: @product.id, sku: "BAG-S", title: "Small", price_cents: 13_950,
      currency: "USD", stock: 3, position: 1
    )

    post "/fragments/cart/items", product_slug: "canvas-bag", quantity: "1"

    assert_equal 404, last_response.status
    assert_includes last_response.body, "Choose an option first."
    assert_equal 0, CartItem.count
  end

  # A rejected add used to call `active_cart`, which CREATES a cart — so every
  # failed click left an empty row behind.
  def test_a_rejected_add_creates_no_cart
    post "/fragments/cart/items", product_slug: "ghost", quantity: "1"
    assert_equal 404, last_response.status

    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "99"
    assert_equal 409, last_response.status

    assert_equal 0, Cart.count
  end

  # htmx discards 4xx bodies by default, so a rejected add was completely
  # silent — the visitor clicked and nothing happened. htmx processes
  # `HX-Trigger` before it decides whether to swap, so failures ride that
  # instead, keeping "Dukafi fires events, the merchant owns the markup".
  def test_a_rejected_add_announces_the_reason_as_an_event
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "99"

    assert_equal 409, last_response.status
    assert_equal({ "dukafi:cart-error" => { "message" => "Only 3 available." } },
                 JSON.parse(last_response.headers.fetch("hx-trigger")))

    post "/fragments/cart/items", product_slug: "ghost", quantity: "1"
    assert_equal 404, last_response.status
    assert_includes last_response.headers.fetch("hx-trigger"), "Product option not found."

    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "0"
    assert_equal 422, last_response.status
    assert_includes last_response.headers.fetch("hx-trigger"), "Choose a valid quantity."
  end

  def test_stock_fragment_reports_variant_and_product_inventory
    get "/fragments/stock", product_slug: "canvas-bag", variant_sku: "BAG-L", low_stock_threshold: "3"

    assert_equal 200, last_response.status
    assert_equal "no-store", last_response.headers.fetch("cache-control")
    assert_includes last_response.body, 'data-stock="3"'
    assert_includes last_response.body, "Only 3 left"

    @variant.update(stock: 8)
    get "/fragments/stock", product_slug: "canvas-bag", low_stock_threshold: "3"
    assert_includes last_response.body, "In stock"
  end

  def test_stock_fragment_returns_sold_out_for_missing_inventory_without_leaking_details
    get "/fragments/stock", product_slug: "missing", variant_sku: "BAD"

    assert_equal 200, last_response.status
    assert_includes last_response.body, "Sold out"
    refute_includes last_response.body, "missing"
  end


end
