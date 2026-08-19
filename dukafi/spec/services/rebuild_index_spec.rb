require_relative "../spec_helper"

class RebuildIndexSpec < Minitest::Test
  def setup
    PageSource.dataset.delete
    PageDependency.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
  end

  def loop_document(*sources)
    nodes = { "body" => { "id" => "body", "moduleId" => "base.body", "props" => {} } }
    sources.each_with_index do |source, index|
      nodes["loop-#{index}"] = {
        "id" => "loop-#{index}", "moduleId" => "store.relationship-loop",
        "props" => { "source" => source },
      }
    end
    { "nodes" => nodes }
  end

  def test_sources_record_catalogue_and_data_loops
    assert_equal %w[data/team products], RebuildIndex.sources(loop_document("products", "data/team"))
  end

  def test_request_time_loops_are_not_rebuild_targets
    assert_equal [], RebuildIndex.sources(loop_document("cart.items", "currentEntry.variants", "orders", "current-query"))
  end

  def test_related_on_a_product_records_the_collections_it_belongs_to
    document = loop_document("currentEntry.related")
    product = { "slug" => "milk", "collectionSlugs" => %w[milk-products featured] }

    assert_equal %w[collections/featured.products collections/milk-products.products],
                 RebuildIndex.sources(document, current_entry: product)
  end

  def test_a_collection_template_loop_records_that_collection_not_the_whole_catalogue
    document = loop_document("products")
    collection = { "slug" => "featured", "products" => [{ "id" => 1 }] }

    assert_equal ["collections/featured.products"],
                 RebuildIndex.sources(document, current_entry: collection)
  end

  def test_targets_for_product_include_listings_that_loop_the_catalogue
    product = Product.create(
      title: "Hat", slug: "hat", status: "active", description_document: "",
      created_at: Time.now, updated_at: Time.now
    )
    RebuildIndex.record_path!("/", product_ids: [], sources: ["products"])
    RebuildIndex.record_path!("/about", product_ids: [], sources: ["data/team"])

    assert_equal ["/", "/products/hat"], RebuildIndex.targets_for_product(product)
  end

  def test_export_is_every_path_with_its_sources_and_product_ids
    product = Product.create(
      title: "Bag", slug: "bag", status: "active", description_document: "",
      created_at: Time.now, updated_at: Time.now
    )
    RebuildIndex.record_path!("/", product_ids: [product.id], sources: %w[products data/team])

    assert_equal [{
      "path" => "/",
      "sources" => %w[data/team products],
      "productIds" => [product.id],
    }], RebuildIndex.export
  end
end
