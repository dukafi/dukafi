require_relative "../spec_helper"
require_relative "../../app"

# Payments must not know PayHero exists.
#
# The first plugin to ship set the shape of everything around it, and the
# temptation was to bake its name in: a button hardcoded to `payhero`, a label
# saying "Pay with M-Pesa", a form asking for a phone number. All three break
# for the first merchant who installs anything else, and none of them fail
# loudly — they just offer the wrong thing.
#
# So: a provider describes itself, a page LOOPS what is configured, and a
# single-provider store needs no wiring at all.
class PaymentProvidersSpec < Minitest::Test
  def setup
    PluginSetting.dataset.delete
  end

  def configure_payhero!
    settings = Dukafi::Plugins::Settings.for("payhero")
    settings[:api_token] = "token"
    settings[:channel_id] = "1"
    settings[:callback_base_url] = "https://example.test"
  end

  def providers = Dukafi::Plugins.configured_payment_providers

  # A button that cannot work is worse than no button.
  def test_an_unconfigured_provider_is_not_offered
    assert_empty providers.select { |p| p.fetch("slug") == "payhero" }
  end

  def test_a_configured_provider_describes_itself
    configure_payhero!
    provider = providers.find { |p| p.fetch("slug") == "payhero" }

    refute_nil provider
    # The LABEL comes from the plugin, so a page never has to name the method.
    assert_equal "M-Pesa", provider.fetch("name")
    # And so do the inputs it needs collected.
    field = provider.fetch("fields").first
    assert_equal "phone", field.fetch("name")
    assert_equal "tel", field.fetch("type")
  end

  # What a page actually loops.
  def test_the_prefetch_exposes_providers_for_a_loop
    configure_payhero!
    entry = CommercePrefetcher.call.fetch("paymentProviders").first

    assert_equal "payhero", entry.fetch("providerSlug")
    assert_equal "Pay with M-Pesa", entry.fetch("payLabel")
    # `providerSlug`, not `slug`: a provider in scope must not be mistaken for
    # a product by anything that reads `currentEntry.slug`.
    refute entry.key?("slug")
  end

  # One button template, one button per installed method — the provider comes
  # from the entry, not from the markup.
  def test_a_button_in_a_providers_loop_carries_the_entrys_provider
    configure_payhero!
    nodes = {
      "body" => node("body", "base.body", %w[loop]),
      "loop" => node("loop", "store.relationship-loop", %w[row],
                     { "source" => "paymentProviders", "perPage" => 5 }),
      "row" => node("row", "base.button", [], { "label" => "Pay" },
                    { "actions" => { "click" => { "type" => "payment.initiate" } } }),
    }

    html = Dukafi::Publisher::RenderPage.call(
      document: { "rootNodeId" => "body", "nodes" => nodes },
      registry: Dukafi::Publisher::REGISTRY, prefetched: CommercePrefetcher.call
    ).html

    assert_includes html, "hx-post=&quot;/fragments/payment/initiate&quot;".gsub("&quot;", '"')
    assert_includes html, "&quot;provider&quot;:&quot;payhero&quot;"
  end

  # An explicit provider still wins, for a page that offers a deliberate choice.
  def test_a_named_provider_beats_the_entry
    configure_payhero!
    nodes = {
      "body" => node("body", "base.body", %w[button]),
      "button" => node("button", "base.button", [], { "label" => "Pay" },
                       { "actions" => { "click" => { "type" => "payment.initiate",
                                                     "provider" => "somethingelse" } } }),
    }

    html = Dukafi::Publisher::RenderPage.call(
      document: { "rootNodeId" => "body", "nodes" => nodes },
      registry: Dukafi::Publisher::REGISTRY, prefetched: {}
    ).html

    assert_includes html, "&quot;provider&quot;:&quot;somethingelse&quot;"
  end

  def node(id, module_id, children = [], props = {}, extra = {})
    { "id" => id, "moduleId" => module_id, "children" => children, "props" => props,
      "breakpointOverrides" => {}, "classIds" => [] }.merge(extra)
  end
end
