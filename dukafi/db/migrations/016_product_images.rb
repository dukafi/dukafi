Sequel.migration do
  change do
    create_table(:product_images) do
      foreign_key :product_id, :products, null: false, on_delete: :cascade
      foreign_key :media_asset_id, :media_assets, null: false, on_delete: :cascade
      Integer :position, null: false, default: 0
      index [:product_id, :media_asset_id], unique: true
      index [:product_id, :position]
    end
  end
end
