Sequel.migration do
  change do
    create_table(:user_preferences) do
      primary_key :id
      foreign_key :admin_id, :admins, null: false, on_delete: :cascade
      String :key, null: false
      String :value_json, text: true, null: false
      DateTime :created_at, null: false
      DateTime :updated_at, null: false

      index %i[admin_id key], unique: true
    end
  end
end
