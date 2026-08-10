class OrderItem < Sequel::Model
  many_to_one :order
  many_to_one :variant

  def validate
    super
    validates_presence %i[order_id product_title variant_title sku]
    validates_integer %i[unit_price_cents quantity]
    validates_min_value 0, :unit_price_cents
    validates_min_value 1, :quantity
  end
end
