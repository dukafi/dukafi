Sequel.migration do
  change do
    create_table(:products) do
      primary_key :id
      String :title, null: false
      String :slug, null: false, unique: true
      String :description_document, text: true
      String :status, null: false, default: "draft"
      String :vendor
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end
  end
end
