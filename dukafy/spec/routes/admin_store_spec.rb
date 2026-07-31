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
end
