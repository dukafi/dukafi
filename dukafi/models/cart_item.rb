class CartItem < Sequel::Model
  many_to_one :cart
  many_to_one :variant

  def validate
    super
    validates_presence %i[cart_id variant_id]
    validates_integer :quantity
    validates_min_value 1, :quantity
  end
end
