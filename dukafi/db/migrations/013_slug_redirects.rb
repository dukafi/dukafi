Sequel.migration do
  change do
    create_table(:slug_redirects) do
      primary_key :id
      String :resource_type, null: false
      String :old_slug, null: false
      String :destination_slug, null: false
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      index %i[resource_type old_slug], unique: true
    end
  end
end
