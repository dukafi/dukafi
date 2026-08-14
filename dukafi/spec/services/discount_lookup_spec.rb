require_relative "../spec_helper"

class DiscountLookupSpec < Minitest::Test
  def setup
    Discount.dataset.delete
  end

  def make(code:, kind: "percentage", value: 10, starts_at: Time.now - 3600, ends_at: nil,
           usage_limit: nil, usage_count: 0)
    Discount.create(
      code: code, kind: kind, value: value, starts_at: starts_at, ends_at: ends_at,
      usage_limit: usage_limit, usage_count: usage_count,
      created_at: Time.now, updated_at: Time.now
    )
  end

  def test_percentage_math_against_a_cart_subtotal
    make(code: "SAVE10", kind: "percentage", value: 10)

    result = DiscountLookup.call("SAVE10", 31_050)

    assert result.ok?
    assert_equal 3_105, result.amount_cents
  end

  def test_fixed_math_against_a_cart_subtotal
    make(code: "TENOFF", kind: "fixed", value: 1_000)

    assert_equal 1_000, DiscountLookup.call("TENOFF", 31_050).amount_cents
  end

  def test_code_match_is_case_insensitive
    make(code: "SAVE10")

    assert DiscountLookup.call("save10", 10_000).ok?
    assert DiscountLookup.call("  SaVe10 ", 10_000).ok?
  end

  def test_percentage_rounds_half_up_rather_than_shortchanging_the_customer
    make(code: "SAVE10", kind: "percentage", value: 10)

    # 10% of 29.99 is 2.999 — truncation would give 2.99 and quietly keep a
    # cent from the customer on every non-round subtotal.
    assert_equal 300, DiscountLookup.call("SAVE10", 2_999).amount_cents
  end

  def test_a_fixed_code_never_exceeds_the_cart_value
    make(code: "BIG", kind: "fixed", value: 5_000)

    result = DiscountLookup.call("BIG", 1_200)

    assert result.ok?
    # Capped at the subtotal — a negative total is not a thing to pay.
    assert_equal 1_200, result.amount_cents
  end

  def test_unknown_code_is_rejected
    result = DiscountLookup.call("NOPE", 10_000)

    refute result.ok?
    assert_equal "not_found", result.reason
    assert_equal 0, result.amount_cents
  end

  def test_a_code_that_has_not_started_is_rejected
    make(code: "SOON", starts_at: Time.now + 3600)

    assert_equal "not_started", DiscountLookup.call("SOON", 10_000).reason
  end

  def test_an_expired_code_is_rejected
    make(code: "OLD", starts_at: Time.now - 7200, ends_at: Time.now - 3600)

    assert_equal "expired", DiscountLookup.call("OLD", 10_000).reason
  end

  def test_a_usage_limit_exhausted_code_is_rejected
    make(code: "ONCE", usage_limit: 5, usage_count: 5)

    assert_equal "exhausted", DiscountLookup.call("ONCE", 10_000).reason

    # One use left is still fine — the boundary is >=, not >.
    make(code: "TWICE", usage_limit: 5, usage_count: 4)
    assert DiscountLookup.call("TWICE", 10_000).ok?
  end

  def test_an_empty_cart_takes_no_discount
    make(code: "SAVE10")

    assert_equal "empty_cart", DiscountLookup.call("SAVE10", 0).reason
  end

  def test_lookup_never_mutates_usage_count
    discount = make(code: "SAVE10", usage_limit: 10)

    3.times { DiscountLookup.call("SAVE10", 10_000) }

    # Applying is not purchasing — usage only moves on order creation.
    assert_equal 0, Discount[discount.id].usage_count
  end
end
