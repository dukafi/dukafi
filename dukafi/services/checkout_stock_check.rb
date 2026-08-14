# Re-verify every cart line against CURRENT stock, at checkout time.
#
# Add-to-cart already checks stock (`fragments.rb`), but that is a
# point-in-time check: two customers can both add the last unit, and neither
# add is wrong at the moment it happens. The only check that can actually
# prevent overselling is the one that runs in the same transaction as the
# write that consumes the stock.
#
# Callers MUST run this inside the same `DB.transaction` as order creation and
# the stock decrement. SQLite gives us a single writer, so a check followed by
# a decrement in one transaction cannot interleave with another checkout —
# no row locking needed. Called outside a transaction, the result is advisory
# only and can be stale by the time you act on it.
class CheckoutStockCheck
  # One line that can no longer be fulfilled. `available` is what's actually
  # in stock now, so checkout can say "Only 2 left" rather than a generic
  # failure the customer can't act on.
  Shortage = Data.define(:sku, :title, :variant_title, :requested, :available)

  Result = Data.define(:shortages) do
    def ok? = shortages.empty?
  end

  def self.call(cart)
    new(cart).call
  end

  # Check AND consume stock atomically — the only sequence that actually
  # prevents overselling. `call` on its own is advisory: whatever it reports
  # can be stale the instant it returns.
  #
  # Returns the same Result. On any shortage nothing is decremented, so a
  # failed checkout can't leave stock partially consumed. Sequel joins an
  # already-open transaction rather than nesting a new one, so task 07 can
  # wrap this together with order creation and get one atomic unit.
  def self.reserve!(cart)
    DB.transaction do
      result = call(cart)
      next result unless result.ok?

      CartItem.where(cart_id: cart.id).eager(:variant).order(:id).each do |item|
        variant = item.variant
        # `stock - quantity` is computed in SQL off the current row, not from
        # a value we read earlier, so the write can't be based on a stale read.
        Variant.where(id: variant.id).update(stock: Sequel[:stock] - item.quantity)
      end
      result
    end
  end

  def initialize(cart)
    @cart = cart
  end

  def call
    items = @cart ? CartItem.where(cart_id: @cart.id).eager(variant: :product).order(:id).all : []
    Result.new(shortages: items.filter_map { |item| shortage_for(item) })
  end

  private

  def shortage_for(item)
    variant = item.variant
    # Belt-and-braces: `cart_items.variant_id` is `null: false, on_delete:
    # :cascade`, so a deleted variant takes its cart line with it and this is
    # currently unreachable. It exists so relaxing that FK degrades to
    # "unavailable" rather than a nil crash mid-checkout.
    return Shortage.new(sku: "", title: "", variant_title: "", requested: item.quantity, available: 0) unless variant

    available = variant.stock.to_i
    return if available >= item.quantity

    Shortage.new(
      sku: variant.sku, title: variant.product&.title.to_s,
      variant_title: variant.title.to_s, requested: item.quantity, available: available
    )
  end
end
