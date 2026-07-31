class Product < Sequel::Model
  one_to_many :variants, order: :position
  many_to_many :collections, join_table: :collection_products, order: Sequel[:collection_products][:position]
end
