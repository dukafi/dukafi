Sequel.migration do
  change do
    # A customer record is NOT a login. Nothing here authenticates: there is
    # no password, no session. This exists so an order has a durable person to
    # hang off — the anchor for order history, attachable forms, and the CRM.
    #
    # Identity is phone OR email, neither individually required: a phone-first
    # market (M-Pesa) has customers with no email address, and a web-only
    # store has customers who never give a phone. The "at least one" rule is
    # enforced in the model, since SQLite CHECK constraints can't be altered
    # later without a table rebuild.
    create_table(:customers) do
      primary_key :id
      String :email
      String :phone
      String :name
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
      index :email, unique: true
      index :phone, unique: true
    end

    alter_table(:orders) do
      add_foreign_key :customer_id, :customers, null: true, on_delete: :set_null
      add_column :phone, String
      # Unguessable handle for "view my order" links — lets a guest see their
      # own order without an account, and without exposing sequential ids.
      add_column :public_token, String
      add_index :public_token, unique: true
    end

    # `orders.email` was created NOT NULL in migration 018, before phone-first
    # checkout was on the table. SQLite can't drop a NOT NULL in place, so
    # Sequel rebuilds the table here.
    alter_table(:orders) do
      set_column_allow_null :email
    end
  end
end
