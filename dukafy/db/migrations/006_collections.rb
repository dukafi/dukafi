Sequel.migration do
  change do
    create_table(:collections) do
      primary_key :id
      String :title, null: false
      String :slug, null: false, unique: true
      String :description, text: true
      Integer :sort_order, null: false, default: 0
    end
  end
end
