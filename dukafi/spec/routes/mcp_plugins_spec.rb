require_relative "../spec_helper"
require_relative "../../app"

# Plugin configuration, from MCP.
#
# A payment plugin's credentials decide whose account customer money lands in,
# so this is the most dangerous surface an agent is given. Two properties are
# non-negotiable and everything else here is ordinary CRUD:
#
#   · a secret can never be READ back, so an agent that can look at the store
#     cannot lift its API keys out of it;
#   · configuring is a WRITE, so a read-scoped connection cannot reach it.
class McpPluginsSpec < Minitest::Test
  SECRET = "payhero-lab-secret-not-a-key".freeze

  def setup
    PluginSetting.dataset.delete
  end

  def tool(name)
    definition = McpTools.all.find { |entry| entry.fetch(:name) == name }
    raise "no tool #{name}" if definition.nil?

    definition.fetch(:run)
  end

  def call(name, args = {}) = tool(name).call(args)

  def refusal(name, args = {})
    call(name, args)
    flunk "expected a refusal from #{name}"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def payhero = call("list_plugins", { "id" => "payhero" }).fetch("plugins").first

  # ── Scope ────────────────────────────────────────────────────────────────

  def test_listing_reads_and_configuring_writes
    refute McpTools.write_tool?("list_plugins")
    assert McpTools.write_tool?("configure_plugin"),
           "configure_plugin must count as a write — a read-only agent must not be able to redirect payments"
    assert McpTools.write_tool?("delete_plugin")
  end

  def test_the_ai_assistant_is_not_listed
    ids = call("list_plugins").fetch("plugins").map { |plugin| plugin.fetch("id") }

    refute_includes ids, "ai"
    assert_includes refusal("list_plugins", { "id" => "ai" }), "list_plugins"
  end

  # ── Reading ──────────────────────────────────────────────────────────────

  def test_a_plugin_reports_what_it_needs
    keys = payhero.fetch("settings").map { |setting| setting.fetch("key") }

    assert_includes keys, "api_token"
    assert_includes keys, "channel_id"
    assert_includes keys, "callback_base_url"
    assert_includes payhero.fetch("paymentProviders"), "payhero"
  end

  # The property that matters most on the read side.
  def test_a_secret_is_reported_as_set_but_never_returned
    call("configure_plugin", { "id" => "payhero", "settings" => { "api_token" => SECRET } })

    token = payhero.fetch("settings").find { |setting| setting.fetch("key") == "api_token" }

    assert_equal true, token.fetch("secret")
    assert_equal true, token.fetch("isSet")
    assert_nil token.fetch("value")
    # And nowhere else in the response either — not in a note, not echoed back
    # from the write that set it.
    refute_includes JSON.generate(payhero), SECRET
  end

  def test_the_write_never_echoes_the_secret_it_just_stored
    result = call("configure_plugin", { "id" => "payhero", "settings" => { "api_token" => SECRET } })

    refute_includes JSON.generate(result), SECRET
    assert_includes result.fetch("changed"), "api_token"
  end

  # A non-secret is readable — the whole point of the distinction. A merchant
  # asking "what callback URL is set?" should get an answer.
  def test_a_non_secret_setting_is_returned
    call("configure_plugin", { "id" => "payhero",
                               "settings" => { "callback_base_url" => "https://example.test" } })

    url = payhero.fetch("settings").find { |setting| setting.fetch("key") == "callback_base_url" }

    assert_equal false, url.fetch("secret")
    assert_equal "https://example.test", url.fetch("value")
  end

  # ── Writing ──────────────────────────────────────────────────────────────

  def test_configuring_reports_when_the_plugin_becomes_live
    result = call("configure_plugin", {
                    "id" => "payhero",
                    "settings" => { "api_token" => SECRET, "channel_id" => 10_398,
                                    "callback_base_url" => "https://example.test" },
                  })

    assert_equal true, result.fetch("configured")
    assert_includes result.fetch("note"), "configured and live"
    assert_equal %w[api_token channel_id callback_base_url].sort, result.fetch("changed").sort
  end

  def test_a_partially_configured_plugin_says_so
    result = call("configure_plugin", { "id" => "payhero", "settings" => { "channel_id" => 1 } })

    assert_equal false, result.fetch("configured")
    assert_includes result.fetch("note"), "still missing values"
  end

  # Only the keys passed change — an agent re-sending one field must not wipe
  # the rest of a working configuration.
  def test_other_settings_are_left_alone
    call("configure_plugin", { "id" => "payhero",
                               "settings" => { "api_token" => SECRET, "channel_id" => 10_398 } })
    call("configure_plugin", { "id" => "payhero",
                               "settings" => { "callback_base_url" => "https://new.test" } })

    settings = payhero.fetch("settings").to_h { |setting| [setting.fetch("key"), setting] }
    assert_equal true, settings.fetch("api_token").fetch("isSet")
    assert_equal "10398", settings.fetch("channel_id").fetch("value")
  end

  # A model echoing back a form with empty fields must not clear a working
  # token — the blank means "I don't know it", not "remove it".
  def test_a_blank_value_does_not_clear_an_existing_one
    call("configure_plugin", { "id" => "payhero", "settings" => { "api_token" => SECRET } })

    result = call("configure_plugin", { "id" => "payhero", "settings" => { "api_token" => "" } })

    assert_empty result.fetch("changed")
    assert_includes result.fetch("note"), "Nothing changed"
    assert_equal true, payhero.fetch("settings")
                              .find { |setting| setting.fetch("key") == "api_token" }.fetch("isSet")
  end

  # A typo'd key would otherwise report success while changing nothing, and
  # the merchant would go looking for the fault in the payment provider.
  def test_an_unknown_setting_key_is_refused_by_name
    message = refusal("configure_plugin", { "id" => "payhero", "settings" => { "api_key" => "x" } })

    assert_includes message, "api_key"
    assert_includes message, "api_token"
  end

  def test_an_unknown_plugin_says_how_to_find_one
    assert_includes refusal("configure_plugin", { "id" => "stripe", "settings" => { "x" => "y" } }),
                    "list_plugins"
  end
end
