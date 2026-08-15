require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# The Discounts admin screen's routes.
#
# The MCP tools have their own suite; what matters HERE is that the two
# surfaces cannot drift. Both go through `DiscountWrites`, so the properties
# pinned below are the ones a second implementation would quietly get wrong:
# an authenticated-only surface, a status that agrees with the cart, and a
# delete that does not destroy a code some order was charged under.
class AdminDiscountsSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Discount.dataset.delete
    Admin.dataset.delete
    clear_cookies
  end

  def json = JSON.parse(last_response.body)

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def patch_json(path, payload)
    patch path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def login!
    post_json "/admin/api/cms/setup", {
      siteName: "Test Store", email: "owner@example.com", password: "correct-horse-battery",
    }
    post_json "/admin/api/cms/login", { email: "owner@example.com", password: "correct-horse-battery" }
    assert_equal 200, last_response.status, last_response.body
  end

  def create!(payload = {})
    post_json "/admin/api/cms/discounts",
              { code: "WEEKEND20", kind: "percentage", value: 20 }.merge(payload)
    assert_equal 201, last_response.status, last_response.body
    json.fetch("discount")
  end

  # Money off the till is not something an anonymous request gets to create.
  def test_every_discount_route_requires_an_admin
    get "/admin/api/cms/discounts"
    assert_equal 401, last_response.status

    post_json "/admin/api/cms/discounts", { code: "SNEAK", kind: "percentage", value: 90 }
    assert_equal 401, last_response.status
    assert_equal 0, Discount.count
  end

  def test_creating_a_discount_returns_it_with_its_derived_status
    login!
    discount = create!

    assert_equal "WEEKEND20", discount.fetch("code")
    assert_equal "active", discount.fetch("status")
    assert_equal 0, discount.fetch("redemptions")
  end

  # The screen renders a fixed amount as money, so it needs to know which.
  def test_the_list_carries_the_store_currency
    login!
    create!(code: "FIVEOFF", kind: "fixed", value: 500)

    get "/admin/api/cms/discounts"

    assert_equal 200, last_response.status
    assert_equal CommerceSettings.current.currency, json.fetch("currency")
    assert_equal 1, json.fetch("total")
  end

  # The same rules the tools enforce, because it is the same writer — not a
  # second copy that happens to agree today.
  def test_the_writer_rules_apply_here_too
    login!
    post_json "/admin/api/cms/discounts", { code: "HUGE", kind: "percentage", value: 500 }

    assert_equal 422, last_response.status
    assert_includes json.dig("error", "message").to_s, "cannot exceed 100"

    create!(code: "TAKEN")
    post_json "/admin/api/cms/discounts", { code: "taken", kind: "fixed", value: 100 }
    assert_equal 422, last_response.status
    assert_includes json.dig("error", "message").to_s, "already exists"
  end

  def test_editing_changes_only_what_it_names
    login!
    discount = create!(usageLimit: 100)

    patch_json "/admin/api/cms/discounts/#{discount.fetch('id')}", { value: 30 }

    assert_equal 200, last_response.status, last_response.body
    assert_equal 30, json.dig("discount", "value")
    assert_equal 100, json.dig("discount", "usageLimit")
  end

  # Blanking the field in the form has to be able to MEAN unlimited, or a limit
  # set once could never be removed through the screen.
  def test_a_null_usage_limit_clears_it
    login!
    discount = create!(usageLimit: 5)

    patch_json "/admin/api/cms/discounts/#{discount.fetch('id')}", { usageLimit: nil }

    assert_nil json.dig("discount", "usageLimit")
  end

  def test_an_unused_code_is_deleted_outright
    login!
    discount = create!(code: "NEVERUSED")

    delete "/admin/api/cms/discounts/#{discount.fetch('id')}"

    assert_equal 204, last_response.status
    assert_equal 0, Discount.count
  end

  # The screen must not be told a delete happened when it did not: a redeemed
  # code comes back as a row, ended, so the table can redraw it rather than
  # dropping a code that still exists.
  def test_a_redeemed_code_comes_back_ended_rather_than_gone
    login!
    discount = create!(code: "USED10")
    Discount.where(code: "USED10").update(usage_count: 2)

    delete "/admin/api/cms/discounts/#{discount.fetch('id')}"

    assert_equal 200, last_response.status
    assert_equal false, json.fetch("deleted")
    assert_equal "expired", json.dig("discount", "status")
    refute_nil Discount.first(code: "USED10")
    assert_equal "expired", DiscountLookup.call("USED10", 10_000).reason
  end

  def test_a_missing_discount_is_a_404
    login!
    patch_json "/admin/api/cms/discounts/99999", { value: 5 }

    assert_equal 404, last_response.status
  end

  # `usage_count` says how often a code was typed; only the orders say what it
  # earned. The screen leads with these, so they have to arrive with the row.
  def test_a_row_carries_what_the_code_earned
    login!
    discount = create!(code: "EARNER")
    now = Time.now
    Order.create(email: "buyer@example.com", status: "paid", currency: "USD",
                 subtotal_cents: 10_000, discount_cents: 2_000, shipping_cents: 0,
                 total_cents: 8_000, discount_code: "EARNER", created_at: now, updated_at: now)

    get "/admin/api/cms/discounts"
    row = json.fetch("discounts").find { |entry| entry.fetch("id") == discount.fetch("id") }

    assert_equal 1, row.fetch("ordersWithCode")
    assert_equal 8_000, row.fetch("revenueCents")
    assert_equal 2_000, row.fetch("discountedCents")
  end
end
