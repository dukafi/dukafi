Sequel.migration do
  change do
    alter_table(:collections) do
      add_foreign_key :media_asset_id, :media_assets, null: true, on_delete: :set_null
    end
  end
end
