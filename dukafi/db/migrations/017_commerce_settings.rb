Sequel.migration do
  change do
    create_table(:commerce_settings) do
      primary_key :id
      String :currency, null: false, default: "USD"
      Integer :low_stock_threshold, null: false, default: 5
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end
  end
end
