require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class FragmentsSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafy.app
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

  def test_add_item_creates_an_anonymous_cart_and_returns_a_fragment
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    assert_equal 200, last_response.status
    assert_equal "dukafy:cart-updated", last_response.headers.fetch("hx-trigger")
    assert_includes last_response.body, 'data-cart-count="2"'
    assert_includes last_response.body, "Added Canvas Bag — Large."
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
