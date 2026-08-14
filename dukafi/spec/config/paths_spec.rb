require_relative "../spec_helper"

# The three directories that must survive a container being replaced.
#
# In a normal deploy the image is immutable and every byte the merchant owns —
# their database, their published storefront, their uploaded media — lives on
# a mounted volume. If any one of these silently resolves back inside the
# image, that data is destroyed on the next deploy with no error anywhere.
class PathsSpec < Minitest::Test
  def setup
    @saved = ENV.to_h.slice(*%w[
      DUKAFI_DB DUKAFY_DB DUKAFI_PUBLISHED_ROOT DUKAFY_PUBLISHED_ROOT
      DUKAFI_STORAGE_ROOT DUKAFY_STORAGE_ROOT
    ])
    @saved.each_key { |key| ENV.delete(key) }
  end

  def teardown
    %w[DUKAFI_DB DUKAFY_DB DUKAFI_PUBLISHED_ROOT DUKAFY_PUBLISHED_ROOT
       DUKAFI_STORAGE_ROOT DUKAFY_STORAGE_ROOT].each { |key| ENV.delete(key) }
    @saved.each { |key, value| ENV[key] = value }
  end

  def test_defaults_live_inside_the_app_when_nothing_is_configured
    assert_equal File.join(Paths::APP_ROOT, "db", "dukafy.sqlite3"), Paths.database
    assert_equal File.join(Paths::APP_ROOT, "published"), Paths.published_root
    assert_equal File.join(Paths::APP_ROOT, "uploads"), Paths.uploads_root
  end

  def test_each_root_can_be_pointed_at_a_volume
    ENV["DUKAFI_DB"] = "/data/store.sqlite3"
    ENV["DUKAFI_PUBLISHED_ROOT"] = "/data/published"
    ENV["DUKAFI_STORAGE_ROOT"] = "/data"

    assert_equal "/data/store.sqlite3", Paths.database
    assert_equal "/data/published", Paths.published_root
    assert_equal "/data/uploads", Paths.uploads_root
  end

  # The product was renamed after these variables were already set in real
  # shells and real Railway dashboards. Dropping them would take a running
  # store offline on the next restart.
  def test_the_pre_rename_spelling_still_works
    ENV["DUKAFY_PUBLISHED_ROOT"] = "/legacy/published"
    ENV["DUKAFY_STORAGE_ROOT"] = "/legacy"

    assert_equal "/legacy/published", Paths.published_root
    assert_equal "/legacy/uploads", Paths.uploads_root
  end

  def test_the_current_spelling_wins_when_both_are_set
    ENV["DUKAFI_PUBLISHED_ROOT"] = "/new"
    ENV["DUKAFY_PUBLISHED_ROOT"] = "/old"

    assert_equal "/new", Paths.published_root
  end

  # An empty variable is what a platform hands you for a field left blank in
  # the dashboard. Treating "" as configuration would resolve every path to
  # the filesystem root.
  def test_an_empty_variable_falls_through_to_the_default
    ENV["DUKAFI_PUBLISHED_ROOT"] = ""

    assert_equal File.join(Paths::APP_ROOT, "published"), Paths.published_root
  end

  # `MediaAsset#path` holds "uploads/<name>", which is ALSO the public URL.
  # Moving media to a volume must not rewrite either.
  def test_a_stored_relative_path_resolves_under_the_storage_root
    ENV["DUKAFI_STORAGE_ROOT"] = "/data"

    assert_equal "/data/uploads/ab12-hero.png", Paths.storage_file("uploads/ab12-hero.png")
    assert_equal "/data/uploads/ab12-hero.png", Paths.storage_file("/uploads/ab12-hero.png")
  end

  def test_a_path_that_climbs_out_of_the_storage_root_is_refused
    ENV["DUKAFI_STORAGE_ROOT"] = "/data"

    assert_raises(ArgumentError) { Paths.storage_file("uploads/../../etc/passwd") }
    assert_raises(ArgumentError) { Paths.storage_file("../etc/passwd") }
  end

  # A sibling directory sharing a prefix ("/datax") must not read as inside
  # "/data" — a plain `start_with?` on the root would let it through.
  def test_a_prefix_sharing_sibling_is_not_inside_the_root
    ENV["DUKAFI_STORAGE_ROOT"] = "/data"

    assert_raises(ArgumentError) { Paths.storage_file("../datax/secret") }
  end
end
