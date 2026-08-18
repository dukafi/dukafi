require_relative "../spec_helper"
require_relative "../../app"

class McpDataTablesSpec < Minitest::Test
  def setup
    CustomRow.dataset.delete
    CustomTable.dataset.delete
    MediaAsset.dataset.delete
  end

  def tool(name)
    definition = McpTools.all.find { |entry| entry.fetch(:name) == name }
    raise "no tool #{name}" if definition.nil?

    definition.fetch(:run)
  end

  def call(name, args = {}) = tool(name).call(args)

  def refusal(name, args = {})
    call(name, args)
    flunk "expected a refusal from #{name}"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def a_table
    call("create_data_table", {
      "name" => "Team",
      "slug" => "team",
      "columns" => [
        { "id" => "name", "label" => "Name", "type" => "text" },
        { "id" => "title", "label" => "Title", "type" => "text" },
        { "id" => "image", "label" => "Image", "type" => "media" },
      ],
    })
  end

  def test_the_slug_is_what_a_page_loop_binds_to
    a_table

    row = call("list_data_tables").fetch("tables").first

    assert_equal "team", row.fetch("slug")
    assert_equal 3, row.fetch("columns").length
  end

  def test_creating_without_a_slug_derives_one
    table = call("create_data_table", {
      "name" => "Look Book",
      "columns" => [{ "label" => "Caption", "type" => "text" }],
    })

    assert_equal "look-book", table.fetch("slug")
  end

  def test_upsert_creates_then_updates_by_slug
    a_table
    created = call("upsert_data_row", {
      "tableSlug" => "team", "slug" => "jane",
      "cells" => { "name" => "Jane", "title" => "Founder" },
    })

    assert_equal "jane", created.fetch("slug")
    assert_equal "Jane", created.fetch("cells").fetch("name")

    call("upsert_data_row", {
      "tableSlug" => "team", "slug" => "jane",
      "cells" => { "name" => "Jane Doe", "title" => "Founder" },
    })

    assert_equal 1, CustomRow.count
    assert_equal "Jane Doe", CustomRow.first.cells_data.fetch("name")
  end

  def test_unknown_cell_keys_are_dropped
    a_table
    row = call("upsert_data_row", {
      "tableSlug" => "team",
      "cells" => { "name" => "Ada", "notAColumn" => "nope" },
    })

    refute row.fetch("cells").key?("notAColumn")
  end

  def test_media_cells_accept_an_asset_id_and_bake_as_a_url
    a_table
    asset = MediaAsset.create(path: "uploads/ada.jpg", mime: "image/jpeg", created_at: Time.now)
    call("upsert_data_row", {
      "tableSlug" => "team", "slug" => "ada",
      "cells" => { "name" => "Ada", "image" => asset.id },
    })

    baked = CommercePrefetcher.call.fetch("dataTables").fetch("team").fetch("rows").first

    assert_equal "/uploads/ada.jpg", baked.fetch("image")
    assert_equal "Ada", baked.fetch("name")
  end

  def test_reserved_column_ids_are_refused
    message = refusal("create_data_table", {
      "name" => "Bad",
      "columns" => [{ "id" => "slug", "label" => "Slug", "type" => "text" }],
    })

    assert_match(/reserved/, message)
  end

  def test_deleting_a_row_removes_it_from_the_prefetch
    a_table
    call("upsert_data_row", { "tableSlug" => "team", "slug" => "ada", "cells" => { "name" => "Ada" } })
    call("delete_data_row", { "tableSlug" => "team", "slug" => "ada" })

    assert_equal 0, CommercePrefetcher.call.fetch("dataTables").fetch("team").fetch("rows").length
  end

  def test_every_table_write_requires_the_write_scope
    %w[create_data_table update_data_table delete_data_table upsert_data_row delete_data_row].each do |name|
      assert McpTools.write_tool?(name), "#{name} must count as a write"
    end
  end

  def test_table_reads_do_not_require_the_write_scope
    %w[list_data_tables read_data_table list_data_rows].each do |name|
      refute McpTools.write_tool?(name), "#{name} should be readable without write scope"
    end
  end

  def test_writes_go_through_the_shared_service
    source = File.read(File.expand_path("../../services/mcp_data_table_tools.rb", __dir__))

    refute_match(/CustomTable\.create|CustomRow\.create/, source)
    assert_match(/CustomTableWrites\./, source)
  end
end
