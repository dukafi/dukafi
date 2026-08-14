Sequel.migration do
  change do
    # Plugin configuration — API tokens, channel ids, endpoints.
    #
    # Deliberately NOT in the site document: documents are published to disk
    # and served publicly, so a credential stored there would leak on the next
    # publish. Deliberately not in ENV either, because a merchant configures
    # these from the admin, not a deploy.
    create_table(:plugin_settings) do
      primary_key :id
      String :plugin_id, null: false
      String :key, null: false
      String :value, text: true
      DateTime :updated_at, null: false
      index %i[plugin_id key], unique: true
    end
  end
end
