require_relative "../../spec_helper"

class CapabilityResolverSpec < Minitest::Test
  def setup
    Dukafi::Ai::CapabilityResolver.clear!
    AiDefault.dataset.delete
    AiConnection.dataset.delete
    @connection = AiConnection.create(name: "Router", provider: "openrouter", api_key: "sk-test",
                                     chat_model: "openai/gpt-4o-mini")
  end

  def teardown
    Dukafi::Ai::CapabilityResolver.clear!
    AiDefault.dataset.delete
    AiConnection.dataset.delete
  end

  def driver = @connection.driver

  def live_caps(vision:, image:)
    [{ id: "openai/gpt-4o-mini", label: "gpt-4o-mini",
       capabilities: { toolCalling: true, visionInput: vision, imageGeneration: image, streaming: true } }]
  end

  def test_successful_live_resolution_is_cached_for_five_minutes
    calls = 0
    driver.stub :list_models, ->(_connection) { calls += 1; live_caps(vision: true, image: true) } do
      first = Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
      second = Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
      assert_equal true, first.vision_input
      assert_equal true, first.image_generation
      assert_equal first, second
      assert_equal 1, calls
    end
  end

  def test_cache_expires_after_five_minutes
    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    calls = 0
    driver.stub :list_models, ->(_connection) { calls += 1; live_caps(vision: true, image: false) } do
      Process.stub :clock_gettime, ->(*) { now } do
        Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
      end
      Process.stub :clock_gettime, ->(*) { now + Dukafi::Ai::CapabilityResolver::TTL + 1 } do
        Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
      end
    end
    assert_equal 2, calls
  end

  def test_failed_live_resolution_fails_closed_for_vision_and_image_generation
    driver.stub :list_models, ->(_connection) { raise "timeout" } do
      caps = Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
      assert_equal false, caps.vision_input
      assert_equal false, caps.image_generation
    end
  end

  def test_empty_live_lookup_fails_closed
    driver.stub :list_models, ->(_connection) { [] } do
      caps = Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
      assert_equal false, caps.vision_input
      assert_equal false, caps.image_generation
    end
  end

  def test_editing_a_connection_invalidates_the_cached_capabilities
    calls = 0
    driver.stub :list_models, ->(_connection) { calls += 1; live_caps(vision: true, image: true) } do
      Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
      @connection.update(name: "Renamed")
      @connection.refresh
      Dukafi::Ai::CapabilityResolver.resolve(@connection, "openai/gpt-4o-mini")
    end
    assert_equal 2, calls
  end
end
