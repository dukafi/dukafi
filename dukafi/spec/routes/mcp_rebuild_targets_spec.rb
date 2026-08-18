require_relative "../spec_helper"
require_relative "../../app"

class McpRebuildTargetsSpec < Minitest::Test
  def setup
    PageSource.dataset.delete
    PageDependency.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    CustomRow.dataset.delete
    CustomTable.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
  end

  def tool(name) = McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  def call(name, args = {}) = tool(name).call(args)

  def refusal(name, args = {})
    call(name, args)
    flunk "expected a refusal from #{name}"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def a_product
    Product.create(
      title: "Canvas Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
  end

  def test_no_arguments_exports_the_whole_rebuild_map
    product = a_product
    RebuildIndex.record_path!("/", product_ids: [product.id], sources: %w[products data/team])

    payload = call("list_rebuild_targets")

    assert_equal [{
      "path" => "/",
      "sources" => %w[data/team products],
      "productIds" => [product.id],
    }], payload.fetch("pages")
  end

  def test_a_product_slug_is_the_blast_radius_of_that_product
    product = a_product
    RebuildIndex.record_path!("/", product_ids: [], sources: ["products"])
    RebuildIndex.record_path!("/about", product_ids: [], sources: ["reviews"])

    payload = call("list_rebuild_targets", { "productSlug" => "canvas-bag" })

    assert_equal "canvas-bag", payload.fetch("productSlug")
    assert_equal ["/", "/products/canvas-bag"], payload.fetch("paths")
  end

  def test_a_table_slug_is_every_page_looping_that_table
    CustomTable.create(name: "Team", slug: "team", created_at: Time.now, updated_at: Time.now)
    RebuildIndex.record_path!("/", product_ids: [], sources: ["data/team"])
    RebuildIndex.record_path!("/shop", product_ids: [], sources: ["products"])

    payload = call("list_rebuild_targets", { "tableSlug" => "team" })

    assert_equal ["/"], payload.fetch("paths")
    assert_equal "data/team", payload.fetch("source")
  end

  def test_a_source_filter_is_an_exact_loop_path
    RebuildIndex.record_path!("/", product_ids: [], sources: ["reviews"])

    payload = call("list_rebuild_targets", { "source" => "reviews" })

    assert_equal ["/"], payload.fetch("paths")
  end

  def test_two_filters_at_once_are_refused
    assert_match(/Pass only one/, refusal("list_rebuild_targets", {
      "productSlug" => "bag", "tableSlug" => "team",
    }))
  end

  def test_export_is_a_read
    refute McpTools.write_tool?("list_rebuild_targets")
  end
end
