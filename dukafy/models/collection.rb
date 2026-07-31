class Collection < Sequel::Model
  many_to_many :products, join_table: :collection_products, order: Sequel[:collection_products][:position]
end
