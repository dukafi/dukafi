require_relative "../../../spec_helper"
require "base64"

class WireImagesApiSpec < Minitest::Test
  FakeConnection = Struct.new(:driver, :api_key_plain, :base_url, :provider, keyword_init: true)

  def connection
    FakeConnection.new(driver: Dukafi::Ai::Drivers.resolve("openai"), api_key_plain: "sk",
                        base_url: "https://api.openai.com/v1", provider: "openai")
  end

  def generate(&block)
    Dukafi::Ai::Loop.stub :request, ->(uri, **opts) { block.call(uri, opts) } do
      Dukafi::Ai::Images::WireImagesApi.generate(connection: connection, model: "gpt-image", prompt: "bag",
                                                 size: "1024x1024", count: 1)
    end
  end

  def test_base64_image_responses
    images = generate do |_uri, _opts|
      HttpStub.json_ok({ "data" => [{ "b64_json" => Base64.strict_encode64(HttpStub.png) }] })
    end
    assert_equal "image/png", images.first[:mime]
    assert_equal HttpStub.png, images.first[:bytes]
  end

  def test_url_backed_image_responses
    images = generate do |uri, _opts|
      if uri.path.end_with?("/images/generations")
        HttpStub.json_ok({ "data" => [{ "url" => "https://cdn.example/img.png" }] })
      else
        HttpStub.bytes_ok(HttpStub.png, content_type: "image/png")
      end
    end
    assert_equal HttpStub.png, images.first[:bytes]
  end

  def test_https_is_enforced_with_loopback_exception
    generate do |uri, _opts|
      if uri.path.end_with?("/images/generations")
        HttpStub.json_ok({ "data" => [{ "url" => "http://evil.example/img.png" }] })
      else
        flunk "should not fetch a cleartext URL"
      end
    end
    flunk "expected a refusal"
  rescue RuntimeError => error
    assert_includes error.message, "HTTPS"
  end

  def test_loopback_http_urls_are_allowed
    images = generate do |uri, _opts|
      if uri.path.end_with?("/images/generations")
        HttpStub.json_ok({ "data" => [{ "url" => "http://127.0.0.1:9/img.png" }] })
      else
        HttpStub.bytes_ok(HttpStub.png, content_type: "image/png")
      end
    end
    assert_equal HttpStub.png, images.first[:bytes]
  end

  def test_response_size_limits
    generate do |uri, _opts|
      if uri.path.end_with?("/images/generations")
        HttpStub.json_ok({ "data" => [{ "url" => "https://cdn.example/huge.png" }] })
      else
        HttpStub.bytes_ok("x" * (MediaIngest::MAX_BYTES + 1), content_type: "image/png")
      end
    end
    flunk "expected a size refusal"
  rescue RuntimeError => error
    assert_includes error.message, "20 MB"
  end

  def test_malformed_provider_payloads_and_errors
    error = assert_raises(RuntimeError) do
      generate { |_uri, _opts| HttpStub.error(500, { "error" => "nope" }) }
    end
    assert_includes error.message, "500"
  end
end
