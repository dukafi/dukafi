Sequel.migration do
  change do
    alter_table(:customers) do
      # NULLABLE on purpose. Guest checkout stays the default path, so most
      # customer rows never have a password — the column marks the few who
      # turned their order history into an account. Adding it here rather than
      # in a new table keeps a returning customer ONE record whether they
      # ordered as a guest or signed in, which is the whole point of the
      # identity matching in `Customer.upsert_by_identity`.
      add_column :password_digest, String, null: true
    end
  end
end
