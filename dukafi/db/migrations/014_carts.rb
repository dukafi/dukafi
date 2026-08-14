Sequel.migration do
  change do
    create_table(:carts) do
      primary_key :id
      String :session_key, null: false, unique: true
      String :status, null: false, default: "active"
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end

    create_table(:cart_items) do
      primary_key :id
      foreign_key :cart_id, :carts, null: false, on_delete: :cascade
      foreign_key :variant_id, :variants, null: false, on_delete: :cascade
      Integer :quantity, null: false, default: 1
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      index %i[cart_id variant_id], unique: true
    end
  end
end
