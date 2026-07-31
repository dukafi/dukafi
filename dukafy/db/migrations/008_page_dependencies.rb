Sequel.migration do
  change do
    create_table(:page_dependencies) do
      String :page_path, null: false
      foreign_key :product_id, :products, null: false, on_delete: :cascade
      index [:page_path, :product_id], unique: true
    end
  end
end
