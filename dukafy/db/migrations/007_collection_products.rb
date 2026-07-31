Sequel.migration do
  change do
    create_table(:collection_products) do
      foreign_key :collection_id, :collections, null: false, on_delete: :cascade
      foreign_key :product_id, :products, null: false, on_delete: :cascade
      Integer :position, null: false, default: 0
      index [:collection_id, :product_id], unique: true
      index [:collection_id, :position]
    end
  end
end
