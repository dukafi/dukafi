require_relative "../spec_helper"

class CreateOrderSpec < Minitest::Test
  def setup
    OrderItem.dataset.delete
    Address.dataset.delete
    Order.dataset.delete
    Customer.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    Discount.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    @product = Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    @variant = Variant.create(
      product_id: @product.id, sku: "BAG-L", title: "Large", price_cents: 13_950,
      currency: "USD", stock: 5, position: 0
    )
  end

  def cart_with(quantity: 2, variant: @variant)
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

  def test_creates_an_order_from_cart_and_customer_only
    cart = cart_with(quantity: 2)

    result = CreateOrder.call(cart: cart, email: "Buyer@Example.COM", name: "Ada")

    assert result.ok?, result.reason
    order = result.order
    assert_equal 27_900, order.subtotal_cents
    assert_equal 27_900, order.total_cents
    assert_equal "pending", order.status
    assert_equal 1, OrderItem.where(order_id: order.id).count
    # Stock consumed, cart spent.
    assert_equal 3, Variant[@variant.id].stock
    assert_equal "converted", Cart[cart.id].status
  end

  def test_order_lines_snapshot_price_so_a_later_catalog_edit_cannot_rewrite_history
    cart = cart_with(quantity: 2)
    order = CreateOrder.call(cart: cart, email: "b@example.com").order

    @variant.update(price_cents: 999, title: "Renamed")

    item = OrderItem.first(order_id: order.id)
    assert_equal 13_950, item.unit_price_cents
    assert_equal "Large", item.variant_title
    assert_equal "Canvas Bag", item.product_title
    assert_equal 27_900, Order[order.id].total_cents
  end

  def test_phone_only_checkout_is_allowed
    result = CreateOrder.call(cart: cart_with, phone: "+254 712 345 678", name: "Wanjiru")

    assert result.ok?, result.reason
    assert_nil result.order.email
    # Normalised, so the same person typing it differently is one record.
    assert_equal "+254712345678", result.order.phone
  end

  def test_an_order_with_neither_email_nor_phone_is_refused
    result = CreateOrder.call(cart: cart_with)

    refute result.ok?
    assert_equal "missing_identity", result.reason
    assert_equal 0, Order.count
    assert_equal 5, Variant[@variant.id].stock
  end

  def test_an_empty_cart_creates_nothing
    cart = Cart.create(
      session_key: SecureRandom.hex(8), status: "active",
      created_at: Time.now, updated_at: Time.now
    )

    result = CreateOrder.call(cart: cart, email: "b@example.com")

    refute result.ok?
    assert_equal "empty_cart", result.reason
    assert_equal 0, Order.count
  end

  def test_out_of_stock_names_the_short_lines_and_writes_nothing
    cart = cart_with(quantity: 2)
    @variant.update(stock: 1)

    result = CreateOrder.call(cart: cart, email: "b@example.com")

    refute result.ok?
    assert_equal "out_of_stock", result.reason
    assert_equal "BAG-L", result.shortages.fetch(0).sku
    assert_equal 1, result.shortages.fetch(0).available
    # Nothing partially applied: no order, no customer, stock untouched.
    assert_equal 0, Order.count
    assert_equal 0, Customer.count
    assert_equal 1, Variant[@variant.id].stock
    assert_equal "active", Cart[cart.id].status
  end

  def test_a_returning_customer_matches_their_existing_record
    CreateOrder.call(cart: cart_with(quantity: 1), email: "ada@example.com", name: "Ada")
    CreateOrder.call(cart: cart_with(quantity: 1), email: "ADA@example.com")

    assert_equal 1, Customer.count
    assert_equal 2, Order.count
    assert_equal 2, Customer.first.orders.count
  end

  def test_a_phone_customer_who_later_gives_an_email_stays_one_record
    CreateOrder.call(cart: cart_with(quantity: 1), phone: "+254712345678")
    CreateOrder.call(cart: cart_with(quantity: 1), phone: "+254712345678", email: "later@example.com")

    assert_equal 1, Customer.count
    customer = Customer.first
    assert_equal "later@example.com", customer.email
    assert_equal "+254712345678", customer.phone
  end

  def test_a_discount_is_applied_and_its_usage_consumed_exactly_once
    discount = Discount.create(
      code: "SAVE10", kind: "percentage", value: 10, starts_at: Time.now - 3600,
      usage_limit: 5, usage_count: 0, created_at: Time.now, updated_at: Time.now
    )

    result = CreateOrder.call(cart: cart_with(quantity: 2), email: "b@example.com", discount_code: "SAVE10")

    assert result.ok?
    assert_equal 27_900, result.order.subtotal_cents
    assert_equal 2_790, result.order.discount_cents
    assert_equal 25_110, result.order.total_cents
    # Spending the code is what moves usage — applying it never did.
    assert_equal 1, Discount[discount.id].usage_count
  end

  def test_a_failed_order_does_not_burn_a_discount_use
    discount = Discount.create(
      code: "SAVE10", kind: "percentage", value: 10, starts_at: Time.now - 3600,
      usage_limit: 5, usage_count: 0, created_at: Time.now, updated_at: Time.now
    )
    cart = cart_with(quantity: 9) # more than the 5 in stock

    result = CreateOrder.call(cart: cart, email: "b@example.com", discount_code: "SAVE10")

    refute result.ok?
    assert_equal 0, Discount[discount.id].usage_count
  end

  def test_every_order_gets_an_unguessable_public_token
    a = CreateOrder.call(cart: cart_with(quantity: 1), email: "a@example.com").order
    b = CreateOrder.call(cart: cart_with(quantity: 1), email: "b@example.com").order

    refute_equal a.public_token, b.public_token
    assert_operator a.public_token.length, :>=, 24
  end
  # ── Who the order belongs to ─────────────────────────────────────────────

  # The bug this exists to prevent: a signed-in shopper typed a different
  # address at checkout, the order attached itself to whichever customer that
  # address matched, and `/orders/<token>` then 404'd for the person who had
  # just placed it — their own order, invisible to them.
  def test_a_signed_in_shopper_owns_the_order_whatever_email_they_type
    buyer = Customer.create(email: "buyer@example.com", created_at: Time.now, updated_at: Time.now)
    Customer.create(email: "someone.else@example.com", created_at: Time.now, updated_at: Time.now)
    cart = cart_with

    result = CreateOrder.call(cart: cart, email: "someone.else@example.com", customer: buyer)

    assert result.ok?, result.reason
    assert_equal buyer.id, result.order.customer_id
    # The typed address is still the contact for THIS order — ordering
    # something for a relative is not changing who you are.
    assert_equal "someone.else@example.com", result.order.email
  end

  # Guest checkout is unchanged: with nobody signed in, identity matching is
  # what keeps a returning guest as one customer record.
  def test_a_guest_order_still_matches_by_identity
    existing = Customer.create(email: "guest@example.com", created_at: Time.now, updated_at: Time.now)
    cart = cart_with

    result = CreateOrder.call(cart: cart, email: "guest@example.com")

    assert_equal existing.id, result.order.customer_id
  end

end
