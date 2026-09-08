require_relative "../../spec_helper"

class AiLoopSpec < Minitest::Test
  FakeConnection = Struct.new(:api_key_plain, :base_url, keyword_init: true)

  def openai
    Dukafi::Ai::Drivers.resolve("openai")
  end

  def anthropic
    Dukafi::Ai::Drivers.resolve("anthropic")
  end

  def connection(url: "https://api.openai.com/v1", key: "sk-secret")
    FakeConnection.new(api_key_plain: key, base_url: url)
  end

  def stub_request
    captured = nil
    Dukafi::Ai::Loop.stub :request, ->(uri, **opts) {
      captured = { uri: uri, headers: opts[:headers], body: opts[:body] }
      yield(captured)
    } do
      yield captured
    end
    captured
  end

  def test_openai_compatible_headers_and_messages
    captured = nil
    Dukafi::Ai::Loop.stub :request, ->(_uri, **opts) {
      captured = opts
      HttpStub.json_ok({ "choices" => [{ "message" => { "content" => "hello" } }] })
    } do
      result = Dukafi::Ai::Loop.chat(
        driver: openai, connection: connection, model: "gpt-4o-mini",
        messages: [{ "role" => "system", "content" => "Be brief" }, { "role" => "user", "content" => "Hi" }]
      )
      assert result.ok?
      assert_equal "hello", result.reply
    end
    assert_equal "Bearer sk-secret", captured[:headers]["Authorization"]
    assert_equal "gpt-4o-mini", captured[:body][:model]
    assert_equal "Be brief", captured[:body][:messages][0]["content"]
  end

  def test_anthropic_headers_and_system_message
    captured = nil
    Dukafi::Ai::Loop.stub :request, ->(_uri, **opts) {
      captured = opts
      HttpStub.json_ok({ "content" => [{ "type" => "text", "text" => "ok" }] })
    } do
      result = Dukafi::Ai::Loop.chat(
        driver: anthropic, connection: connection(url: "https://api.anthropic.com/v1", key: "sk-ant"),
        model: "claude-sonnet-4-5",
        messages: [{ "role" => "system", "content" => "Stay terse" }, { "role" => "user", "content" => "Hi" }]
      )
      assert result.ok?
      assert_equal "ok", result.reply
    end
    assert_equal "sk-ant", captured[:headers]["x-api-key"]
    assert_equal "2023-06-01", captured[:headers]["anthropic-version"]
    assert_equal "Stay terse", captured[:body][:system]
    refute captured[:body][:messages].any? { |message| message["role"] == "system" }
  end

  def test_streaming_sse_is_parsed_into_the_callback
    chunks = []
    sse = "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n" \
          "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n" \
          "data: [DONE]\n\n"
    Dukafi::Ai::Loop.stub :request, ->(_uri, **opts) {
      assert_equal true, opts[:body][:stream]
      HttpStub::Response.new(code: "200", body: sse, content_type: "text/event-stream")
    } do
      result = Dukafi::Ai::Loop.chat(
        driver: openai, connection: connection, model: "gpt-4o-mini",
        messages: [{ "role" => "user", "content" => "Hi" }],
        stream: ->(event) { chunks << event["text"] }
      )
      assert result.ok?
      assert_equal "Hello", result.reply
    end
    assert_equal %w[Hel lo], chunks
  end

  def test_provider_error_is_normalized
    Dukafi::Ai::Loop.stub :request, ->(*_args, **_opts) { HttpStub.error(401, { "error" => { "message" => "bad key" } }) } do
      result = Dukafi::Ai::Loop.chat(
        driver: openai, connection: connection, model: "gpt-4o-mini",
        messages: [{ "role" => "user", "content" => "Hi" }]
      )
      refute result.ok?
      assert_equal "provider_rejected", result.reason
      assert_includes result.detail, "bad key"
    end
  end
end
