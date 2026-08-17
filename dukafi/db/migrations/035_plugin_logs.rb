Sequel.migration do
  change do
    # What a plugin writes instead of talking to a third party — mail it
    # would have sent, a charge it would have started, a webhook it received.
    # The lab page and the admin read this; it is not a customer-facing table.
    create_table(:plugin_logs) do
      primary_key :id
      String :plugin_id, null: false
      String :kind, null: false
      String :message, text: true, null: false, default: ""
      String :payload, text: true, null: false, default: "{}"
      DateTime :created_at, null: false
      index :plugin_id
      index :created_at
    end
  end
end
