require_relative "../spec_helper"

class CommerceStatsSpec < Minitest::Test
  def setup
    PaymentAttempt.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Discount.dataset.delete
    StorefrontLoad.dataset.delete
    @now = Time.utc(2026, 9, 9, 12, 0, 0)
    @product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: @now, updated_at: @now
    )
    @variant = Variant.create(
      product_id: @product.id, sku: "BAG-L", title: "Large", price_cents: 10_000,
      currency: "KES", stock: 20, position: 0
    )
    @featured = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    CollectionProduct.dataset.insert(collection_id: @featured.id, product_id: @product.id, position: 0)
  end

  def order(status:, total:, at:, sku: "BAG-L", title: "Canvas Bag", quantity: 1, discount: 0, code: nil)
    row = Order.create(
      email: "buyer@example.com", status: status, currency: "KES",
      subtotal_cents: total + discount, discount_cents: discount, shipping_cents: 0,
      total_cents: total, discount_code: code, public_token: SecureRandom.hex(8),
      created_at: at, updated_at: at
    )
    OrderItem.create(
      order_id: row.id, product_title: title, variant_title: "Large", sku: sku,
      unit_price_cents: total / quantity, quantity: quantity, created_at: at
    )
    row
  end

  def stats(period = "30d")
    CommerceStats.call(period: period, now: @now)
  end

  def test_revenue_counts_paid_fulfilled_and_shipped_not_pending_or_refunded
    order(status: "paid", total: 5_000, at: @now - 86_400)
    order(status: "fulfilled", total: 3_000, at: @now - 86_400)
    order(status: "pending", total: 9_000, at: @now - 86_400)
    order(status: "refunded", total: 2_000, at: @now - 86_400)

    overview = stats.fetch(:overview)
    assert_equal 8_000, overview.fetch(:revenueCents)
    assert_equal 2, overview.fetch(:orders)
    assert_equal 4_000, overview.fetch(:aovCents)
    assert_equal 2, overview.fetch(:units)
  end

  def test_ignores_orders_outside_the_period
    order(status: "paid", total: 1_000, at: @now - (40 * 86_400))
    order(status: "paid", total: 4_000, at: @now - 86_400)

    assert_equal 4_000, stats.fetch(:overview).fetch(:revenueCents)
  end

  def test_growth_compares_the_same_length_window_before
    order(status: "paid", total: 2_000, at: @now - (40 * 86_400))
    order(status: "paid", total: 4_000, at: @now - 86_400)

    deltas = stats.fetch(:overview).fetch(:deltas)
    assert_equal 100.0, deltas.fetch(:revenuePct)
  end

  def test_top_products_rank_by_revenue_not_units
    cheap = Product.create(
      title: "Postcard", slug: "postcard", status: "active",
      description_document: "", created_at: @now, updated_at: @now
    )
    Variant.create(
      product_id: cheap.id, sku: "CARD-1", title: "Default", price_cents: 100,
      currency: "KES", stock: 50, position: 0
    )
    order(status: "paid", total: 10_000, at: @now - 3_600, sku: "BAG-L", title: "Canvas Bag", quantity: 1)
    order(status: "paid", total: 500, at: @now - 3_600, sku: "CARD-1", title: "Postcard", quantity: 5)

    top = stats.fetch(:topProducts)
    assert_equal "Canvas Bag", top.first.fetch(:title)
    assert_equal 10_000, top.first.fetch(:revenueCents)
    assert_equal "Postcard", top.last.fetch(:title)
  end

  def test_top_collections_follow_product_membership
    order(status: "paid", total: 7_000, at: @now - 3_600)

    featured = stats.fetch(:topCollections).first
    assert_equal "featured", featured.fetch(:slug)
    assert_equal 7_000, featured.fetch(:revenueCents)
  end

  def test_abandoned_carts_are_active_carts_with_items_older_than_a_day
    stale = Cart.create(
      session_key: "stale", status: "active",
      created_at: @now - (36 * 3600), updated_at: @now - (36 * 3600)
    )
    CartItem.create(
      cart_id: stale.id, variant_id: @variant.id, quantity: 1,
      created_at: @now - (36 * 3600), updated_at: @now - (36 * 3600)
    )
    Cart.where(id: stale.id).update(updated_at: @now - (36 * 3600))
    fresh = Cart.create(
      session_key: "fresh", status: "active",
      created_at: @now - 600, updated_at: @now - 600
    )
    CartItem.create(
      cart_id: fresh.id, variant_id: @variant.id, quantity: 1,
      created_at: @now - 600, updated_at: @now - 600
    )
    empty = Cart.create(
      session_key: "empty", status: "active",
      created_at: @now - (48 * 3600), updated_at: @now - (48 * 3600)
    )
    converted = Cart.create(
      session_key: "converted", status: "converted",
      created_at: @now - (48 * 3600), updated_at: @now - (48 * 3600)
    )
    CartItem.create(
      cart_id: converted.id, variant_id: @variant.id, quantity: 1,
      created_at: @now - (48 * 3600), updated_at: @now - (48 * 3600)
    )

    assert_equal 1, stats.fetch(:abandonedCarts).fetch(:count)
    assert_equal 24, stats.fetch(:abandonedCarts).fetch(:olderThanHours)
    assert_equal "active", Cart[empty.id].status
  end

  def test_discount_digest_uses_the_code_on_the_order
    order(status: "paid", total: 9_000, at: @now - 3_600, discount: 1_000, code: "SAVE10")
    order(status: "paid", total: 5_000, at: @now - 3_600)

    discounts = stats.fetch(:discounts)
    assert_equal 1, discounts.fetch(:ordersWithCode)
    assert_equal 1_000, discounts.fetch(:discountCents)
    assert_equal "SAVE10", discounts.fetch(:codes).first.fetch(:code)
  end

  def test_payments_split_by_status_and_provider
    paid = order(status: "paid", total: 2_000, at: @now - 3_600)
    PaymentAttempt.create(
      order_id: paid.id, provider: "payhero", status: "succeeded",
      amount_cents: 2_000, currency: "KES", reference: "ok-1",
      created_at: @now - 3_600, updated_at: @now - 3_600
    )
    PaymentAttempt.create(
      order_id: paid.id, provider: "payhero", status: "failed",
      amount_cents: 2_000, currency: "KES", reference: "fail-1",
      created_at: @now - 3_500, updated_at: @now - 3_500
    )

    assert_equal 1, stats.fetch(:paymentsByStatus).fetch("succeeded")
    assert_equal 1, stats.fetch(:paymentsByStatus).fetch("failed")
    provider = stats.fetch(:paymentsByProvider).first
    assert_equal "payhero", provider.fetch(:provider)
    assert_equal 2_000, provider.fetch(:amountCents)
  end

  def test_unknown_period_falls_back_to_thirty_days
    assert_equal "30d", stats("not-a-window").fetch(:period)
  end

  def test_traffic_counts_storefront_page_views_not_visitors
    StorefrontLoad.record!(path: "/", at: @now - 86_400)
    StorefrontLoad.record!(path: "/", at: @now - 86_400)
    StorefrontLoad.record!(path: "/about", at: @now - 86_400)
    StorefrontLoad.record!(path: "/", at: @now - (40 * 86_400))

    traffic = stats.fetch(:traffic)
    assert traffic.fetch(:available)
    assert_equal 3, traffic.fetch(:pageViews)
    refute traffic.key?(:visitors)
    refute traffic.key?(:uniqueVisitors)
    paths = traffic.fetch(:paths)
    assert_equal "/", paths.first.fetch(:path)
    assert_equal 2, paths.first.fetch(:views)
    assert_equal 200.0, traffic.fetch(:deltas).fetch(:pageViewsPct)
  end
end
