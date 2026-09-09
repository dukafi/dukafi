Sequel.migration do
  change do
    # Daily page-view totals for HTML the Ruby storefront actually served.
    # One row per day+path, not a row per hit, and not unique visitors.
    create_table(:storefront_loads) do
      primary_key :id
      Date :day, null: false
      String :path, null: false
      Integer :views, null: false, default: 0
      index [:day, :path], unique: true
      index :day
    end
  end
end
