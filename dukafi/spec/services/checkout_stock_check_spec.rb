require_relative "../spec_helper"

class CheckoutStockCheckSpec < Minitest::Test
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
      currency: "USD", stock: 1, position: 0
    )
  end

  def cart_with(variant, quantity)
    cart = Cart.create(
      session_key: SecureRandom.hex(8), status: "active",
      created_at: Time.now, updated_at: Time.now
    )
    CartItem.create(
      cart_id: cart.id, variant_id: variant.id, quantity: quantity,
      created_at: Time.now, updated_at: Time.now
    )
    cart
  end

  def test_an_empty_or_nil_cart_passes_trivially
    assert CheckoutStockCheck.call(nil).ok?
  end

  def test_a_cart_within_stock_passes
    result = CheckoutStockCheck.call(cart_with(@variant, 1))

    assert result.ok?
    assert_equal [], result.shortages
  end

  def test_a_short_line_is_identified_specifically_enough_to_show_the_customer
    @variant.update(stock: 2)
    result = CheckoutStockCheck.call(cart_with(@variant, 5))

    refute result.ok?
    shortage = result.shortages.fetch(0)
    assert_equal "BAG-L", shortage.sku
    assert_equal "Canvas Bag", shortage.title
    assert_equal "Large", shortage.variant_title
    assert_equal 5, shortage.requested
    # The customer can act on this: "Only 2 left", not a generic failure.
    assert_equal 2, shortage.available
  end

  # cart_items.variant_id is `null: false, on_delete: :cascade` (migration
  # 014), so deleting a variant DELETES the cart line rather than orphaning
  # it. The customer's cart silently shrinks — surprising enough to pin down,
  # and it means checkout sees a smaller cart, never a dangling line.
  def test_deleting_a_variant_removes_the_cart_line_entirely
    cart = cart_with(@variant, 1)
    assert_equal 1, CartItem.where(cart_id: cart.id).count

    @variant.destroy

    assert_equal 0, CartItem.where(cart_id: cart.id).count
    assert CheckoutStockCheck.call(cart).ok?
  end

  # The acceptance case: two customers race for the last unit.
  def test_two_sequential_checkouts_for_the_last_unit_only_one_succeeds
    first = cart_with(@variant, 1)
    second = cart_with(@variant, 1)

    # Both carts were built while stock was 1 — each looked fine on its own.
    assert CheckoutStockCheck.call(first).ok?
    assert CheckoutStockCheck.call(second).ok?

    assert CheckoutStockCheck.reserve!(first).ok?
    assert_equal 0, Variant[@variant.id].stock

    result = CheckoutStockCheck.reserve!(second)

    refute result.ok?, "second checkout must not succeed for the last unit"
    assert_equal "BAG-L", result.shortages.fetch(0).sku
    assert_equal 0, result.shortages.fetch(0).available
    # Not double-decremented, and never driven negative.
    assert_equal 0, Variant[@variant.id].stock
  end

  def test_a_failed_reserve_decrements_nothing_at_all
    other = Variant.create(
      product_id: @product.id, sku: "BAG-S", title: "Small", price_cents: 9_900,
      currency: "USD", stock: 10, position: 1
    )
    cart = cart_with(@variant, 1)
    CartItem.create(
      cart_id: cart.id, variant_id: other.id, quantity: 99,
      created_at: Time.now, updated_at: Time.now
    )

    result = CheckoutStockCheck.reserve!(cart)

    refute result.ok?
    # The in-stock line must NOT be consumed just because a later line failed —
    # a partial decrement would silently destroy inventory.
    assert_equal 1, Variant[@variant.id].stock
    assert_equal 10, Variant[other.id].stock
  end

  def test_reserve_joins_an_outer_transaction_so_a_rollback_undoes_it
    cart = cart_with(@variant, 1)

    # Task 07 wraps order creation + reserve! in one transaction; if the order
    # write fails, the stock decrement must go back with it.
    DB.transaction do
      assert CheckoutStockCheck.reserve!(cart).ok?
      assert_equal 0, Variant[@variant.id].stock
      raise Sequel::Rollback
    end

    assert_equal 1, Variant[@variant.id].stock
  end
end
