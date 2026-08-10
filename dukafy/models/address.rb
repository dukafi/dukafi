class Address < Sequel::Model
  many_to_one :order

  KINDS = %w[shipping billing].freeze

  def validate
    super
    validates_presence %i[order_id kind name line1 city postal_code country]
    errors.add(:kind, "must be shipping or billing") unless KINDS.include?(kind)
  end
end
