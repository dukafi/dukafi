Sequel.migration do
  change do
    create_table(:pages) do
      primary_key :id
      String :slug, null: false, unique: true
      String :title, null: false
      String :kind, null: false, default: "page"
      String :document, text: true, null: false
      String :status, null: false, default: "draft"
      String :published_document, text: true
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      check(kind: %w[page template])
      check(status: %w[draft published])
    end
  end
end
