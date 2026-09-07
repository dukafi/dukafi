require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class AiConnectionsSpec < Minitest::Test
  include Rack::Test::Methods
  def app = Dukafi.app
  def body = JSON.parse(last_response.body)
  def json(method, path, value = {}) = send(method, path, JSON.generate(value), "CONTENT_TYPE" => "application/json")

  def setup
    AiDefault.dataset.delete; AiConnection.dataset.delete; Admin.dataset.delete; Page.dataset.delete; SiteState.dataset.delete
    json(:post, "/admin/api/cms/setup", siteName: "Store", email: "owner@example.com", password: "correct-horse-battery")
    json(:post, "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery")
  end

  def teardown
    AiDefault.dataset.delete
    AiConnection.dataset.delete
  end

  def test_crud_masks_key_and_restricts_a_default
    json(:post, "/admin/api/cms/ai/connections", name: "Local", provider: "ollama",
         baseUrl: "http://localhost:11434/v1", apiKey: "secret", chatModel: "llama3")
    assert_equal 201, last_response.status
    id = body.fetch("id")
    refute_includes last_response.body, "secret"
    assert_equal true, body.fetch("isSet")

    json(:put, "/admin/api/cms/ai/defaults", chat: { connectionId: id, model: "llama3" })
    assert_equal 204, last_response.status
    delete "/admin/api/cms/ai/connections/#{id}"
    assert_equal 409, last_response.status
  end

  def test_chat_gates_image_attachments_before_network
    connection = AiConnection.create(name: "Local", provider: "ollama", base_url: "http://localhost:11434/v1")
    default = AiDefault.new
    default[:task] = "chat"; default[:connection_id] = connection.id; default[:model] = "llama3"; default.save
    json(:post, "/admin/api/cms/ai/chat", messages: [{ role: "user", content: "hi" }], attachments: [{ name: "x.png" }])
    assert_equal 422, last_response.status
    assert_equal "The selected model does not support image input. Choose a vision-capable model.", body.dig("error", "message")
  end
end
