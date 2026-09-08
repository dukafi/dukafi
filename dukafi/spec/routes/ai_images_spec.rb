require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class AiImagesRouteSpec < Minitest::Test
  include Rack::Test::Methods
  def app = Dukafi.app
  def body = JSON.parse(last_response.body)
  def json(method, path, value = {}) = send(method, path, JSON.generate(value), "CONTENT_TYPE" => "application/json")

  def setup
    AiDefault.dataset.delete
    AiConnection.dataset.delete
    MediaAsset.dataset.delete
    Admin.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    json(:post, "/admin/api/cms/setup", siteName: "Store", email: "owner@example.com", password: "correct-horse-battery")
    json(:post, "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery")
    @root = Dir.mktmpdir("dukafi-ai-images-")
    @previous_root = ENV["DUKAFI_STORAGE_ROOT"]
    ENV["DUKAFI_STORAGE_ROOT"] = @root
  end

  def teardown
    ENV["DUKAFI_STORAGE_ROOT"] = @previous_root
    FileUtils.remove_entry(@root) if @root && Dir.exist?(@root)
  end

  def test_unconfigured_ai_is_a_409
    json(:post, "/admin/api/cms/ai/images", prompt: "a bag")
    assert_equal 409, last_response.status
    assert_equal "ai_not_configured", body.dig("error", "code")
  end

  def test_successful_generation_returns_an_asset
    connection = AiConnection.create(name: "Router", provider: "openrouter", api_key: "sk",
                                     image_model: "black-forest-labs/flux")
    default = AiDefault.new
    default[:task] = "image"; default[:connection_id] = connection.id; default[:model] = "black-forest-labs/flux"; default.save
    success = Dukafi::Ai::Images::Success.new(
      media_asset: MediaIngest.call(bytes: HttpStub.png, filename: "ai.png", mime: "image/png", origin: "ai"),
      provider: "openrouter", connection_id: connection.id, model: "black-forest-labs/flux"
    )
    Dukafi::Ai::Images.stub :generate, success do
      json(:post, "/admin/api/cms/ai/images", prompt: "a bag")
    end
    assert_equal 200, last_response.status
    assert body.dig("asset", "id")
    assert_equal "ai", body.dig("asset", "origin")
  end

  def test_provider_chain_failure_is_a_502
    connection = AiConnection.create(name: "Router", provider: "openrouter", api_key: "sk",
                                     image_model: "black-forest-labs/flux")
    default = AiDefault.new
    default[:task] = "image"; default[:connection_id] = connection.id; default[:model] = "black-forest-labs/flux"; default.save
    failure = Dukafi::Ai::Images::Failure.new(attempts: [{ provider: "openrouter", error: "boom", model: "flux", wire: "images-api" }])
    Dukafi::Ai::Images.stub :generate, failure do
      json(:post, "/admin/api/cms/ai/images", prompt: "a bag")
    end
    assert_equal 502, last_response.status
    assert_equal "generation_failed", body.fetch("error")
    assert_equal 1, body.fetch("attempts").length
  end
end
