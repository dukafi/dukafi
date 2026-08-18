Sequel.migration do
  change do
    # Merchant-defined collections that are not products — a team roster, a
    # FAQ, a lookbook. Schema lives on the table; cells live on the row.
    # Published pages bake these the same way they bake the catalogue, so the
    # storefront stays static HTML.
    create_table(:custom_tables) do
      primary_key :id
      String :name, null: false
      String :slug, null: false, unique: true
      String :columns_json, text: true, null: false, default: "[]"
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end

    create_table(:custom_rows) do
      primary_key :id
      foreign_key :custom_table_id, :custom_tables, null: false, on_delete: :cascade
      String :slug, null: false
      Integer :position, null: false, default: 0
      String :cells_json, text: true, null: false, default: "{}"
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      index [:custom_table_id, :slug], unique: true
      index [:custom_table_id, :position]
    end
  end
end
