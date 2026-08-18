require_relative "../spec_helper"

class PluginPagesSpec < Minitest::Test
  def setup
    PluginSetting.where(plugin_id: "page-lab").delete
    PluginPages.load_budget = nil
    PluginPages.action_budget = nil
  end

  def teardown
    Dukafi::Plugins.unregister("page-lab")
    PluginSetting.where(plugin_id: "page-lab").delete
    PluginPages.load_budget = nil
    PluginPages.action_budget = nil
  end

  def register_usage_plugin(&extra)
    Dukafi::Plugins.register("page-lab") do |p|
      p.name "Usage lab"
      p.secret :api_token, label: "API token"
      p.page :usage, title: "Usage", description: "This project's usage." do |page|
        page.stat :used, label: "Used this month"
        page.info :project, label: "Project"
        page.table :services, label: "Services", columns: [
          { key: "name", label: "Service" },
          { key: "cpu", label: "CPU" },
        ]
        page.action :refresh, label: "Refresh"
        extra.call(page) if extra
      end
    end
    Dukafi::Plugins.find("page-lab")
  end

  def test_the_layout_is_what_the_dashboard_draws
    plugin = register_usage_plugin

    page = plugin.to_admin_payload.fetch("pages").first
    assert_equal "usage", page.fetch("id")
    assert_equal ["used"], page.fetch("stats").map { |row| row.fetch("id") }
    assert_equal ["project"], page.fetch("info").map { |row| row.fetch("id") }
    assert_equal ["services"], page.fetch("tables").map { |row| row.fetch("id") }
    assert_equal ["refresh"], page.fetch("actions").map { |row| row.fetch("id") }
  end

  def test_load_fills_only_declared_cards_and_strips_markup
    plugin = register_usage_plugin do |page|
      page.load do |_ctx|
        {
          "stats" => {
            "used" => { "value" => "<b>$12</b>", "hint" => "of $20", "tone" => "good" },
            "secret" => { "value" => "sk-live" },
          },
          "info" => { "project" => "dukafy-prod" },
        }
      end
    end

    data = PluginPages.data(plugin, "usage")
    used = data.fetch("stats").fetch("used")
    assert_equal "$12", used.fetch("value")
    assert_equal "of $20", used.fetch("hint")
    assert_equal "good", used.fetch("tone")
    refute data.fetch("stats").key?("secret")
    assert_equal "dukafy-prod", data.fetch("info").fetch("project").fetch("value")
  end

  def test_a_table_is_paged_and_column_scoped
    plugin = register_usage_plugin do |page|
      page.rows :services do |ctx|
        rows = 3.times.map { |index| { "id" => "s#{index}", "name" => "web-#{index}", "cpu" => "#{index}%", "token" => "nope" } }
        { "rows" => rows.drop(ctx.offset).first(ctx.limit), "total" => rows.length }
      end
    end

    table = PluginPages.table(plugin, "usage", "services", limit: 2, offset: 1)
    assert_equal 2, table.fetch("rows").length
    assert_equal 3, table.fetch("total")
    assert_equal "web-1", table.fetch("rows").first.fetch("name")
    refute table.fetch("rows").first.key?("token")
  end

  def test_an_action_returns_ok_and_a_safe_message
    plugin = register_usage_plugin do |page|
      page.run :refresh do |_ctx|
        { "ok" => true, "message" => "Updated", "reload" => true }
      end
    end

    result = PluginPages.action(plugin, "usage", "refresh")
    assert result.fetch("ok")
    assert_equal "Updated", result.fetch("message")
    assert result.fetch("reload")
  end

  def test_a_raising_handler_does_not_leak_the_exception
    plugin = register_usage_plugin do |page|
      page.load do |_ctx|
        raise "token lab-token-secret is invalid"
      end
    end

    error = assert_raises(PluginPages::Error) { PluginPages.data(plugin, "usage") }
    assert_equal "page_failed", error.code
    refute_includes error.message, "lab-token-secret"
  end

  def test_an_unwired_action_is_refused
    plugin = register_usage_plugin

    error = assert_raises(PluginPages::Error) { PluginPages.action(plugin, "usage", "refresh") }
    assert_equal "action_unwired", error.code
  end

  def test_a_duplicate_page_id_is_refused_at_register
    error = assert_raises(ArgumentError) do
      Dukafi::Plugins.register("page-lab") do |p|
        p.page(:usage, title: "One") {}
        p.page(:usage, title: "Two") {}
      end
    end
    assert_includes error.message, "already has a page"
  end

  def test_mcp_read_is_a_read_and_action_is_a_write
    plugin = register_usage_plugin do |page|
      page.load { |_ctx| { "stats" => { "used" => "$1" } } }
      page.run :refresh do |_ctx|
        { "ok" => true, "message" => "ok" }
      end
    end

    read = McpTools.all.find { |entry| entry.fetch(:name) == "read_plugin_page" }.fetch(:run)
    payload = read.call({ "pluginId" => plugin.id, "pageId" => "usage" })
    assert_equal "$1", payload.dig("data", "stats", "used", "value")

    run = McpTools.all.find { |entry| entry.fetch(:name) == "run_plugin_page_action" }.fetch(:run)
    result = run.call({ "pluginId" => plugin.id, "pageId" => "usage", "actionId" => "refresh" })
    assert result.fetch("ok")
  end
end
