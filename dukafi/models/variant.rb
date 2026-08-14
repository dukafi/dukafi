class Variant < Sequel::Model
  many_to_one :product

  def validate
    super
    validates_presence %i[product_id sku title currency]
    validates_integer %i[price_cents stock position]
    validates_min_value 0, %i[price_cents stock position]
    validates_format(/\A[A-Z]{3}\z/, :currency, message: "must be a three-letter currency code")

    duplicate = self.class.where(product_id:, sku:).exclude(id:).first if product_id && !sku.to_s.empty?
    errors.add(:sku, "has already been used for this product") if duplicate
  end
end
