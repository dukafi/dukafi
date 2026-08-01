require_relative "../spec_helper"
require "rack/test"
require "tempfile"
require_relative "../../app"

class AdminApiSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafy.app
  end

  def setup
    @uploaded_paths = []
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    UserPreference.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
    @published_root = Dir.mktmpdir("dukafy-admin-publish-")
    ENV["DUKAFY_PUBLISHED_ROOT"] = @published_root
  end

  def teardown
    @uploaded_paths.each { |path| File.delete(path) if File.file?(path) }
    ENV.delete("DUKAFY_PUBLISHED_ROOT")
    FileUtils.remove_entry(@published_root) if File.exist?(@published_root)
  end

  def json
    JSON.parse(last_response.body)
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def setup_and_login
    post_json "/admin/api/cms/setup", {
      siteName: "Test Store", email: "owner@example.com", password: "correct-horse-battery",
    }
    assert_equal 201, last_response.status
    post_json "/admin/api/cms/login", { email: "owner@example.com", password: "correct-horse-battery" }
    assert_equal 200, last_response.status, last_response.body
  end

  def test_setup_login_and_session_probe
    get "/admin/api/cms/setup/status"
    assert_equal true, json.fetch("needsSetup")

    setup_and_login
    get "/admin/api/cms/me"

    assert_equal 200, last_response.status
    assert_equal "owner@example.com", json.dig("user", "email")
    assert_includes json.fetch("capabilities"), "pages.publish"
    assert_includes json.fetch("capabilities"), "site.read"
  end

  def test_site_load_and_save_round_trip
    setup_and_login
    get "/admin/api/cms/site"
    shell = json.fetch("site")
    get "/admin/api/cms/pages"
    row = json.fetch("rows").first
    body = row.dig("cells", "body")
    page = {
      "id" => row.fetch("id"), "slug" => "renamed", "title" => "Renamed",
      "nodes" => body.fetch("nodes"), "rootNodeId" => body.fetch("rootNodeId"),
    }

    put "/admin/api/cms/site-document", JSON.generate({
      mode: "incremental", site: shell.merge("name" => "Saved Store"),
      changedPages: [page], deletedPageIds: [],
    }), "CONTENT_TYPE" => "application/json"

    assert_equal 200, last_response.status
    assert_equal true, json.fetch("ok")
    assert_equal "renamed", Page.first.slug
    assert_equal "Saved Store", SiteState.first.site.fetch("name")
  end

  def test_protected_endpoint_returns_consistent_error_envelope
    get "/admin/api/cms/pages"

    assert_equal 401, last_response.status, last_response.body
    assert_equal "unauthorized", json.dig("error", "code")
  end

  def test_user_preferences_round_trip_and_reset
    setup_and_login

    get "/admin/api/cms/me/preferences/module-inserter"
    assert_equal 200, last_response.status
    assert_nil json.fetch("value")

    value = { favorites: [{ kind: "module", id: "base.text" }] }
    put "/admin/api/cms/me/preferences/module-inserter", JSON.generate({ value: value }),
        "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
    assert_equal JSON.parse(JSON.generate(value)), json.fetch("value")

    get "/admin/api/cms/me/preferences/module-inserter"
    assert_equal "base.text", json.dig("value", "favorites", 0, "id")

    delete "/admin/api/cms/me/preferences/module-inserter"
    assert_equal 200, last_response.status
    assert_nil json.fetch("value")
  end

  def test_user_preferences_reject_unknown_keys_and_invalid_values
    setup_and_login

    get "/admin/api/cms/me/preferences/not-allowed"
    assert_equal 400, last_response.status

    put "/admin/api/cms/me/preferences/module-inserter", JSON.generate({ value: { favorites: [{ kind: "bad", id: "x" }] } }),
        "CONTENT_TYPE" => "application/json"
    assert_equal 422, last_response.status
  end

  def test_publish_snapshots_drafts_bakes_site_and_reports_freshness
    setup_and_login

    get "/admin/api/cms/publish/status"
    assert_equal false, json.fetch("hasPublishedVersion")
    assert_equal false, json.fetch("draftMatchesPublished")

    post "/admin/api/cms/publish"
    assert_equal 200, last_response.status, last_response.body
    assert_equal 1, json.fetch("publishedPages")
    assert File.file?(File.join(@published_root, "current", "index.html"))

    get "/admin/api/cms/publish/status"
    assert_equal true, json.fetch("hasPublishedVersion")
    assert_equal true, json.fetch("draftMatchesPublished")
    assert_equal 1, json.fetch("publishedPages")
    refute_nil json["lastPublishedAt"]

    page = Page.first
    patch "/admin/api/cms/pages/#{page.id}", JSON.generate({ title: "Changed through API" }),
          "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status
    get "/admin/api/cms/publish/status"
    assert_equal false, json.fetch("draftMatchesPublished")
  end

  def test_compiles_tailwind_classes_for_editor_preview
    setup_and_login

    post_json "/admin/api/cms/tailwind/compile", { classes: %w[flex p-4] }

    assert_equal 200, last_response.status, last_response.body
    assert_includes json.fetch("css"), ".flex{display:flex}"
    assert_includes json.fetch("css"), ".p-4{"
    refute_includes json.fetch("css"), ".hidden{"
  end

  def test_returns_catalog_product_preview_for_commerce_modules
    setup_and_login
    product = Product.create(title: "Canvas Bag", slug: "canvas-bag", status: "active")
    product.add_variant(sku: "BAG-1", title: "Default", price_cents: 12_900, currency: "USD", stock: 3, position: 0)

    get "/admin/api/cms/commerce/products/canvas-bag"

    assert_equal 200, last_response.status
    assert_equal "Canvas Bag", json.dig("product", "title")
    assert_equal 12_900, json.dig("product", "priceCents")
    assert_equal "/products/canvas-bag", json.dig("product", "href")
  end

  def test_media_upload_list_and_delete
    setup_and_login
    source = Tempfile.new(["dukafy-upload", ".txt"])
    source.write("hello media")
    source.rewind

    post "/admin/api/cms/media", {
      "file" => Rack::Test::UploadedFile.new(source.path, "text/plain", original_filename: "hello.txt"),
    }

    assert_equal 201, last_response.status, last_response.body
    asset = json.fetch("asset")
    stored_path = File.expand_path("../../#{asset.fetch('publicPath').delete_prefix('/')}", __dir__)
    @uploaded_paths << stored_path
    assert File.file?(stored_path)

    get "/admin/api/cms/media"
    assert_equal [asset.fetch("id")], json.fetch("assets").map { |item| item.fetch("id") }

    delete "/admin/api/cms/media/#{asset.fetch('id')}"
    assert_equal 204, last_response.status
    refute File.exist?(stored_path)
  ensure
    source&.close!
  end
end
