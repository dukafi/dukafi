require_relative "../../spec_helper"

class AiImagesFailureDrillSpec < Minitest::Test
  def setup
    AiUsageEvent.dataset.delete if defined?(AiUsageEvent)
    AiDefault.dataset.delete
    AiConnection.dataset.delete
    MediaAsset.dataset.delete
    @root = Dir.mktmpdir("dukafi-fail-drill-")
    @previous_root = ENV["DUKAFI_STORAGE_ROOT"]
    ENV["DUKAFI_STORAGE_ROOT"] = @root
  end

  def teardown
    ENV["DUKAFI_STORAGE_ROOT"] = @previous_root
    FileUtils.remove_entry(@root) if @root && Dir.exist?(@root)
  end

  def capable
    Dukafi::Ai::Capabilities.new(tool_calling: true, vision_input: false, image_generation: true, streaming: true)
  end

  def test_a_failed_primary_falls_through_to_a_working_secondary
    primary = AiConnection.create(name: "A", provider: "openrouter", api_key: "sk", image_model: "flux", priority: 1)
    secondary = AiConnection.create(name: "B", provider: "openrouter", api_key: "sk", image_model: "flux", priority: 2)
    Dukafi::Ai::CapabilityResolver.stub :resolve, capable do
      Dukafi::Ai::Images.stub :generate_candidate, ->(candidate, **) {
        raise "primary down" if candidate[:connection].id == primary.id
        [[{ bytes: HttpStub.png, mime: "image/png" }], "images-api"]
      } do
        result = Dukafi::Ai::Images.generate(
          Dukafi::Ai::Images::Request.new(prompt: "bag", size: "1024x1024", count: 1, connection_id: nil, model: nil)
        )
        assert result.is_a?(Dukafi::Ai::Images::Success)
        assert_equal secondary.id, result.connection_id
      end
    end
    assert_equal 1, MediaAsset.count
  end

  def test_all_failed_attempts_do_not_leave_media_rows
    AiConnection.create(name: "A", provider: "openrouter", api_key: "sk", image_model: "flux", priority: 1)
    AiConnection.create(name: "B", provider: "openrouter", api_key: "sk", image_model: "flux", priority: 2)
    Dukafi::Ai::CapabilityResolver.stub :resolve, capable do
      Dukafi::Ai::Images.stub :generate_candidate, ->(*) { raise "nope" } do
        result = Dukafi::Ai::Images.generate(
          Dukafi::Ai::Images::Request.new(prompt: "bag", size: "1024x1024", count: 1, connection_id: nil, model: nil)
        )
        assert result.is_a?(Dukafi::Ai::Images::Failure)
      end
    end
    assert_equal 0, MediaAsset.count
  end
end
