Sequel.migration do
  change do
    create_table(:admins) do
      primary_key :id
      String :email, null: false, unique: true
      String :password_digest, null: false
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end
  end
end
