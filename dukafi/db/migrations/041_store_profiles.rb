Sequel.migration do
  change do
    # Optional facts the merchant typed about their own business. Empty is
    # valid: Assist, publish, and the storefront do not read this table, and
    # nothing may refuse to boot because the row is blank.
    create_table(:store_profiles) do
      primary_key :id
      String :started_on, null: false, default: ""
      String :audience, text: true, null: false, default: ""
      String :difference, text: true, null: false, default: ""
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end
  end
end
