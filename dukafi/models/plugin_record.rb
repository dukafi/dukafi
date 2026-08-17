require "json"

# One document in a plugin's own storage.
#
# Core tables (products, orders) stay core. This is the mapping table, the
# inbox, the booking row — shapes the host has never heard of.
class PluginRecord < Sequel::Model
  def payload=(value)
    super(value.is_a?(String) ? value : JSON.generate(value || {}))
  end

  def payload_data
    JSON.parse(payload.to_s)
  rescue JSON::ParserError
    {}
  end
end
