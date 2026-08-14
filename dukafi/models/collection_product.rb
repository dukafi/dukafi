class CollectionProduct < Sequel::Model
  set_primary_key [:collection_id, :product_id]
  many_to_one :collection
  many_to_one :product
end
