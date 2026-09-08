require_relative "../spec_helper"

class BootWarningSpec < Minitest::Test
  def test_multiple_replicas_on_disk_storage_warn
    previous_replicas = ENV["DUKAFI_REPLICAS"]
    previous_store = ENV["DUKAFI_PUBLISHED_STORE"]
    ENV["DUKAFI_REPLICAS"] = "2"
    ENV["DUKAFI_PUBLISHED_STORE"] = "disk"
    err = StringIO.new
    Dukafi.warn_storage_config!(io: err)
    assert_includes err.string, "disk-published"
  ensure
    ENV["DUKAFI_REPLICAS"] = previous_replicas
    ENV["DUKAFI_PUBLISHED_STORE"] = previous_store
  end

  def test_db_published_store_is_quiet_with_replicas
    previous_replicas = ENV["DUKAFI_REPLICAS"]
    previous_store = ENV["DUKAFI_PUBLISHED_STORE"]
    ENV["DUKAFI_REPLICAS"] = "2"
    ENV["DUKAFI_PUBLISHED_STORE"] = "db"
    err = StringIO.new
    Dukafi.warn_storage_config!(io: err)
    assert_empty err.string
  ensure
    ENV["DUKAFI_REPLICAS"] = previous_replicas
    ENV["DUKAFI_PUBLISHED_STORE"] = previous_store
  end
end
