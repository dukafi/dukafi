require_relative "../spec_helper"

# The model proxy, tested up to but never across the socket.
#
# Every case here stops at configuration or URL validation, both of which run
# before `Net::HTTP.start`. The one thing this service does that a test should
# not do is talk to a model.
class AiChatSpec < Minitest::Test
  def setup
    PluginSetting.dataset.delete
  end

  def configure!(base_url: "https://api.example.com/v1", model: "gpt-4o-mini", api_key: "sk-test")
    settings = Dukafy::Plugins::Settings.for("ai")
    settings[:base_url] = base_url
    settings[:model] = model
    settings[:api_key] = api_key
  end

  # Named `turn`, not `message` — Minitest::Assertions already defines `message`.
  def turn(text = "hello") = [{ "role" => "user", "content" => text }]

  # ── Configuration ────────────────────────────────────────────────────────

  def test_reports_unconfigured_before_any_network_attempt
    result = AiChat.call(messages: turn)

    refute result.ok?
    assert_equal "not_configured", result.reason
  end

  # A local model needs no key, so the key must not be part of "configured".
  # `Settings#configured?` would have said false here, which is why this
  # service asks its own narrower question.
  def test_a_local_model_with_no_api_key_counts_as_configured
    configure!(base_url: "http://localhost:11434/v1", api_key: "")

    assert AiChat.configured?
  end

  def test_a_model_with_no_base_url_is_not_configured
    configure!(base_url: "")

    refute AiChat.configured?
  end

  # ── Endpoint construction ────────────────────────────────────────────────

  def test_appends_the_chat_completions_path
    configure!(base_url: "https://api.example.com/v1")

    assert_equal "https://api.example.com/v1/chat/completions", AiChat.endpoint.to_s
  end

  def test_tolerates_a_trailing_slash
    configure!(base_url: "https://api.example.com/v1/")

    assert_equal "https://api.example.com/v1/chat/completions", AiChat.endpoint.to_s
  end

  # Someone pasting the full endpoint is the obvious mistake; doubling the path
  # would 404 with nothing to explain it.
  def test_tolerates_a_base_url_that_already_names_the_path
    configure!(base_url: "https://api.example.com/v1/chat/completions")

    assert_equal "https://api.example.com/v1/chat/completions", AiChat.endpoint.to_s
  end

  # ── The http:// rule ─────────────────────────────────────────────────────

  # Plain HTTP to a remote host would put the API key on the wire in clear
  # text. Refused rather than silently downgraded.
  def test_refuses_plain_http_to_a_remote_host
    configure!(base_url: "http://api.example.com/v1")

    assert_nil AiChat.endpoint
    assert_equal "invalid_base_url", AiChat.call(messages: turn).reason
  end

  # ...but a loopback address is how Ollama and LM Studio work, and no traffic
  # leaves the machine.
  def test_allows_plain_http_to_a_loopback_host
    ["http://localhost:11434/v1", "http://127.0.0.1:1234/v1"].each do |base|
      configure!(base_url: base)

      refute_nil AiChat.endpoint, "expected #{base} to be usable"
    end
  end

  def test_refuses_a_non_http_scheme
    configure!(base_url: "file:///etc/passwd")

    assert_nil AiChat.endpoint
  end

  def test_refuses_a_base_url_with_no_host
    configure!(base_url: "https://")

    assert_nil AiChat.endpoint
  end

  # ── Anthropic ────────────────────────────────────────────────────────────
  #
  # The one provider with a second code path, because it is where Claude lives
  # and reaching it through OpenRouter costs a second account and a margin on
  # every token. Keyed off the HOST so the merchant still configures three
  # things, not four.

  def test_anthropic_posts_to_messages_not_chat_completions
    configure!(base_url: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5")

    assert_equal "https://api.anthropic.com/v1/messages", AiChat.endpoint.to_s
  end

  def test_a_base_url_that_already_names_messages_is_not_doubled
    configure!(base_url: "https://api.anthropic.com/v1/messages")

    assert_equal "https://api.anthropic.com/v1/messages", AiChat.endpoint.to_s
  end

  # Everything else keeps the OpenAI path — the branch must not leak.
  def test_other_providers_still_use_chat_completions
    configure!(base_url: "https://openrouter.ai/api/v1")

    assert_equal "https://openrouter.ai/api/v1/chat/completions", AiChat.endpoint.to_s
  end

  # Anthropic rejects a `system` ROLE in the message list; the prompt has to be
  # lifted to a top-level field, and max_tokens is required rather than
  # defaulted.
  def test_anthropic_lifts_the_system_prompt_and_sets_max_tokens
    configure!(base_url: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5")
    body = AiChat.send(:body_for, AiChat.endpoint, [
      { "role" => "system", "content" => "you edit pages" },
      { "role" => "user", "content" => "add a hero" },
    ])

    assert_equal "you edit pages", body["system"]
    assert_equal [{ "role" => "user", "content" => "add a hero" }], body["messages"]
    assert_equal AiChat::ANTHROPIC_MAX_TOKENS, body["max_tokens"]
  end

  def test_the_openai_shape_keeps_the_system_message_inline
    configure!(base_url: "https://api.openai.com/v1")
    body = AiChat.send(:body_for, AiChat.endpoint, [
      { "role" => "system", "content" => "you edit pages" },
      { "role" => "user", "content" => "add a hero" },
    ])

    assert_nil body["system"]
    assert_equal 2, body["messages"].length
  end

  def test_anthropic_authenticates_with_its_own_header
    configure!(base_url: "https://api.anthropic.com/v1", api_key: "sk-ant-test")
    headers = AiChat.send(:auth_headers, AiChat.endpoint)

    assert_equal "sk-ant-test", headers["x-api-key"]
    assert_equal AiChat::ANTHROPIC_VERSION, headers["anthropic-version"]
    # A bearer would be ignored by Anthropic and leak the key to a second header.
    assert_nil headers["Authorization"]
  end

  def test_other_providers_authenticate_with_a_bearer
    configure!(base_url: "https://api.openai.com/v1", api_key: "sk-test")
    headers = AiChat.send(:auth_headers, AiChat.endpoint)

    assert_equal "Bearer sk-test", headers["Authorization"]
    assert_nil headers["x-api-key"]
  end

  # Anthropic answers with a list of content BLOCKS, not `choices`.
  def test_reads_an_anthropic_reply
    reply = AiChat.send(:extract_reply, JSON.generate({
      "content" => [{ "type" => "text", "text" => "Added a hero." },
                    { "type" => "thinking", "text" => "ignored" }],
    }))

    assert_equal "Added a hero.", reply
  end

  def test_reads_an_openai_reply
    reply = AiChat.send(:extract_reply, JSON.generate({
      "choices" => [{ "message" => { "content" => "Added a hero." } }],
    }))

    assert_equal "Added a hero.", reply
  end

  # ── Conversation validation ──────────────────────────────────────────────

  def test_rejects_a_conversation_with_nothing_in_it
    configure!

    assert_equal "empty_conversation", AiChat.call(messages: []).reason
    assert_equal "empty_conversation", AiChat.call(messages: nil).reason
  end

  # A turn with no content would reach the provider as `null` and 400 there,
  # with nothing to tell the merchant why.
  def test_drops_malformed_turns_rather_than_forwarding_them
    configure!

    assert_equal "empty_conversation",
                 AiChat.call(messages: [{ "role" => "user", "content" => "   " },
                                        { "role" => "wizard", "content" => "hi" },
                                        "not a message"]).reason
  end

  def test_refuses_a_conversation_too_large_to_send
    configure!
    huge = [{ "role" => "user", "content" => "x" * (AiChat::MAX_REQUEST_BYTES + 1) }]

    assert_equal "request_too_large", AiChat.call(messages: huge).reason
  end
end
