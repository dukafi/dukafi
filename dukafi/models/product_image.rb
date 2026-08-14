class ProductImage < Sequel::Model
  set_primary_key [:product_id, :media_asset_id]
  many_to_one :product
  many_to_one :media_asset
end
