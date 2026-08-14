Sequel.migration do
  change do
    create_table(:variants) do
      primary_key :id
      foreign_key :product_id, :products, null: false, on_delete: :cascade
      String :sku, null: false
      String :title, null: false
      Integer :price_cents, null: false
      String :currency, null: false, default: "USD"
      Integer :stock, null: false, default: 0
      Integer :position, null: false, default: 0
      index [:product_id, :position]
    end
  end
end
