require_relative "../spec_helper"
require_relative "../../app"

# Discount codes, from MCP.
#
# A discount is money the store gives away, and unlike a page edit there is no
# draft between the tool call and a customer being charged less. So what is
# pinned here is the shape of the mistakes: a code that means something other
# than what it says, a code that outlives its own history, a code that two
# tools disagree about.
class McpDiscountsSpec < Minitest::Test
  def setup
    OrderItem.dataset.delete
    Order.dataset.delete
    Discount.dataset.delete
  end

  def tool(name)
    definition = McpTools.all.find { |entry| entry.fetch(:name) == name }
    raise "no tool #{name}" if definition.nil?

    definition.fetch(:run)
  end

  def call(name, args = {}) = tool(name).call(args)

  def refusal(name, args = {})
    call(name, args)
    flunk "expected a refusal from #{name}"
  rescue McpTools::ArgumentError => e
    e.message
  end

  # Keys are stringified because the tools take the JSON a client sends, where
  # every key is a string — a symbol here would sail past `params.key?` and
  # test nothing.
  def a_code(code: "WEEKEND20", kind: "percentage", value: 20, **rest)
    call("create_discount",
         { "code" => code, "kind" => kind, "value" => value }
           .merge(rest.transform_keys(&:to_s)))
  end

  # ── The tools exist and are on the right side of the read/write line ──────

  def test_the_discount_tools_are_registered
    names = McpTools.all.map { |entry| entry.fetch(:name) }

    %w[list_discounts create_discount update_discount delete_discount].each do |name|
      assert_includes names, name
    end
  end

  # A connection scoped to reads must not be able to invent money off.
  def test_only_listing_counts_as_a_read
    refute McpTools.write_tool?("list_discounts")

    %w[create_discount update_discount delete_discount].each do |name|
      assert McpTools.write_tool?(name), "#{name} must count as a write"
    end
  end

  # ── Creating ─────────────────────────────────────────────────────────────

  def test_a_new_code_is_live_immediately_and_says_so
    result = a_code

    assert_equal "WEEKEND20", result.fetch("code")
    assert_equal "active", result.fetch("status")
    assert_includes result.fetch("note"), "Live now"
  end

  # Codes get typed in lowercase and read aloud over the phone. If the stored
  # form and the compared form ever differ, a code works for some customers
  # and not others.
  def test_a_code_is_stored_uppercased_and_matches_case_insensitively
    a_code(code: "weekend20")

    assert_equal "WEEKEND20", Discount.first.code
    assert_equal "WEEKEND20", call("list_discounts", { "code" => "WeEkEnD20" })
                                .fetch("discounts").first.fetch("code")
  end

  def test_the_same_code_cannot_be_created_twice_in_any_case
    a_code(code: "SAVE10")

    assert_includes refusal("create_discount",
                            { "code" => "save10", "kind" => "fixed", "value" => 500 }),
                    "already exists"
  end

  # `DiscountLookup` caps the payout at the subtotal, so 500% behaves exactly
  # like 100% — the mistake would pay out silently and never surface.
  def test_a_percentage_over_a_hundred_is_refused
    assert_includes refusal("create_discount",
                            { "code" => "HUGE", "kind" => "percentage", "value" => 500 }),
                    "cannot exceed 100"
  end

  # A fixed discount is cents, and cents are a whole number of them.
  def test_a_fractional_or_zero_value_is_refused
    assert_includes refusal("create_discount", { "code" => "A", "kind" => "fixed", "value" => 0 }),
                    "at least 1"
  end

  def test_a_code_with_spaces_or_punctuation_is_refused
    assert_includes refusal("create_discount",
                            { "code" => "20% OFF", "kind" => "percentage", "value" => 20 }),
                    "letters, numbers"
  end

  # A window that closes before it opens is a code that can never be applied,
  # and the evaluator would only ever call it "not started" then "expired".
  def test_an_end_before_the_start_is_refused
    message = refusal("create_discount", {
                        "code" => "BACKWARDS", "kind" => "percentage", "value" => 10,
                        "startsAt" => "2026-09-01T00:00:00Z", "endsAt" => "2026-08-01T00:00:00Z"
                      })

    assert_includes message, "after startsAt"
  end

  def test_a_scheduled_code_reports_itself_as_scheduled_not_active
    result = a_code(code: "LATER", startsAt: "2099-01-01T00:00:00Z")

    assert_equal "scheduled", result.fetch("status")
    assert_includes result.fetch("note"), "starts working at"
  end

  # ── Status agrees with what a customer would experience ──────────────────

  # The one property that must not drift: `status_of` and `DiscountLookup` are
  # two different pieces of code answering the same question, and a merchant
  # reading "active" while a customer is told "expired" is the worst outcome.
  def test_reported_status_matches_what_the_cart_evaluator_decides
    a_code(code: "OPEN")
    a_code(code: "FUTURE", startsAt: "2099-01-01T00:00:00Z")
    a_code(code: "OVER", startsAt: "2020-01-01T00:00:00Z", endsAt: "2020-02-01T00:00:00Z")
    a_code(code: "CAPPED", usageLimit: 1)
    Discount.where(code: "CAPPED").update(usage_count: 1)

    listed = call("list_discounts").fetch("discounts").to_h { |row| [row["code"], row["status"]] }

    assert_equal "active", listed.fetch("OPEN")
    assert_equal "scheduled", listed.fetch("FUTURE")
    assert_equal "expired", listed.fetch("OVER")
    assert_equal "exhausted", listed.fetch("CAPPED")

    # And the evaluator refuses every one that is not "active", for reasons
    # that line up one-for-one.
    assert DiscountLookup.call("OPEN", 10_000).ok?
    assert_equal "not_started", DiscountLookup.call("FUTURE", 10_000).reason
    assert_equal "expired", DiscountLookup.call("OVER", 10_000).reason
    assert_equal "exhausted", DiscountLookup.call("CAPPED", 10_000).reason
  end

  def test_listing_can_be_filtered_by_status
    a_code(code: "OPEN")
    a_code(code: "FUTURE", startsAt: "2099-01-01T00:00:00Z")

    codes = call("list_discounts", { "status" => "scheduled" })
            .fetch("discounts").map { |row| row.fetch("code") }

    assert_equal %w[FUTURE], codes
  end

  # ── Updating ─────────────────────────────────────────────────────────────

  def test_an_update_changes_only_what_it_names
    a_code(code: "KEEP", value: 15, usageLimit: 100)

    updated = call("update_discount", { "code" => "KEEP", "value" => 25 })

    assert_equal 25, updated.fetch("value")
    assert_equal 100, updated.fetch("usageLimit")
    assert_equal "percentage", updated.fetch("kind")
  end

  # `code` names the row being changed, so it cannot also mean "change it to".
  def test_renaming_uses_a_separate_field
    a_code(code: "OLD")

    renamed = call("update_discount", { "code" => "OLD", "newCode" => "NEW" })

    assert_equal "NEW", renamed.fetch("code")
    assert_nil Discount.first(code: "OLD")
  end

  # A limit set once must be removable, or "unlimited" is unreachable.
  def test_a_null_usage_limit_makes_a_code_unlimited_again
    a_code(code: "CAP", usageLimit: 5)

    updated = call("update_discount", { "code" => "CAP", "usageLimit" => nil })

    assert_nil updated.fetch("usageLimit")
  end

  # The documented way to stop a code now without destroying its history.
  def test_ending_a_code_in_the_past_expires_it
    a_code(code: "STOPME")

    updated = call("update_discount",
                   { "code" => "STOPME", "endsAt" => (Time.now - 60).utc.iso8601 })

    assert_equal "expired", updated.fetch("status")
    assert_equal "expired", DiscountLookup.call("STOPME", 10_000).reason
  end

  def test_updating_a_code_that_does_not_exist_says_how_to_find_one
    assert_includes refusal("update_discount", { "code" => "GHOST", "value" => 5 }),
                    "list_discounts"
  end

  # ── Deleting ─────────────────────────────────────────────────────────────

  def test_an_unused_code_is_deleted_outright
    a_code(code: "NEVERUSED")

    result = call("delete_discount", { "code" => "NEVERUSED" })

    assert_equal "NEVERUSED", result.fetch("deleted")
    assert_nil Discount.first(code: "NEVERUSED")
  end

  # Orders record the code string they were charged under. Destroying the row
  # turns a past order's "USED10" into a reference to nothing, so a redeemed
  # code is ended instead — and the tool says which happened rather than
  # claiming a delete it did not do.
  def test_a_redeemed_code_is_ended_rather_than_destroyed
    a_code(code: "USED10")
    Discount.where(code: "USED10").update(usage_count: 3)

    result = call("delete_discount", { "code" => "USED10" })

    assert_equal false, result.fetch("deleted")
    refute_nil Discount.first(code: "USED10")
    assert_equal "expired", result.fetch("status")
    assert_includes result.fetch("note"), "3 order(s)"
    assert_equal "expired", DiscountLookup.call("USED10", 10_000).reason
  end

  # ── What a code was worth ────────────────────────────────────────────────

  # `usage_count` says how often a code was typed. Only the orders say what it
  # earned, which is the whole reason migration 030 records the code on them.
  def test_a_code_reports_the_orders_it_produced
    a_code(code: "EARNER")
    now = Time.now
    2.times do |index|
      Order.create(email: "buyer#{index}@example.com", status: "paid", currency: "USD",
                   subtotal_cents: 10_000, discount_cents: 2_000, shipping_cents: 0,
                   total_cents: 8_000, discount_code: "EARNER",
                   created_at: now, updated_at: now)
    end
    Order.create(email: "other@example.com", status: "paid", currency: "USD",
                 subtotal_cents: 5_000, discount_cents: 0, shipping_cents: 0,
                 total_cents: 5_000, created_at: now, updated_at: now)

    row = call("list_discounts", { "code" => "EARNER" }).fetch("discounts").first

    assert_equal 2, row.fetch("ordersWithCode")
    assert_equal 16_000, row.fetch("revenueCents")
    assert_equal 4_000, row.fetch("discountedCents")
  end

  # A percentage is a percentage anywhere; an amount of money is meaningless
  # without saying which money.
  def test_a_fixed_discount_carries_the_store_currency
    a_code(code: "FIVEOFF", kind: "fixed", value: 500)
    row = call("list_discounts", { "code" => "FIVEOFF" }).fetch("discounts").first

    assert_equal CommerceSettings.current.currency, row.fetch("currency")
    refute call("list_discounts", { "code" => "FIVEOFF" }).fetch("discounts").first.nil?
  end
end
