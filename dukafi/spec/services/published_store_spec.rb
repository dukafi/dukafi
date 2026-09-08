require_relative "../spec_helper"

class PublishedStoreSpec < Minitest::Test
  def setup
    @previous = ENV["DUKAFI_PUBLISHED_STORE"]
    ENV["DUKAFI_PUBLISHED_STORE"] = "db"
    PublishedStore.clear_cache
    DB[:published_files].delete
    DB[:published_states].where(id: 1).update(current_version: 0)
  end

  def teardown
    ENV["DUKAFI_PUBLISHED_STORE"] = @previous
    PublishedStore.clear_cache
  end

  def test_readers_never_observe_a_mixed_version_during_activation
    PublishedStore.write_version(1, { "index.html" => { content: "v1", content_type: "text/html" } })
    PublishedStore.activate(1)
    PublishedStore.write_version(2, { "index.html" => { content: "v2", content_type: "text/html" } })
    seen = []
    reader = Thread.new do
      50.times { seen << PublishedStore.read("index.html")&.content }
    end
    PublishedStore.activate(2)
    reader.join
    assert seen.all? { |value| %w[v1 v2].include?(value) }
    refute seen.any?(&:nil?)
  end

  def test_lru_invalidates_on_activate
    PublishedStore.write_version(1, { "index.html" => { content: "v1", content_type: "text/html" } })
    PublishedStore.activate(1)
    assert_equal "v1", PublishedStore.read("index.html").content
    PublishedStore.write_version(2, { "index.html" => { content: "v2", content_type: "text/html" } })
    PublishedStore.activate(2)
    assert_equal "v2", PublishedStore.read("index.html").content
  end
end
