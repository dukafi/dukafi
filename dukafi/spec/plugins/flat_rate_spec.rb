require_relative "../spec_helper"

class FlatRatePluginSpec < Minitest::Test
  def setup
    PluginSetting.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    product = Product.create(title: "Bag", slug: "bag", status: "active", description_document: "",
                              created_at: Time.now, updated_at: Time.now)
    @variant = Variant.create(product_id: product.id, sku: "BAG", title: "Default", price_cents: 4000,
                               currency: "USD", stock: 5, position: 0)
  end

  def cart_of(quantity)
    cart = Cart.create(session_key: SecureRandom.hex(8), status: "active", created_at: Time.now, updated_at: Time.now)
    CartItem.create(cart_id: cart.id, variant_id: @variant.id, quantity: quantity, created_at: Time.now, updated_at: Time.now)
    cart
  end

  def test_amount_and_free_over
    config = { amount: 800, free_over: 5000 }
    rate = FlatRateShipping::Provider.rates(cart: cart_of(1), address: {}, config: config).first
    assert_equal "flat", rate.id
    assert_equal "Standard delivery", rate.label
    assert_equal 800, rate.amount_cents

    free = FlatRateShipping::Provider.rates(cart: cart_of(2), address: {}, config: config).first
    assert_equal 0, free.amount_cents
  end
end
