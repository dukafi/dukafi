module FlatRateShipping
  module Provider
    module_function
    def rates(cart:, address:, config:)
      amount = Integer(config.fetch(:amount, 0))
      threshold = Integer(config.fetch(:free_over, 0))
      subtotal = CartPayload.call(cart).dig("cart", "subtotalCents").to_i
      amount = 0 if threshold.positive? && subtotal >= threshold
      [Shipping::Rate.new(id: "flat", label: "Standard delivery", amount_cents: amount, meta: {})]
    end
  end
end

Dukafi::Plugins.register("flat_rate") do |p|
  p.name "Flat-rate shipping"
  p.version "1.0.0"
  p.integer :amount, label: "Amount (cents)"
  p.integer :free_over, label: "Free over (cents)"
  p.shipping_provider "flat_rate", FlatRateShipping::Provider, label: "Standard delivery"
end
