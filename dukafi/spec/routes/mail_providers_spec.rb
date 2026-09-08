require_relative "../spec_helper"

class MailProvidersSpec < Minitest::Test
  def setup
    PluginSetting.dataset.delete
  end

  def test_an_unconfigured_mail_provider_is_not_offered
    assert_empty Dukafi::Plugins.configured_mail_providers.select { |row| row["slug"] == "smtp" }
  end

  def test_a_configured_smtp_provider_is_discovered
    settings = Dukafi::Plugins::Settings.for("smtp")
    settings[:host] = "127.0.0.1"
    settings[:port] = "2525"
    settings[:username] = "user"
    settings[:password] = "pass"
    settings[:from] = "shop@example.com"
    provider = Dukafi::Plugins.configured_mail_providers.find { |row| row["slug"] == "smtp" }
    refute_nil provider
    assert_equal "SMTP", provider.fetch("name")
  end
end
