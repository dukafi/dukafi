class Shipping
  Rate = Data.define(:id, :label, :amount_cents, :meta)
  Selection = Data.define(:provider, :rate)

  def self.rates(cart:, address: {})
    Dukafi::Plugins.configured_shipping_providers.flat_map do |entry|
      plugin = Dukafi::Plugins.find(entry.fetch("pluginId"))
      Array(entry.fetch("provider").rates(cart: cart, address: address, config: plugin.settings.to_h)).map do |rate|
        { provider: entry.fetch("slug"), id: rate.id, label: rate.label,
          amountCents: rate.amount_cents, meta: rate.meta }
      end
    rescue StandardError => error
      warn "[shipping:#{entry['slug']}] rates failed: #{error.message}"
      []
    end
  end

  def self.resolve(cart:, provider_slug:, rate_id:, address: {})
    row = rates(cart: cart, address: address).find { |r| r[:provider] == provider_slug.to_s && r[:id] == rate_id.to_s }
    row && Selection.new(provider: row[:provider], rate: Rate.new(id: row[:id], label: row[:label], amount_cents: row[:amountCents], meta: row[:meta]))
  end
end
