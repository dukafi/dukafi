require "sequel"

Sequel.migration do
  change do
    alter_table(:media_assets) { add_column :storage, String, null: false, default: "local" }
    create_table(:published_files) do
      Integer :version, null: false
      String :path, null: false
      File :content, null: false
      String :content_type, null: false
      primary_key %i[version path]
    end
    create_table(:published_states) do
      Integer :id, primary_key: true
      Integer :current_version, null: false, default: 0
    end
    from(:published_states).insert(id: 1, current_version: 0)
  end
end
