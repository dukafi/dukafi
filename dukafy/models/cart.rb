class Cart < Sequel::Model
  one_to_many :cart_items

  def validate
    super
    validates_presence %i[session_key status]
    errors.add(:status, "must be active or converted") unless %w[active converted].include?(status)
  end
end
