require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class PluginPagesApiSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    PluginSetting.where(plugin_id: "page-lab").delete
    Admin.dataset.delete
    clear_cookies
    register_lab!
    post "/admin/api/cms/setup", JSON.generate({
      siteName: "Test Store", email: "owner@example.com", password: "correct-horse-battery",
    }), "CONTENT_TYPE" => "application/json"
    post "/admin/api/cms/login", JSON.generate({
      email: "owner@example.com", password: "correct-horse-battery",
    }), "CONTENT_TYPE" => "application/json"
  end

  def teardown
    Dukafi::Plugins.unregister("page-lab")
    PluginSetting.where(plugin_id: "page-lab").delete
  end

  def json = JSON.parse(last_response.body)

  def register_lab!
    Dukafi::Plugins.unregister("page-lab")
    Dukafi::Plugins.register("page-lab") do |p|
      p.name "Usage lab"
      p.page :usage, title: "Usage" do |page|
        page.stat :used, label: "Used"
        page.table :services, label: "Services", columns: [{ key: "name", label: "Name" }]
        page.action :refresh, label: "Refresh"
        page.load { |_ctx| { "stats" => { "used" => { "value" => "$4" } } } }
        page.rows :services do |_ctx|
          { "rows" => [{ "id" => "web", "name" => "web" }], "total" => 1 }
        end
        page.run :refresh do |_ctx|
          { "ok" => true, "message" => "Fetched", "reload" => true }
        end
      end
    end
  end

  def test_pages_require_authentication
    clear_cookies
    get "/admin/api/cms/plugins/page-lab/pages"
    assert_equal 401, last_response.status
  end

  def test_the_layout_is_listed_on_the_plugin_and_on_pages
    get "/admin/api/cms/plugins"
    plugin = json.fetch("plugins").find { |row| row.fetch("id") == "page-lab" }
    assert_equal "usage", plugin.fetch("pages").first.fetch("id")

    get "/admin/api/cms/plugins/page-lab/pages"
    assert_equal 200, last_response.status, last_response.body
    assert_equal ["usage"], json.fetch("pages").map { |row| row.fetch("id") }
  end

  def test_data_and_table_and_action
    get "/admin/api/cms/plugins/page-lab/pages/usage/data"
    assert_equal 200, last_response.status, last_response.body
    assert_equal "$4", json.dig("stats", "used", "value")

    get "/admin/api/cms/plugins/page-lab/pages/usage/tables/services?limit=25"
    assert_equal 200, last_response.status, last_response.body
    assert_equal ["web"], json.fetch("rows").map { |row| row.fetch("name") }
    assert_equal 1, json.fetch("total")

    post "/admin/api/cms/plugins/page-lab/pages/usage/actions/refresh",
         JSON.generate({ params: {} }), "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
    assert json.fetch("ok")
    assert_equal "Fetched", json.fetch("message")
  end

  def test_a_hidden_plugin_has_no_dashboard_page
    get "/admin/api/cms/plugins/ai/pages"
    assert_equal 404, last_response.status
  end

  def test_an_unknown_page_is_404
    get "/admin/api/cms/plugins/page-lab/pages/missing/data"
    assert_equal 404, last_response.status
  end
end
