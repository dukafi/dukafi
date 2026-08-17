Sequel.migration do
  change do
    # Rows a plugin owns that are not core commerce — a Woo id → product id
    # map, a bookings table, an import inbox. Plugins never get raw SQL;
    # they go through PluginStorage, which writes here.
    create_table(:plugin_records) do
      primary_key :id
      String :plugin_id, null: false
      String :collection, null: false
      String :key, null: false
      String :payload, text: true, null: false, default: "{}"
      DateTime :updated_at, null: false
      index [:plugin_id, :collection]
      unique [:plugin_id, :collection, :key]
    end
  end
end
