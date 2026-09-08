require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class PublishedStoreCallSitesSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    PageDependency.dataset.delete
    PageSource.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    DB[:published_files].delete
    DB[:published_states].where(id: 1).update(current_version: 0) if DB.table_exists?(:published_states)
    PublishedStore.clear_cache
    @published_root = Dir.mktmpdir("dukafi-published-call-")
    @previous_root = ENV["DUKAFY_PUBLISHED_ROOT"]
    @previous_store = ENV["DUKAFI_PUBLISHED_STORE"]
    ENV["DUKAFY_PUBLISHED_ROOT"] = @published_root
    @state = SiteState.create(site: {
      "name" => "Store", "settings" => { "language" => "en", "framework" => { "colors" => { "tokens" => [] } } },
    }, seq: 0, publish_version: 0)
  end

  def teardown
    ENV["DUKAFY_PUBLISHED_ROOT"] = @previous_root
    ENV["DUKAFI_PUBLISHED_STORE"] = @previous_store
    PublishedStore.clear_cache
    FileUtils.remove_entry(@published_root) if @published_root && Dir.exist?(@published_root)
  end

  def document(text)
    {
      "id" => "page", "slug" => "index", "title" => "Home", "rootNodeId" => "body",
      "nodes" => {
        "body" => { "id" => "body", "moduleId" => "base.body", "props" => {},
                    "breakpointOverrides" => {}, "children" => ["text"], "classIds" => [] },
        "text" => { "id" => "text", "moduleId" => "base.text", "props" => { "tag" => "h1", "text" => text },
                    "breakpointOverrides" => {}, "children" => [], "classIds" => [] },
      },
    }
  end

  def test_db_store_bake_import_and_storefront_read
    ENV["DUKAFI_PUBLISHED_STORE"] = "db"
    Page.create(slug: "index", title: "Home", kind: "page", status: "published", document: document("From DB"))
    Bake.call(state: @state, output_root: @published_root)
    entry = PublishedStore.read("index.html")
    refute_nil entry
    assert_includes entry.content, "From DB"
    get "/"
    assert_equal 200, last_response.status
    assert_includes last_response.body, "From DB"
  end

  def test_disk_store_read_uses_published_root_files
    ENV["DUKAFI_PUBLISHED_STORE"] = "disk"
    FileUtils.mkdir_p(File.join(@published_root, "current"))
    File.write(File.join(@published_root, "current", "index.html"), "<h1>From disk</h1>")
    entry = PublishedStore.read("index.html")
    refute_nil entry
    assert_includes entry.content, "From disk"
  end
end
