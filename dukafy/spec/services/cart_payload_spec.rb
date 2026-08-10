require_relative "../spec_helper"

class CartPayloadSpec < Minitest::Test
  def setup
    CartItem.dataset.delete
    Cart.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    @product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    @variant = Variant.create(
      product_id: @product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
      currency: "USD", stock: 3, position: 0
    )
    @cart = Cart.create(session_key: "k", status: "active", created_at: Time.now, updated_at: Time.now)
  end

  def add(variant, quantity)
    CartItem.create(
      cart_id: @cart.id, variant_id: variant.id, quantity: quantity,
      created_at: Time.now, updated_at: Time.now
    )
  end

  def test_nil_cart_yields_an_empty_payload
    payload = CartPayload.call(nil)

    assert_equal [], payload.fetch("items")
    assert_equal 0, payload.dig("cart", "count")
    assert_equal true, payload.dig("cart", "isEmpty")
  end

  def test_entry_exposes_the_fields_a_merchant_binds_against
    add(@variant, 2)
    entry = CartPayload.call(@cart).fetch("items").first

    assert_equal "Canvas Bag", entry.fetch("title")
    assert_equal "Large", entry.fetch("variantTitle")
    assert_equal "BAG-L", entry.fetch("sku")
    assert_equal "canvas-bag", entry.fetch("productSlug")
    assert_equal "/products/canvas-bag", entry.fetch("href")
    assert_equal 2, entry.fetch("quantity")
    assert_equal 3, entry.fetch("stock")
    # Raw cents for logic, formatted strings for text bindings.
    assert_equal 13_950, entry.fetch("unitPriceCents")
    assert_equal "$139.50", entry.fetch("unitPriceDisplay")
    assert_equal 27_900, entry.fetch("linePriceCents")
    assert_equal "$279.00", entry.fetch("linePriceDisplay")
  end

  def test_summary_totals_across_lines
    other = Product.create(
      title: "Mug", slug: "mug", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    mug = Variant.create(
      product_id: other.id, sku: "MUG-S", title: "Small", price_cents: 1_050,
      currency: "USD", stock: 10, position: 0
    )
    add(@variant, 2)
    add(mug, 3)

    summary = CartPayload.call(@cart).fetch("cart")

    assert_equal 5, summary.fetch("count")
    assert_equal false, summary.fetch("isEmpty")
    assert_equal 31_050, summary.fetch("subtotalCents") # 2*13950 + 3*1050
    assert_equal "$310.50", summary.fetch("subtotalDisplay")
  end

  def test_prices_follow_the_live_variant_not_a_stored_snapshot
    add(@variant, 2)
    @variant.update(price_cents: 10_000)

    payload = CartPayload.call(@cart)

    assert_equal "$200.00", payload.fetch("items").first.fetch("linePriceDisplay")
    assert_equal 20_000, payload.dig("cart", "subtotalCents")
  end

  def test_mixed_currencies_report_no_subtotal_rather_than_a_wrong_one
    other = Product.create(
      title: "Euro Thing", slug: "euro-thing", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    euro = Variant.create(
      product_id: other.id, sku: "EUR-1", title: "One", price_cents: 5_000,
      currency: "EUR", stock: 5, position: 0
    )
    add(@variant, 1)
    add(euro, 1)

    summary = CartPayload.call(@cart).fetch("cart")

    assert_equal 2, summary.fetch("count")
    assert_nil summary.fetch("subtotalCents")
    assert_equal "", summary.fetch("subtotalDisplay")
  end

  def test_a_line_whose_variant_vanished_is_dropped_rather_than_crashing
    add(@variant, 1)
    @variant.destroy

    payload = CartPayload.call(@cart)

    assert_equal [], payload.fetch("items")
    assert_equal true, payload.dig("cart", "isEmpty")
  end
end
