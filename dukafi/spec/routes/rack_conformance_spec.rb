require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# Every other spec drives the app through Rack::Test, which does NOT validate
# the response against the Rack spec. The dev server does — `rackup` inserts
# `Rack::Lint` in development — so a response that every spec accepts can still
# 500 the moment you click the button.
#
# That is not hypothetical: Rack 3 requires lowercase header names, and a raw
# `request.halt([status, headers, body])` triplet bypasses Roda's response
# object, which would otherwise normalise the casing. A capitalised
# `"HX-Trigger"` in one of those triplets passed the whole suite and broke
# add-to-cart in development.
#
# So this spec runs the endpoints that set headers by hand through Rack::Lint,
# with the SUCCESS and the FAILURE path of each — the failure paths are the
# ones that build raw triplets, and the ones no happy-path test exercises.
class RackConformanceSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Rack::Lint.new(Dukafi.app)
  end

  def setup
    CartItem.dataset.delete
    Cart.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    clear_cookies
    product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    Variant.create(product_id: product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
                   currency: "USD", stock: 3, position: 0)
  end

  def test_add_to_cart_success_and_every_rejection_satisfy_rack
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "1"
    assert_equal 204, last_response.status

    # Each of these takes a different `halt_cart_error` branch, and each builds
    # a raw Rack triplet carrying an `hx-trigger` header.
    post "/fragments/cart/items", product_slug: "nope", quantity: "1"
    assert_equal 404, last_response.status
    assert_includes last_response.headers.fetch("hx-trigger"), "dukafi:cart-error"

    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "0"
    assert_equal 422, last_response.status

    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "99"
    assert_equal 409, last_response.status
  end

  def test_line_mutations_satisfy_rack_on_both_paths
    post "/fragments/cart/items", product_slug: "canvas-bag", variant_sku: "BAG-L", quantity: "2"

    post "/fragments/cart/items/update", variant_sku: "BAG-L", quantity: "1"
    assert_equal 200, last_response.status

    # Not in the caller's cart — the 404 branch, another raw triplet.
    post "/fragments/cart/items/remove", variant_sku: "GHOST"
    assert_equal 404, last_response.status
  end

  def test_admin_api_error_envelope_satisfies_rack
    # `AdminApi#error!` is the other hand-built triplet in the codebase.
    get "/admin/api/cms/does-not-exist"
    assert_includes [401, 404], last_response.status
  end

  # A cheap, total guard: no route may answer with a capitalised header name.
  # Rack::Lint above catches it for the paths exercised here; this catches it
  # for the response headers those paths actually produced.
  def test_no_response_header_is_capitalised
    [
      -> { post "/fragments/cart/items", product_slug: "canvas-bag", quantity: "1" },
      -> { post "/fragments/cart/items", product_slug: "nope", quantity: "1" },
      -> { get "/fragments/cart/lines", node: "missing" },
      -> { get "/fragments/stock", product_slug: "canvas-bag", variant_sku: "BAG-L" },
    ].each do |request_block|
      request_block.call
      offenders = last_response.headers.keys.reject { |name| name == name.downcase }
      assert_empty offenders, "response carried capitalised header(s): #{offenders.inspect}"
    end
  end
end
