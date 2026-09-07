require "sequel"

Sequel.migration do
  change do
    create_table(:scheduler_locks) do
      Integer :id, primary_key: true
      String :holder
      DateTime :heartbeat_at
    end
    from(:scheduler_locks).insert(id: 1)
    from(:scheduler_locks).insert(id: 2)

    create_table(:mail_logs) do
      primary_key :id
      String :recipient, null: false
      String :template, null: false
      TrueClass :ok, null: false
      String :error, text: true
      DateTime :created_at, null: false, default: Sequel::CURRENT_TIMESTAMP
      index :created_at
    end

    alter_table(:orders) do
      add_column :shipping_meta, String, text: true
    end
  end
end
