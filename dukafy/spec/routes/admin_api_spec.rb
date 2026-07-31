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
    UserPreference.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
  end

  def teardown
    @uploaded_paths.each { |path| File.delete(path) if File.file?(path) }
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
