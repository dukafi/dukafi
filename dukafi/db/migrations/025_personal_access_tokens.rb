Sequel.migration do
  change do
    create_table(:personal_access_tokens) do
      primary_key :id
      # What the merchant called it — "Cursor on my laptop", "Lovable".
      String :name, null: false
      # SHA-256 of the token. Not bcrypt: the token is 256 bits of random, so
      # there is nothing to brute-force, and bcrypt would put a deliberate
      # ~100ms delay on EVERY MCP request.
      String :token_hash, null: false, unique: true
      # The leading characters, stored in clear so the admin can show
      # "dkf_a1b2c3…" next to the name. The secret half is never recoverable.
      String :token_prefix, null: false
      DateTime :last_used_at
      DateTime :revoked_at
      DateTime :created_at, null: false
      DateTime :updated_at, null: false

      index :token_hash, unique: true
    end
  end
end
