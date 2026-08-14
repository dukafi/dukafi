Sequel.migration do
  change do
    create_table(:site_states) do
      primary_key :id
      String :site_json, text: true, null: false
      Integer :seq, null: false, default: 0
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end
  end
end
