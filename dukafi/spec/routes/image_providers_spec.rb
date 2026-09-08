require_relative "../spec_helper"

class ImageProvidersSpec < Minitest::Test
  Fake = Module.new do
    module_function
    def generate(prompt:, size:, count:, config:)
      { images: [{ bytes: HttpStub.png, mime: "image/png" }] }
    end
  end

  def setup
    PluginSetting.dataset.delete
  end

  def teardown
    Dukafi::Plugins.registry.delete("spec_image")
  end

  def test_an_unconfigured_image_provider_is_not_offered
    Dukafi::Plugins.register("spec_image") do |p|
      p.name "Spec image"
      p.secret :token, label: "Token"
      p.image_provider "spec_image", Fake, label: "Spec images"
    end
    assert_empty Dukafi::Plugins.configured_image_providers.select { |row| row["slug"] == "spec_image" }
  end

  def test_a_configured_image_provider_is_discovered
    Dukafi::Plugins.register("spec_image") do |p|
      p.name "Spec image"
      p.secret :token, label: "Token"
      p.image_provider "spec_image", Fake, label: "Spec images"
    end
    Dukafi::Plugins::Settings.for("spec_image")[:token] = "tok"
    provider = Dukafi::Plugins.configured_image_providers.find { |row| row["slug"] == "spec_image" }
    refute_nil provider
    assert_equal "Spec images", provider.fetch("name")
  end
end
