require_relative "../spec_helper"

class MediaStorageSpec < Minitest::Test
  def setup
    @root = Dir.mktmpdir("dukafi-storage-")
    @previous = ENV["DUKAFI_STORAGE_ROOT"]
    ENV["DUKAFI_STORAGE_ROOT"] = @root
    PluginSetting.dataset.delete
  end

  def teardown
    ENV["DUKAFI_STORAGE_ROOT"] = @previous
    FileUtils.remove_entry(@root) if @root && Dir.exist?(@root)
  end

  def test_local_disk_is_the_default_adapter
    assert_equal MediaStorage::LocalDisk, MediaStorage.resolve
    assert_equal MediaStorage::LocalDisk, MediaStorage.resolve("local")
  end

  def test_local_disk_stores_and_deletes
    io = StringIO.new("hello")
    stored = MediaStorage::LocalDisk.store(io: io, path: "uploads/hello.txt", content_type: "text/plain")
    assert_equal "/uploads/hello.txt", stored.url
    assert File.file?(Paths.storage_file("uploads/hello.txt"))
    MediaStorage::LocalDisk.delete("uploads/hello.txt")
    refute File.file?(Paths.storage_file("uploads/hello.txt"))
  end

  def test_unknown_adapter_is_rejected
    error = assert_raises(ArgumentError) { MediaStorage.resolve("missing") }
    assert_includes error.message, "not configured"
  end

  def test_configured_s3_adapter_is_selected
    settings = Dukafi::Plugins::Settings.for("s3_storage")
    settings[:bucket] = "media"
    settings[:endpoint] = "http://127.0.0.1:9000"
    settings[:region] = "us-east-1"
    settings[:access_key] = "key"
    settings[:secret_key] = "secret"
    settings[:public_base_url] = "https://cdn.example"
    assert_equal S3Storage::Adapter, MediaStorage.resolve("s3")
  end
end
