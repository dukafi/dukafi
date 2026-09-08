require_relative "../../../spec_helper"

class WireChatModalitiesSpec < Minitest::Test
  FakeConnection = Struct.new(:driver, :api_key_plain, :base_url, :provider, keyword_init: true)

  def connection
    FakeConnection.new(driver: Dukafi::Ai::Drivers.resolve("openrouter"), api_key_plain: "sk",
                        base_url: "https://openrouter.ai/api/v1", provider: "openrouter")
  end

  def test_extracts_data_url_images
    encoded = Base64.strict_encode64(HttpStub.png)
    Dukafi::Ai::Loop.stub :request, ->(*_args, **_opts) {
      HttpStub.json_ok({ "choices" => [{ "message" => {
        "images" => [{ "image_url" => "data:image/png;base64,#{encoded}" }],
      } }] })
    } do
      images = Dukafi::Ai::Images::WireChatModalities.generate(
        connection: connection, model: "flux", prompt: "bag", size: "1024x1024", count: 1
      )
      assert_equal 1, images.length
      assert_equal "image/png", images.first[:mime]
    end
  end

  def test_provider_errors_raise
    Dukafi::Ai::Loop.stub :request, ->(*_args, **_opts) { HttpStub.error(400, { "error" => "bad model" }) } do
      error = assert_raises(RuntimeError) do
        Dukafi::Ai::Images::WireChatModalities.generate(
          connection: connection, model: "flux", prompt: "bag", size: "1024x1024", count: 1
        )
      end
      assert_includes error.message, "400"
    end
  end
end
