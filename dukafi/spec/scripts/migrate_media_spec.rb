require_relative "../spec_helper"

class MigrateMediaSpec < Minitest::Test
  FakeAdapter = Module.new do
    class << self
      attr_accessor :stored, :verified
      def store(io:, path:, content_type:)
        @stored << { path: path, bytes: io.read, content_type: content_type }
        MediaStorage::StoredFile.new(url: "/#{path}", path: path)
      end
      def verify! = (@verified = true)
      def read_url(path) = "/#{path}"
      def delete(_path) = nil
    end
  end

  def setup
    MediaAsset.dataset.delete
    @root = Dir.mktmpdir("dukafi-migrate-media-")
    @previous = ENV["DUKAFI_STORAGE_ROOT"]
    ENV["DUKAFI_STORAGE_ROOT"] = @root
    FakeAdapter.stored = []
    FakeAdapter.verified = false
    FileUtils.mkdir_p(File.join(@root, "uploads"))
  end

  def teardown
    ENV["DUKAFI_STORAGE_ROOT"] = @previous
    FileUtils.remove_entry(@root) if @root && Dir.exist?(@root)
  end

  def write_asset(name: "a.png")
    path = File.join("uploads", name)
    File.binwrite(Paths.storage_file(path), HttpStub.png)
    MediaAsset.create(path: path, mime: "image/png", storage: "local", origin: "upload", created_at: Time.now, updated_at: Time.now)
  end

  def run_migrate(*args)
    MediaStorage.stub :resolve, FakeAdapter do
      MigrateMedia.call(
        target: "s3",
        dry_run: args.include?("--dry-run"),
        delete_local: args.include?("--delete-local"),
      )
    end
  end

  def test_dry_run_does_not_copy
    write_asset
    out = capture_io { run_migrate("--dry-run") }.first
    assert_includes out, "would migrate"
    assert_empty FakeAdapter.stored
    assert_equal "local", MediaAsset.first.storage
  end

  def test_copy_checksum_and_idempotency
    asset = write_asset
    capture_io { run_migrate }
    assert FakeAdapter.verified
    assert_equal 1, FakeAdapter.stored.length
    assert_equal "s3", asset.refresh.storage
    capture_io { run_migrate }
    assert_equal 1, FakeAdapter.stored.length
  end

  def test_missing_source_is_skipped
    MediaAsset.create(path: "uploads/missing.png", mime: "image/png", storage: "local", origin: "upload",
                      created_at: Time.now, updated_at: Time.now)
    err = capture_io { run_migrate }.last
    assert_includes err, "missing"
    assert_equal "local", MediaAsset.first.storage
  end
end
