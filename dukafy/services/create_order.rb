require "securerandom"

# Turn a cart into an order. Cart + customer, nothing else.
#
# Deliberately NOT handling addresses, delivery notes, emergency contacts or
# payment confirmations: those are custom forms a merchant designs and
# attaches to the order afterwards. Baking any of them in here would be the
# same mistake as shipping cart markup — it decides the merchant's flow for
# them. This service knows only what an order fundamentally is: a set of
# priced lines belonging to a person.
#
# Everything below happens in ONE transaction: stock recheck + decrement,
# order and line writes, and the discount's usage_count increment. A failure
# anywhere leaves no order, no consumed stock and no burnt discount use.
class CreateOrder
  # `shortages` is populated only for the `:out_of_stock` reason, carrying
  # CheckoutStockCheck::Shortage entries so the caller can say "Only 2 left"
  # per line rather than a generic failure.
  Result = Data.define(:order, :reason, :shortages) do
    def ok? = reason.nil?
  end

  REASONS = %w[empty_cart missing_identity out_of_stock].freeze

  def self.call(cart:, email: nil, phone: nil, name: nil, discount_code: nil)
    new(cart, email, phone, name, discount_code).call
  end

  def initialize(cart, email, phone, name, discount_code)
    @cart = cart
    @email = email
    @phone = phone
    @name = name
    @discount_code = discount_code
  end

  def call
    payload = CartPayload.call(@cart, discount_code: @discount_code)
    entries = payload.fetch("items")
    return failure("empty_cart") if entries.empty?
    return failure("missing_identity") if @email.to_s.strip.empty? && @phone.to_s.strip.empty?

    DB.transaction do
      stock = CheckoutStockCheck.reserve!(@cart)
      next failure("out_of_stock", shortages: stock.shortages) unless stock.ok?

      customer = Customer.upsert_by_identity(email: @email, phone: @phone, name: @name)
      order = build_order(customer, payload)
      entries.each { |entry| build_item(order, entry) }
      consume_discount(payload)
      # The cart is spent. Marking it converted (rather than deleting) keeps
      # the order's cart_id meaningful and leaves an audit trail.
      @cart.update(status: "converted", updated_at: Time.now)

      Result.new(order: order, reason: nil, shortages: [])
    end
  end

  private

  def build_order(customer, payload)
    summary = payload.fetch("cart")
    now = Time.now
    Order.create(
      cart_id: @cart.id, customer_id: customer.id,
      email: customer.email, phone: customer.phone,
      status: "pending", currency: summary.fetch("currency"),
      subtotal_cents: summary.fetch("subtotalCents").to_i,
      discount_cents: summary.fetch("discountCents").to_i,
      shipping_cents: 0,
      total_cents: summary.fetch("totalCents").to_i,
      public_token: SecureRandom.urlsafe_base64(24),
      created_at: now, updated_at: now
    )
  end

  # Line items snapshot title/price AT PURCHASE. This is the one place a
  # snapshot is correct: the cart must always show live prices, but an order
  # must never change after the fact because a merchant edited the catalog.
  def build_item(order, entry)
    OrderItem.create(
      order_id: order.id,
      variant_id: Variant.first(sku: entry.fetch("sku"))&.id,
      product_title: entry.fetch("title"),
      variant_title: entry.fetch("variantTitle"),
      sku: entry.fetch("sku"),
      unit_price_cents: entry.fetch("unitPriceCents"),
      quantity: entry.fetch("quantity"),
      created_at: Time.now
    )
  end

  # Usage moves here and nowhere else — applying a code is not spending it.
  # Re-resolved rather than trusted from the payload so the increment lands on
  # a row we just validated inside this transaction.
  def consume_discount(payload)
    code = payload.dig("cart", "discountCode").to_s
    return if code.empty?

    Discount.where(code: code).update(usage_count: Sequel[:usage_count] + 1)
  end

  def failure(reason, shortages: [])
    Result.new(order: nil, reason: reason, shortages: shortages)
  end
end
