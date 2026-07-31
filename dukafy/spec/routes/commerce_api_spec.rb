require_relative "../spec_helper"
require "rack/test"
require "tempfile"
require_relative "../../app"

class CommerceApiSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafy.app

  def setup
    SlugRedirect.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    UserPreference.dataset.delete
    Admin.dataset.delete
    clear_cookies
    post_json "/admin/api/cms/setup", siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def json = JSON.parse(last_response.body)

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def patch_json(path, payload)
    patch path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def test_product_and_variant_crud
    post_json "/admin/api/cms/commerce/products", title: "Canvas Bag", slug: "canvas-bag", vendor: "Dukafy", status: "active", descriptionHtml: "<p>Strong</p>"
    product_id = json.dig("product", "id")
    assert_equal 201, last_response.status

    post_json "/admin/api/cms/commerce/products/#{product_id}/variants", sku: "BAG-1", title: "Default", priceCents: 12_900, currency: "USD", stock: 8, position: 0
    variant_id = json.dig("variant", "id")
    assert_equal 201, last_response.status

    patch_json "/admin/api/cms/commerce/products/#{product_id}/variants/#{variant_id}", sku: "BAG-1", title: "Black", priceCents: 13_900, currency: "USD", stock: 5, position: 0
    assert_equal 200, last_response.status, last_response.body
    assert_equal 13_900, json.dig("variant", "priceCents")

    patch_json "/admin/api/cms/commerce/products/#{product_id}", title: "Canvas Tote", slug: "canvas-tote", vendor: "Dukafy", status: "active", descriptionHtml: "<p>Updated</p>"
    assert_equal "canvas-tote", json.dig("product", "slug")
    assert_equal "canvas-tote", SlugRedirect.first(old_slug: "canvas-bag").destination_slug

    get "/admin/api/cms/commerce/products"
    assert_equal ["Canvas Tote"], json.fetch("products").map { |product| product.fetch("title") }

    delete "/admin/api/cms/commerce/products/#{product_id}/variants/#{variant_id}"
    assert_equal 204, last_response.status
    delete "/admin/api/cms/commerce/products/#{product_id}"
    assert_equal 204, last_response.status
  end

  def test_collection_crud_and_ordered_membership
    first = Product.create(title: "First", slug: "first", status: "active")
    second = Product.create(title: "Second", slug: "second", status: "active")
    post_json "/admin/api/cms/commerce/collections", title: "Featured", slug: "featured", description: "Picks", sortOrder: 0
    collection_id = json.dig("collection", "id")

    put "/admin/api/cms/commerce/collections/#{collection_id}/products", JSON.generate(productIds: [second.id, first.id]), "CONTENT_TYPE" => "application/json"
    assert_equal [second.id, first.id], json.dig("collection", "productIds")

    patch_json "/admin/api/cms/commerce/collections/#{collection_id}", title: "New Featured", slug: "new-featured", description: "Changed", sortOrder: 1
    assert_equal "new-featured", json.dig("collection", "slug")

    get "/admin/api/cms/commerce/collections"
    assert_equal ["New Featured"], json.fetch("collections").map { |collection| collection.fetch("title") }
  end

  def test_commerce_api_requires_authentication
    clear_cookies
    get "/admin/api/cms/commerce/products"
    assert_equal 401, last_response.status
  end

  def test_imports_product_csv_through_the_commerce_api
    file = Tempfile.new(["products", ".csv"])
    file.write("product_title,product_slug,status,sku,variant_title,price_cents,currency,stock,position\nBag,bag,active,BAG-1,Default,2500,USD,4,0\n")
    file.rewind

    post "/admin/api/cms/commerce/import", file: Rack::Test::UploadedFile.new(file.path, "text/csv")

    assert_equal 200, last_response.status, last_response.body
    assert_equal({ "products" => 1, "variants" => 1 }, json)
  ensure
    file&.close!
  end
end
