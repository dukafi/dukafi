Sequel.migration do
  change do
    # Extra attributes a plugin (or the merchant) hangs off the catalogue —
    # car origin, mileage, a booking duration. Not new columns: coffee shops
    # do not grow a mileage field. JSON, namespaced by plugin id.
    add_column :products, :fields, String, text: true, null: false, default: "{}"
    add_column :variants, :fields, String, text: true, null: false, default: "{}"
  end
end
