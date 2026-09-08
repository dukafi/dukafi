require_relative "../../spec_helper"

class AiDriversSpec < Minitest::Test
  def setup
    @requests = []
  end

  def connection(provider, **attrs)
    AiConnection.new({ name: provider, provider: provider }.merge(attrs))
  end

  def with_stubbed_loop(handler)
    Dukafi::Ai::Loop.stub :request, ->(uri, **opts) {
      @requests << { uri: uri, method: opts[:method], headers: opts[:headers], body: opts[:body] }
      handler.call(uri, opts)
    } do
      yield
    end
  end

  def test_openrouter_lists_models_with_modality_metadata
    payload = {
      "data" => [
        { "id" => "openai/gpt-4o-mini", "name" => "GPT-4o mini",
          "architecture" => { "output_modalities" => ["text"] } },
        { "id" => "black-forest-labs/flux", "name" => "Flux",
          "architecture" => { "output_modalities" => ["image"] } },
      ],
    }
    with_stubbed_loop(->(uri, _opts) {
      assert_includes uri.to_s, "/models"
      HttpStub.json_ok(payload)
    }) do
      models = Dukafi::Ai::Drivers.resolve("openrouter").list_models(connection("openrouter", api_key: "sk"))
      flux = models.find { |row| row[:id] == "black-forest-labs/flux" }
      gpt = models.find { |row| row[:id] == "openai/gpt-4o-mini" }
      assert flux.fetch(:capabilities).fetch(:imageGeneration)
      refute gpt.fetch(:capabilities).fetch(:imageGeneration)
    end
  end

  def test_ollama_discovers_tags_and_enriches_from_api_show
    with_stubbed_loop(->(uri, opts) {
      if uri.path.end_with?("/api/tags")
        HttpStub.json_ok({ "models" => [{ "name" => "llava:latest" }, { "name" => "llama3" }] })
      elsif uri.path.end_with?("/api/show")
        assert_equal :post, opts[:method]
        name = opts.dig(:body, :name) || opts.dig(:body, "name")
        families = name.to_s.include?("llava") ? ["llama", "clip"] : ["llama"]
        HttpStub.json_ok({ "details" => { "families" => families } })
      else
        HttpStub.error(404, {})
      end
    }) do
      models = Dukafi::Ai::Drivers.resolve("ollama").list_models(
        connection("ollama", base_url: "http://127.0.0.1:11434/v1")
      )
      llava = models.find { |row| row[:id] == "llava:latest" }
      llama = models.find { |row| row[:id] == "llama3" }
      assert llava.fetch(:capabilities).fetch(:visionInput)
      refute llama.fetch(:capabilities).fetch(:visionInput)
    end
  end

  def test_openai_family_filtering_drops_non_chat_models
    with_stubbed_loop(->(_uri, _opts) {
      HttpStub.json_ok({ "data" => [
        { "id" => "gpt-4o-mini" }, { "id" => "whisper-1" }, { "id" => "o3-mini" }, { "id" => "davinci-002" },
      ] })
    }) do
      ids = Dukafi::Ai::Drivers.resolve("openai").list_models(connection("openai", api_key: "sk")).map { |row| row[:id] }
      assert_includes ids, "gpt-4o-mini"
      assert_includes ids, "o3-mini"
      refute_includes ids, "whisper-1"
      refute_includes ids, "davinci-002"
    end
  end
end
