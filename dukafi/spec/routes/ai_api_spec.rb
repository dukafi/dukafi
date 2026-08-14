require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# The AI chat endpoint.
#
# No case here reaches a model: each stops at auth, at configuration, or at
# base-URL validation, all of which run before the socket opens. What is worth
# testing on this route is not the model's answer — it is that the endpoint
# cannot be reached without a session and that the API key cannot be read back.
class AiApiSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Rack::Lint.new(Dukafi.app)
  end

  def setup
    PluginSetting.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
  end

  def sign_in!
    post_json "/admin/api/cms/setup",
              siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def body = JSON.parse(last_response.body)

  def chat(text = "add a hero")
    post_json "/admin/api/cms/ai/chat", messages: [{ role: "user", content: text }]
  end

  # ── Authentication ───────────────────────────────────────────────────────

  # This endpoint spends the merchant's money and talks to a third party with
  # their credential. It must never be reachable without a session.
  def test_chat_requires_an_admin
    chat

    assert_equal 401, last_response.status
  end

  # ── Configuration ────────────────────────────────────────────────────────

  # 409, not 500: nothing is broken, the merchant just hasn't picked a model.
  # The editor uses this to point at the settings form.
  def test_reports_an_unconfigured_model_as_a_fixable_state
    sign_in!
    chat

    assert_equal 409, last_response.status
    assert_equal "ai_not_configured", body.dig("error", "code")
  end

  def test_rejects_a_base_url_that_would_send_the_key_in_clear_text
    sign_in!
    settings = Dukafi::Plugins::Settings.for("ai")
    settings[:base_url] = "http://api.example.com/v1"
    settings[:model] = "gpt-4o-mini"

    chat

    assert_equal 422, last_response.status
    assert_equal "ai_invalid_base_url", body.dig("error", "code")
  end

  def test_rejects_an_empty_conversation
    sign_in!
    settings = Dukafi::Plugins::Settings.for("ai")
    settings[:base_url] = "https://api.example.com/v1"
    settings[:model] = "gpt-4o-mini"

    post_json "/admin/api/cms/ai/chat", messages: []

    assert_equal 422, last_response.status
    assert_equal "ai_empty_conversation", body.dig("error", "code")
  end

  # A provider that refuses explains why, and that explanation has to reach the
  # merchant. Reproduced without a socket by pointing at a base URL that fails
  # to resolve — the transport note is the detail in that case.
  def test_a_failure_carries_the_reason_it_failed
    sign_in!
    settings = Dukafi::Plugins::Settings.for("ai")
    settings[:base_url] = "https://no-such-host.invalid/v1"
    settings[:model] = "gpt-4o-mini"

    chat

    assert_equal 502, last_response.status
    message = body.dig("error", "message")
    # Not just the generic sentence — something naming what actually broke.
    assert_operator message.length, :>, "Could not reach the model.".length
  end

  # ── The in-panel settings popover ────────────────────────────────────────

  def test_config_reports_the_settings_without_the_key
    sign_in!
    settings = Dukafi::Plugins::Settings.for("ai")
    settings[:base_url] = "https://api.example.com/v1"
    settings[:model] = "gpt-4o-mini"
    settings[:api_key] = "sk-super-secret"

    get "/admin/api/cms/ai/config"

    assert_equal 200, last_response.status
    refute_includes last_response.body, "sk-super-secret"
    assert_equal "https://api.example.com/v1", body.fetch("baseUrl")
    assert_equal "gpt-4o-mini", body.fetch("model")
    # Enough for the popover to say "Saved" without ever holding the value.
    assert_equal true, body.fetch("hasKey")
  end

  def test_config_saves_the_provider_and_model
    sign_in!

    put "/admin/api/cms/ai/config",
        JSON.generate(baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder:7b", apiKey: ""),
        "CONTENT_TYPE" => "application/json"

    assert_equal 204, last_response.status
    settings = Dukafi::Plugins::Settings.for("ai")
    assert_equal "http://localhost:11434/v1", settings[:base_url]
    assert_equal "qwen2.5-coder:7b", settings[:model]
  end

  # The popover cannot show the stored key, so it cannot resubmit it — a blank
  # field must mean "keep", exactly as in the plugin form.
  def test_saving_with_a_blank_key_keeps_the_stored_one
    sign_in!
    Dukafi::Plugins::Settings.for("ai")[:api_key] = "sk-keep-me"

    put "/admin/api/cms/ai/config",
        JSON.generate(baseUrl: "https://api.example.com/v1", model: "gpt-4o-mini", apiKey: ""),
        "CONTENT_TYPE" => "application/json"

    assert_equal "sk-keep-me", Dukafi::Plugins::Settings.for("ai")[:api_key]
  end

  # ...so removing a key has to be explicit, or switching to a local model
  # would keep sending a stale credential.
  def test_a_key_can_be_cleared_explicitly
    sign_in!
    Dukafi::Plugins::Settings.for("ai")[:api_key] = "sk-remove-me"

    put "/admin/api/cms/ai/config",
        JSON.generate(baseUrl: "http://localhost:11434/v1", model: "llama3", clearKey: true),
        "CONTENT_TYPE" => "application/json"

    assert_equal "", Dukafi::Plugins::Settings.for("ai")[:api_key].to_s
  end

  def test_config_requires_an_admin
    get "/admin/api/cms/ai/config"
    assert_equal 401, last_response.status

    post_json "/admin/api/cms/ai/models", baseUrl: "https://api.example.com/v1"
    assert_equal 401, last_response.status
  end

  # An unreachable or nonsense provider leaves the picker empty rather than
  # erroring — the merchant can still type a model id by hand.
  def test_listing_models_from_an_unusable_provider_is_empty_not_an_error
    sign_in!

    post_json "/admin/api/cms/ai/models", baseUrl: "http://api.example.com/v1"

    assert_equal 200, last_response.status
    assert_empty body.fetch("models")
  end

  # ── The key never comes back ─────────────────────────────────────────────

  # The whole reason the server holds the key instead of the browser. Mirrors
  # the plugin secret-leak test in admin_api_spec.rb.
  def test_the_api_key_is_write_only
    sign_in!
    put "/admin/api/cms/plugins/ai/settings",
        JSON.generate(settings: { base_url: "https://api.example.com/v1",
                                  model: "gpt-4o-mini", api_key: "sk-super-secret" }),
        "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status

    get "/admin/api/cms/plugins"

    refute_includes last_response.body, "sk-super-secret"
    plugin = body.fetch("plugins").find { |item| item.fetch("id") == "ai" }
    key = plugin.fetch("settings").find { |item| item.fetch("key") == "api_key" }
    assert_equal true, key.fetch("isSet")
    assert_nil key.fetch("value")
    # Non-secret settings still read back, so the form can show them.
    model = plugin.fetch("settings").find { |item| item.fetch("key") == "model" }
    assert_equal "gpt-4o-mini", model.fetch("value")
  end

  # Submitting the form again with a blank key must not wipe the stored one —
  # the form could not have shown it to resubmit.
  def test_resubmitting_a_blank_key_leaves_the_stored_one_alone
    sign_in!
    Dukafi::Plugins::Settings.for("ai")[:api_key] = "sk-keep-me"

    put "/admin/api/cms/plugins/ai/settings",
        JSON.generate(settings: { base_url: "https://api.example.com/v1",
                                  model: "gpt-4o-mini", api_key: "" }),
        "CONTENT_TYPE" => "application/json"

    assert_equal "sk-keep-me", Dukafi::Plugins::Settings.for("ai")[:api_key]
  end
end
