require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class AdminStoreSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafy.app
  end

  def setup
    Variant.dataset.delete
    CollectionProduct.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    UserPreference.dataset.delete
    Admin.dataset.delete
    clear_cookies
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def login
    post_json "/admin/api/cms/setup", siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def test_requires_authenticated_admin
    get "/admin/store"
    assert_equal 302, last_response.status
    assert_equal "/admin/", last_response.headers.fetch("location")
  end

  def test_product_create_update_list_and_delete
    login
    post "/admin/store/products", title: "Canvas Bag", slug: "canvas-bag", vendor: "Dukafy", status: "active"
    product = Product.first
    assert_equal 302, last_response.status
    assert_equal "Canvas Bag", product.title

    get "/admin/store"
    assert_includes last_response.body, "Canvas Bag"
    assert_includes last_response.body, "htmx.min.js"

    post "/admin/store/products/#{product.id}/update", title: "Canvas Tote", slug: "canvas-tote", vendor: "Dukafy", status: "draft"
    assert_equal "Canvas Tote", product.refresh.title
    assert_equal "draft", product.status

    post "/admin/store/products/#{product.id}/delete"
    assert_equal 302, last_response.status
    assert_nil Product[product.id]
  end

  def test_rejects_invalid_and_duplicate_slugs
    login
    Product.create(title: "Existing", slug: "existing", status: "draft")

    post "/admin/store/products", title: "Bad", slug: "../bad", status: "draft"
    assert_equal 422, last_response.status

    post "/admin/store/products", title: "Duplicate", slug: "existing", status: "active"
    assert_equal 422, last_response.status
    assert_includes last_response.body, "already been taken"
  end

  def test_variant_create_update_order_and_delete
    login
    product = Product.create(title: "Canvas Bag", slug: "canvas-bag", status: "active")

    post "/admin/store/products/#{product.id}/variants",
      sku: "BAG-BLACK", title: "Black", price_cents: "12900", currency: "usd", stock: "8", position: "2"
    variant = product.variants_dataset.first
    assert_equal 302, last_response.status
    assert_equal 12_900, variant.price_cents
    assert_equal "USD", variant.currency
    assert_equal 8, variant.stock

    get "/admin/store/products/#{product.id}"
    assert_includes last_response.body, "BAG-BLACK"
    assert_includes last_response.body, "Price (cents)"

    post "/admin/store/products/#{product.id}/variants/#{variant.id}/update",
      sku: "BAG-BLACK", title: "Midnight", price_cents: "13900", currency: "USD", stock: "5", position: "0"
    assert_equal 302, last_response.status
    assert_equal "Midnight", variant.refresh.title
    assert_equal 0, variant.position

    post "/admin/store/products/#{product.id}/variants/#{variant.id}/delete"
    assert_equal 302, last_response.status
    assert_nil Variant[variant.id]
  end

  def test_variant_rejects_negative_values_and_duplicate_product_sku
    login
    product = Product.create(title: "Canvas Bag", slug: "canvas-bag", status: "active")
    other = Product.create(title: "Other Bag", slug: "other-bag", status: "active")
    product.add_variant(sku: "BAG-1", title: "Default", price_cents: 1000, currency: "USD", stock: 1, position: 0)
    other.add_variant(sku: "BAG-1", title: "Allowed on another product", price_cents: 1000, currency: "USD", stock: 1, position: 0)

    post "/admin/store/products/#{product.id}/variants",
      sku: "BAG-1", title: "Duplicate", price_cents: "-1", currency: "USD", stock: "-2", position: "-1"

    assert_equal 422, last_response.status
    assert_includes last_response.body, "has already been used for this product"
    assert_equal 1, product.variants_dataset.count
  end
end
