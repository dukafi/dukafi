Sequel.migration do
  change do
    create_table(:media_assets) do
      primary_key :id
      String :path, null: false
      String :mime, null: false
      Integer :width
      Integer :height
      String :variants_json, text: true
      DateTime :created_at, null: false
    end
  end
end
