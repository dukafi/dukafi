require "json"

# A row a plugin wrote instead of calling a third party.
#
# Mail, charges, webhooks, jobs — the probe plugin (and anything else that
# does not want to hit SMTP or a payment rail in development) lands here so
# a merchant can see what WOULD have left the store.
class PluginLog < Sequel::Model
  def payload=(value)
    super(value.is_a?(String) ? value : JSON.generate(value || {}))
  end

  def payload_data
    JSON.parse(payload.to_s)
  rescue JSON::ParserError
    {}
  end

  def to_h
    {
      "id" => id,
      "pluginId" => plugin_id,
      "kind" => kind,
      "message" => message,
      "payload" => payload_data,
      "createdAt" => created_at&.utc&.iso8601,
    }
  end

  def self.record(plugin_id:, kind:, message:, payload: {})
    create(
      plugin_id: plugin_id.to_s,
      kind: kind.to_s,
      message: message.to_s,
      payload: payload,
      created_at: Time.now,
    )
  rescue StandardError => e
    warn "[plugin_log] failed to record #{kind}: #{e.class}: #{e.message}"
    nil
  end
end
