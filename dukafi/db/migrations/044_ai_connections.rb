require "sequel"

Sequel.migration do
  up do
    create_table(:ai_connections) do
      primary_key :id
      String :name, null: false
      String :provider, null: false
      String :base_url
      String :api_key
      String :key_fingerprint
      String :chat_model
      String :image_model
      Integer :priority, null: false, default: 100
      TrueClass :disabled, null: false, default: false
      DateTime :created_at, null: false, default: Sequel::CURRENT_TIMESTAMP
      DateTime :updated_at, null: false, default: Sequel::CURRENT_TIMESTAMP
      index [:priority, :id]
    end

    create_table(:ai_defaults) do
      String :task, primary_key: true
      foreign_key :connection_id, :ai_connections, null: false, on_delete: :restrict
      String :model, null: false
      DateTime :created_at, null: false, default: Sequel::CURRENT_TIMESTAMP
      DateTime :updated_at, null: false, default: Sequel::CURRENT_TIMESTAMP
      constraint(:ai_defaults_task_check, task: %w[chat image])
    end

    # Preserve the legacy single-provider settings without attempting to encrypt
    # here: migrations intentionally do not depend on application services. The
    # model upgrades this value to SecretBox on its first read.
    if table_exists?(:plugin_settings)
      settings = from(:plugin_settings).where(plugin_id: "ai").all.to_h { |r| [r[:key].to_s, r[:value].to_s] }
      base = settings["base_url"].to_s
      model = settings["model"].to_s
      unless base.empty? || model.empty?
        provider = settings["provider"].to_s
        provider = if provider.empty?
          base.include?("anthropic.com") ? "anthropic" : "openai_compatible"
        else
          provider
        end
        id = from(:ai_connections).insert(
          name: "Migrated AI connection", provider: provider, base_url: base,
          api_key: settings["api_key"].to_s, chat_model: model,
          created_at: Time.now, updated_at: Time.now
        )
        from(:ai_defaults).insert(task: "chat", connection_id: id, model: model,
                                  created_at: Time.now, updated_at: Time.now)
      end
    end
  end

  down do
    drop_table?(:ai_defaults)
    drop_table?(:ai_connections)
  end
end
