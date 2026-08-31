require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# Dukafi AI as an independent provider: connect mints a token the browser
# never sees, and /ai/run proxies a harness stream.
class DukafiAiApiSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Rack::Lint.new(Dukafi.app)
  end

  def setup
    PluginSetting.dataset.delete
    PersonalAccessToken.dataset.delete
    Admin.dataset.delete
    SiteState.dataset.delete
    clear_cookies
    @previous_url = ENV["DUKAFI_AI_URL"]
    ENV.delete("DUKAFI_AI_URL")
  end

  def teardown
    if @previous_url
      ENV["DUKAFI_AI_URL"] = @previous_url
    else
      ENV.delete("DUKAFI_AI_URL")
    end
  end

  def sign_in!
    post_json "/admin/api/cms/setup",
              siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def post_json(path, payload = {})
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def body = JSON.parse(last_response.body)

  def test_connect_requires_an_admin
    post "/admin/api/cms/ai/dukafi/connect"
    assert_equal 401, last_response.status
  end

  def test_connect_mints_a_token_the_response_never_shows
    sign_in!

    post "/admin/api/cms/ai/dukafi/connect"

    assert_equal 200, last_response.status
    assert_equal true, body.fetch("connected")
    refute_includes last_response.body, "dkf_"
    token = Dukafi::Plugins::Settings.for("ai")[:harness_mcp_token].to_s
    assert token.start_with?("dkf_")
    refute_includes last_response.body, token
    get "/admin/api/cms/ai/config"
    refute_includes last_response.body, token
    assert_equal true, JSON.parse(last_response.body).fetch("connected")
    assert_equal "dukafi", JSON.parse(last_response.body).fetch("provider")
  end

  def test_disconnect_revokes_the_token
    sign_in!
    post "/admin/api/cms/ai/dukafi/connect"
    id = Dukafi::Plugins::Settings.for("ai")[:harness_token_id].to_i

    post "/admin/api/cms/ai/dukafi/disconnect"

    assert_equal false, body.fetch("connected")
    refute_nil PersonalAccessToken[id].revoked_at
    assert_equal "", Dukafi::Plugins::Settings.for("ai")[:harness_mcp_token].to_s
  end

  def test_saving_dukafi_leaves_the_groq_key_alone
    sign_in!
    settings = Dukafi::Plugins::Settings.for("ai")
    settings[:base_url] = "https://api.groq.com/openai/v1"
    settings[:model] = "llama-3.1-70b"
    settings[:api_key] = "gsk-keep-me"

    put "/admin/api/cms/ai/config",
        JSON.generate(provider: "dukafi", harnessUrl: "http://localhost:8787"),
        "CONTENT_TYPE" => "application/json"

    assert_equal 204, last_response.status
    assert_equal "dukafi", settings[:provider]
    assert_equal "gsk-keep-me", settings[:api_key]
    assert_equal "https://api.groq.com/openai/v1", settings[:base_url]
  end

  def test_run_requires_an_admin
    post_json "/admin/api/cms/ai/run", prompt: "hello", slug: "index"
    assert_equal 401, last_response.status
  end

  def test_run_without_connect_is_a_fixable_state
    sign_in!
    Dukafi::Plugins::Settings.for("ai")[:provider] = "dukafi"
    ENV["DUKAFI_AI_URL"] = "http://localhost:8787"

    post_json "/admin/api/cms/ai/run", prompt: "hello", slug: "index"

    assert_equal 409, last_response.status
    assert_equal "ai_not_connected", body.dig("error", "code")
  end

  def test_run_without_a_harness_url_is_a_fixable_state
    sign_in!
    post "/admin/api/cms/ai/dukafi/connect"

    post_json "/admin/api/cms/ai/run", prompt: "hello", slug: "index"

    assert_equal 409, last_response.status
    assert_equal "ai_harness_not_configured", body.dig("error", "code")
  end

  def test_run_streams_the_harness_and_never_echoes_the_token
    sign_in!
    post "/admin/api/cms/ai/dukafi/connect"
    ENV["DUKAFI_AI_URL"] = "http://localhost:8787"
    token = Dukafi::Plugins::Settings.for("ai")[:harness_mcp_token]

    DukafiAiClient.stub_stream = proc do |*, &write|
      write.call("event: activity\ndata: {\"phase\":\"structure\",\"message\":\"structure: hero\"}\n\n")
      write.call("event: done\ndata: {\"ok\":true}\n\n")
    end

    post_json "/admin/api/cms/ai/run", prompt: "build a landing page", slug: "index"

    assert_equal 200, last_response.status
    assert_equal "text/event-stream", last_response.content_type.split(";").first
    assert_includes last_response.body, "structure: hero"
    assert_includes last_response.body, "event: done"
    refute_includes last_response.body, token
  ensure
    DukafiAiClient.stub_stream = nil
  end
end
