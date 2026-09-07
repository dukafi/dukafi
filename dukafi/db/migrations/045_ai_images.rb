require "sequel"

Sequel.migration do
  change do
    alter_table(:media_assets) do
      add_column :origin, String, null: false, default: "upload"
      add_column :origin_meta, String, text: true
    end
    create_table(:ai_usage_events) do
      primary_key :id
      String :kind, null: false
      String :provider, null: false
      String :model
      foreign_key :connection_id, :ai_connections, null: true, on_delete: :set_null
      TrueClass :ok, null: false
      Integer :duration_ms, null: false
      String :error_class
      DateTime :created_at, null: false, default: Sequel::CURRENT_TIMESTAMP
      index [:kind, :created_at]
    end
  end
end
