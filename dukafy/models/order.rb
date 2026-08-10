class Order < Sequel::Model
  one_to_many :order_items
  one_to_many :addresses
  many_to_one :cart
  many_to_one :customer

  STATUSES = %w[pending paid fulfilled shipped refunded].freeze

  def validate
    super
    validates_presence %i[status currency]
    # Phone OR email, mirroring Customer: a phone-first order (M-Pesa) has no
    # email to require, and a web order may have no phone.
    if email.to_s.empty? && phone.to_s.empty?
      errors.add(:base, "needs an email address or a phone number")
    end
    errors.add(:status, "must be one of #{STATUSES.join(', ')}") unless STATUSES.include?(status)
    validates_integer %i[subtotal_cents discount_cents shipping_cents total_cents]
    validates_min_value 0, %i[subtotal_cents discount_cents shipping_cents total_cents]
    validates_format(/\A[A-Z]{3}\z/, :currency, message: "must be a three-letter currency code")
  end
end
