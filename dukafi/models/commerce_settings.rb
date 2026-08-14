class CommerceSettings < Sequel::Model
  def validate
    super
    validates_format(/\A[A-Z]{3}\z/, :currency, message: "must be a 3-letter currency code")
    errors.add(:low_stock_threshold, "must be zero or more") if low_stock_threshold && low_stock_threshold.negative?
  end

  # The store has exactly one settings row — v1 is single-currency
  # (VISION.md's post-1.0 parking lot explicitly defers multi-currency).
  def self.current
    first || create(currency: "USD", low_stock_threshold: 5, created_at: Time.now, updated_at: Time.now)
  end
end
