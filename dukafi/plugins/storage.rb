require "json"

# Per-plugin document store. The substitute for `DB[]`.
#
# A Woo importer keeps `woo_products` / `woo_variants` here so a second sync
# updates the same Dukafi product instead of duplicating it. The catalogue
# itself is still written through CommerceWrites — this table is only the
# plugin's map from a foreign id to ours.
class PluginStorage
  def initialize(plugin_id)
    @plugin_id = plugin_id.to_s
  end

  def collection(name)
    Collection.new(@plugin_id, name)
  end

  class Collection
    def initialize(plugin_id, name)
      @plugin_id = plugin_id
      @name = normalize_name(name)
    end

    def get(key)
      PluginRecord.first(plugin_id: @plugin_id, collection: @name, key: key.to_s)&.payload_data
    end

    def put(key, payload)
      row = PluginRecord.first(plugin_id: @plugin_id, collection: @name, key: key.to_s)
      if row
        row.update(payload: payload, updated_at: Time.now)
      else
        PluginRecord.create(
          plugin_id: @plugin_id, collection: @name, key: key.to_s,
          payload: payload, updated_at: Time.now
        )
      end
      get(key)
    end

    def delete(key)
      PluginRecord.where(plugin_id: @plugin_id, collection: @name, key: key.to_s).delete
    end

    def all
      PluginRecord.where(plugin_id: @plugin_id, collection: @name).order(:key).map do |row|
        { "key" => row.key, "payload" => row.payload_data }
      end
    end

    private

    def normalize_name(name)
      value = name.to_s.strip
      raise ArgumentError, "storage collection needs a name" if value.empty?
      raise ArgumentError, "storage collection #{name.inspect} is not a name" unless value.match?(/\A[a-z0-9_]+\z/)

      value
    end
  end
end
