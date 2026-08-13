require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# Admin API responses must satisfy the Rack spec, not merely Rack::Test.
#
# `Rack::Test` never validates a response; `rackup` inserts `Rack::Lint` in
# development. So an invalid response passes the whole suite and 500s on the
# first click. That is exactly what happened to every DELETE here: Roda's
# `json` plugin stamps `content-type: application/json` onto every response,
# and Rack forbids a content-type on a 204. The row was already deleted by the
# time Lint rejected the response, so the UI showed a 500 for an operation
# that had actually succeeded — and the row vanished on refresh.
class AdminApiConformanceSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Rack::Lint.new(Dukafy.app)
  end

  def setup
    [PluginSetting, PaymentAttempt, FormSubmission, OrderItem, Order, Customer,
     CollectionProduct, Collection, ProductImage, MediaAsset, Variant, Product,
     UserPreference, Page, SiteState, Admin].each { |model| model.dataset.delete }
    clear_cookies
    post_json "/admin/api/cms/setup", {
      siteName: "Conformance", email: "owner@example.com", password: "correct-horse-battery",
    }
    post_json "/admin/api/cms/login", { email: "owner@example.com", password: "correct-horse-battery" }
    assert_equal 200, last_response.status, last_response.body
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), { "CONTENT_TYPE" => "application/json" }
  end

  def seed_product
    now = Time.now
    product = Product.create(title: "Widget", slug: "widget", status: "draft",
                             description_document: "", created_at: now, updated_at: now)
    Variant.create(product_id: product.id, sku: "W-1", title: "Default", price_cents: 100,
                   currency: "USD", stock: 1, position: 0)
    product
  end

  def assert_no_content!
    assert_equal 204, last_response.status, last_response.body
    # The header Rack rejects. Asserting it directly documents the actual rule
    # rather than relying on Lint alone to notice.
    assert_nil last_response.headers["content-type"]
    assert_empty last_response.body
  end

  def test_deleting_a_product_returns_a_valid_204
    product = seed_product

    delete "/admin/api/cms/commerce/products/#{product.id}"

    assert_no_content!
    assert_nil Product[product.id]
  end

  def test_deleting_a_variant_returns_a_valid_204
    product = seed_product
    Variant.create(product_id: product.id, sku: "W-2", title: "Second", price_cents: 200,
                   currency: "USD", stock: 1, position: 1)
    variant = product.variants_dataset.first(sku: "W-2")

    delete "/admin/api/cms/commerce/products/#{product.id}/variants/#{variant.id}"

    assert_no_content!
    assert_nil Variant[variant.id]
  end

  def test_deleting_a_collection_returns_a_valid_204
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)

    delete "/admin/api/cms/commerce/collections/#{collection.id}"

    assert_no_content!
    assert_nil Collection[collection.id]
  end

  # Every remaining 204 in the admin API, so a new one cannot reintroduce this.
  def test_no_endpoint_sets_a_status_of_204_by_hand
    source = File.read(File.expand_path("../../routes/admin_api.rb", __dir__))

    refute_includes source, "response.status = 204",
                    "use `no_content!` — setting 204 by hand leaves the json plugin's " \
                    "content-type in place, which Rack rejects"
  end
end
