require_relative "../spec_helper"

class ShippingSpec < Minitest::Test
  def setup
    PluginSetting.dataset.delete
    OrderItem.dataset.delete
    Order.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    @product = Product.create(title: "Bag", slug: "bag", status: "active", description_document: "",
                               created_at: Time.now, updated_at: Time.now)
    @variant = Variant.create(product_id: @product.id, sku: "BAG", title: "Default", price_cents: 2000,
                              currency: "USD", stock: 5, position: 0)
  end

  def cart
    cart = Cart.create(session_key: SecureRandom.hex(8), status: "active", created_at: Time.now, updated_at: Time.now)
    CartItem.create(cart_id: cart.id, variant_id: @variant.id, quantity: 1, created_at: Time.now, updated_at: Time.now)
    cart
  end

  def configure_flat_rate!(amount: 500, free_over: 0)
    settings = Dukafi::Plugins::Settings.for("flat_rate")
    settings[:amount] = amount.to_s
    settings[:free_over] = free_over.to_s
  end

  def test_no_provider_leaves_shipping_at_zero
    result = CreateOrder.call(cart: cart, email: "buyer@example.com", name: "Ada")
    assert result.ok?
    assert_equal 0, result.order.shipping_cents
  end

  def test_flat_rate_totals_are_applied
    configure_flat_rate!(amount: 500)
    result = CreateOrder.call(cart: cart, email: "buyer@example.com", name: "Ada",
                              shipping_provider: "flat_rate", shipping_rate: "flat")
    assert result.ok?, result.reason
    assert_equal 500, result.order.shipping_cents
    assert_equal 2500, result.order.total_cents
  end

  def test_server_re_resolves_the_chosen_rate
    configure_flat_rate!(amount: 700)
    rates = Shipping.rates(cart: cart)
    assert_equal 700, rates.first[:amountCents]
    selection = Shipping.resolve(cart: cart, provider_slug: "flat_rate", rate_id: "flat")
    assert_equal 700, selection.rate.amount_cents
  end

  def test_tampered_rate_is_rejected
    configure_flat_rate!(amount: 500)
    result = CreateOrder.call(cart: cart, email: "buyer@example.com", name: "Ada",
                              shipping_provider: "flat_rate", shipping_rate: "not-a-rate")
    refute result.ok?
    assert_equal "invalid_shipping", result.reason
  end
end
