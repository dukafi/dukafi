class Discount < Sequel::Model
  KINDS = %w[percentage fixed].freeze

  def code=(value)
    super(value.to_s.upcase)
  end

  def validate
    super
    validates_presence %i[code kind value starts_at]
    errors.add(:kind, "must be percentage or fixed") unless KINDS.include?(kind)
    validates_integer :value
    validates_min_value 1, :value
  end
end
