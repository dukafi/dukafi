class CommerceSettings < Sequel::Model
  # The store has exactly one settings row — v1 is single-currency
  # (VISION.md's post-1.0 parking lot explicitly defers multi-currency).
  DEFAULT_CURRENCY = "KES".freeze
  DEFAULT_LOW_STOCK_THRESHOLD = 5

  def validate
    super
    validates_format(/\A[A-Z]{3}\z/, :currency, message: "must be a 3-letter currency code")
    errors.add(:low_stock_threshold, "must be zero or more") if low_stock_threshold && low_stock_threshold.negative?
  end

  def self.current
    first || create(
      currency: DEFAULT_CURRENCY,
      low_stock_threshold: DEFAULT_LOW_STOCK_THRESHOLD,
      created_at: Time.now, updated_at: Time.now,
    )
  end
end
