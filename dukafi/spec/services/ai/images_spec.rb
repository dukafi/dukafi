require_relative "../../spec_helper"

class AiImagesSpec < Minitest::Test
  def setup
    AiUsageEvent.dataset.delete if defined?(AiUsageEvent)
    AiDefault.dataset.delete
    AiConnection.dataset.delete
    MediaAsset.dataset.delete
    PluginSetting.dataset.delete
    @root = Dir.mktmpdir("dukafi-images-")
    @previous_root = ENV["DUKAFI_STORAGE_ROOT"]
    ENV["DUKAFI_STORAGE_ROOT"] = @root
  end

  def teardown
    Dukafi::Ai::CapabilityResolver.clear!
    AiDefault.dataset.delete
    AiConnection.dataset.delete
    MediaAsset.dataset.delete
    ENV["DUKAFI_STORAGE_ROOT"] = @previous_root
    FileUtils.remove_entry(@root) if @root && Dir.exist?(@root)
  end

  def connection!(priority: 10, model: "black-forest-labs/flux")
    AiConnection.create(name: "Router #{priority}", provider: "openrouter", api_key: "sk-test",
                        image_model: model, priority: priority)
  end

  def request(**attrs)
    Dukafi::Ai::Images::Request.new(prompt: "a shopfront", size: "1024x1024", count: 1,
                                    connection_id: nil, model: nil, **attrs)
  end

  def stub_images(mapping)
    Dukafi::Ai::Images::WireImagesApi.stub :generate, ->(connection:, **) {
      raise mapping.fetch(connection.id) if mapping[connection.id].is_a?(Exception) || mapping[connection.id].is_a?(String)
      mapping.fetch(connection.id)
    } do
      yield
    end
  end

  def capable
    Dukafi::Ai::Capabilities.new(tool_calling: true, vision_input: false, image_generation: true, streaming: true)
  end

  def test_default_first_ordering
    secondary = connection!(priority: 20)
    primary = connection!(priority: 5)
    default = AiDefault.new
    default[:task] = "image"; default[:connection_id] = secondary.id; default[:model] = secondary.image_model; default.save
    seen = []
    Dukafi::Ai::CapabilityResolver.stub :resolve, capable do
      Dukafi::Ai::Images.stub :generate_candidate, ->(candidate, **) {
        seen << candidate[:connection].id
        raise "fail #{candidate[:connection].id}"
      } do
        Dukafi::Ai::Images.generate(request)
      end
    end
    assert_equal [secondary.id, primary.id], seen.first(2)
  end

  def test_explicit_connection_skips_the_chain
    first = connection!(priority: 1)
    second = connection!(priority: 2)
    Dukafi::Ai::Images.stub :generate_candidate, ->(candidate, **) {
      flunk "used #{candidate[:connection].id}" unless candidate[:connection].id == second.id
      [[{ bytes: HttpStub.png, mime: "image/png" }], "images-api"]
    } do
      result = Dukafi::Ai::Images.generate(request(connection_id: second.id, model: second.image_model))
      assert result.is_a?(Dukafi::Ai::Images::Success)
    end
    refute_nil first
  end

  def test_budget_caps_at_four_attempts
    5.times { |i| connection!(priority: i + 1, model: "black-forest-labs/flux-#{i}") }
    attempts = 0
    Dukafi::Ai::CapabilityResolver.stub :resolve, capable do
      Dukafi::Ai::Images.stub :generate_candidate, ->(*) { attempts += 1; raise "nope" } do
        Dukafi::Ai::Images.generate(request)
      end
    end
    assert_equal Dukafi::Ai::Images::MAX_ATTEMPTS, attempts
  end

  def test_attempt_errors_are_sanitized
    connection!(priority: 1)
    Dukafi::Ai::CapabilityResolver.stub :resolve, capable do
      Dukafi::Ai::Images.stub :generate_candidate, ->(*) { raise "Bearer sk-secret exploded" } do
        result = Dukafi::Ai::Images.generate(request)
        assert result.is_a?(Dukafi::Ai::Images::Failure)
        refute_includes result.attempts.first[:error], "sk-secret"
        assert_includes result.attempts.first[:error], "[REDACTED]"
      end
    end
  end
end
