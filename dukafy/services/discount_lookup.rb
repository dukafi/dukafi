# Validate a discount code against a cart subtotal and compute the amount off.
#
# Pure evaluation — this never mutates anything. `usage_count` increments only
# on successful order creation (task 07), so a customer can apply and remove a
# code freely before paying without burning a limited-use code.
#
# Every cart render re-runs this, which is what lets an expired or exhausted
# code drop out silently instead of erroring at checkout: the reason codes
# below are for the moment of applying, but a stored code that later fails
# simply stops contributing.
class DiscountLookup
  # `reason` is nil when ok. The others are stable identifiers for the UI to
  # phrase however it likes — Dukafy doesn't ship discount copy either.
  Result = Data.define(:discount, :amount_cents, :reason) do
    def ok? = reason.nil?
  end

  REASONS = %w[not_found not_started expired exhausted empty_cart].freeze

  def self.call(code, subtotal_cents)
    new(code, subtotal_cents).call
  end

  def initialize(code, subtotal_cents)
    @code = code.to_s.strip
    @subtotal_cents = subtotal_cents.to_i
  end

  def call
    return failure("not_found") if @code.empty?

    # Codes are stored uppercased by `Discount#code=`, so uppercasing the
    # input is the whole of the case-insensitive match.
    discount = Discount.first(code: @code.upcase)
    return failure("not_found") unless discount

    now = Time.now
    return failure("not_started", discount) if discount.starts_at && discount.starts_at > now
    return failure("expired", discount) if discount.ends_at && discount.ends_at <= now
    if discount.usage_limit && discount.usage_count.to_i >= discount.usage_limit
      return failure("exhausted", discount)
    end
    return failure("empty_cart", discount) if @subtotal_cents <= 0

    Result.new(discount: discount, amount_cents: amount_for(discount), reason: nil)
  end

  private

  def amount_for(discount)
    raw = case discount.kind
    # Round half up in integer arithmetic — no floats anywhere near money.
    # Plain `/ 100` truncates, which would quietly shortchange the customer
    # on every non-round subtotal (10% of 2999 = 299 instead of 300).
    when "percentage" then ((@subtotal_cents * discount.value) + 50) / 100
    when "fixed" then discount.value
    else 0
    end
    # Never discount more than the cart is worth — a fixed £20 code on a £5
    # cart must not produce a negative total for the customer to "pay".
    [[raw, @subtotal_cents].min, 0].max
  end

  def failure(reason, discount = nil)
    Result.new(discount: discount, amount_cents: 0, reason: reason)
  end
end
