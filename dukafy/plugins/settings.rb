class Dukafy
  module Plugins
    # Read/write a plugin's configuration. Values are stored as strings and
    # coerced on read against the plugin's declared schema.
    class Settings
      def self.for(plugin_id) = new(plugin_id)

      def initialize(plugin_id)
        @plugin_id = plugin_id.to_s
      end

      def [](key)
        row = PluginSetting.first(plugin_id: @plugin_id, key: key.to_s)
        coerce(key, row&.value)
      end

      def []=(key, value)
        row = PluginSetting.first(plugin_id: @plugin_id, key: key.to_s)
        if row
          row.update(value: value.to_s, updated_at: Time.now)
        else
          PluginSetting.create(
            plugin_id: @plugin_id, key: key.to_s, value: value.to_s, updated_at: Time.now
          )
        end
      end

      def to_h
        schema.to_h { |setting| [setting.key.to_sym, self[setting.key]] }
      end

      # Every declared setting has a non-empty value — what a provider checks
      # before trying to talk to a third party with half its credentials.
      def configured?
        schema.all? { |setting| !self[setting.key].to_s.empty? }
      end

      private

      def schema
        Plugins.find(@plugin_id)&.settings_schema || []
      end

      def coerce(key, value)
        return nil if value.nil?

        setting = schema.find { |item| item.key == key.to_s }
        setting&.type == :integer ? Integer(value, exception: false) : value
      end
    end
  end
end
