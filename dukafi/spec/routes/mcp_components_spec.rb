require_relative "../spec_helper"
require_relative "../../app"

class McpComponentsSpec < Minitest::Test
  def setup
    Page.dataset.delete
    SiteState.dataset.delete
    now = Time.now
    SiteState.create(site: { "name" => "Shop", "styleRules" => {} }, seq: 0, created_at: now, updated_at: now)
  end

  def tool(name)
    definition = McpTools.all.find { |entry| entry.fetch(:name) == name }
    raise "no tool #{name}" if definition.nil?

    definition.fetch(:run)
  end

  def call(name, args = {}) = tool(name).call(args)

  def test_create_list_read_delete_without_html
    created = call("create_component", { "name" => "Newsletter form" })
    id = created.fetch("id")
    refute_empty id

    listed = call("list_components")
    assert_equal 1, listed.fetch("components").length
    assert_equal "Newsletter form", listed.dig("components", 0, "name")

    read = call("read_component", { "id" => id })
    assert_includes read.fetch("outline"), "base.body"

    context = StoreContext.call
    assert_equal id, context.dig("components", 0, "id")

    call("delete_component", { "id" => id })
    assert_equal [], call("list_components").fetch("components")
  end

  def test_duplicate_name_is_refused
    call("create_component", { "name" => "Promo" })
    error = assert_raises(McpTools::ArgumentError) { call("create_component", { "name" => "Promo" }) }
    assert_match(/already exists/, error.message)
  end

  def test_list_components_is_a_read_tool
    refute McpTools.write_tool?("list_components")
    refute McpTools.write_tool?("read_component")
    assert McpTools.write_tool?("create_component")
  end
end
