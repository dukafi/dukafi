require_relative "../spec_helper"

class PartialBakeSpec < Minitest::Test
  def setup
    PageDependency.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    @output_root = Dir.mktmpdir("dukafy-partial-bake-")
    @state = SiteState.create(site: {
      "name" => "Test", "settings" => { "language" => "en", "framework" => { "colors" => { "tokens" => [] } } },
    }, seq: 0, publish_version: 0)
    Page.create(slug: "index", title: "Home", kind: "page", status: "published", document: page_document)
    [ProductTemplate.ensure!, CollectionTemplate.ensure!].each do |template|
      template.update(status: "published", published_document: template.document)
    end
  end

  def teardown
    FileUtils.remove_entry(@output_root) if File.exist?(@output_root)
  end

  def test_one_of_five_hundred_products_rebakes_only_its_dependent_pages
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    target = nil
    500.times do |index|
      product = Product.create(
        title: "Product #{index}", slug: "product-#{index}", status: "active",
        description_document: "", created_at: Time.now, updated_at: Time.now
      )
      Variant.create(
        product_id: product.id, sku: "SKU-#{index}", title: "Default", price_cents: 1_000,
        currency: "USD", stock: 10, position: 0
      )
      target = product if index == 17
      CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: 0) if index == 17
    end
    Bake.call(state: @state, output_root: @output_root)
    unrelated_path = File.join(@output_root, "current", "products", "product-499.html")
    unrelated_mtime = File.mtime(unrelated_path)
    unrelated_content = File.read(unrelated_path)

    target.variants.first.update(price_cents: 2_500)
    result = PartialBake.call(product: target, state: @state, output_root: @output_root)

    assert_operator result.page_count, :<=, 2
    assert_equal ["/collections/featured", "/products/product-17"], result.paths
    assert_includes File.read(File.join(@output_root, "current", "products", "product-17.html")), "$25.00"
    assert_equal unrelated_content, File.read(unrelated_path)
    assert_equal unrelated_mtime, File.mtime(unrelated_path)
    assert_equal 2, @state.refresh.publish_version
  end

  def test_editing_a_collection_directly_rebakes_only_its_own_page
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    product = Product.create(
      title: "Bag", slug: "bag", status: "active", description_document: "", created_at: Time.now, updated_at: Time.now
    )
    Variant.create(product_id: product.id, sku: "BAG-1", title: "Default", price_cents: 1_000, currency: "USD", stock: 10, position: 0)
    CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: 0)
    Bake.call(state: @state, output_root: @output_root)
    unrelated_path = File.join(@output_root, "current", "products", "bag.html")
    unrelated_content = File.read(unrelated_path)

    collection.update(title: "Featured Picks")
    result = PartialBake.call(collection:, state: @state, output_root: @output_root)

    assert_equal ["/collections/featured"], result.paths
    assert_equal unrelated_content, File.read(unrelated_path)
    assert_equal 2, @state.refresh.publish_version
  end

  def test_renaming_a_collections_slug_deletes_the_old_file_and_bakes_the_new_one
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    Bake.call(state: @state, output_root: @output_root)
    old_path = File.join(@output_root, "current", "collections", "featured.html")
    assert File.file?(old_path)

    collection.update(slug: "featured-picks")
    PartialBake.call(collection:, old_slug: "featured", state: @state, output_root: @output_root)

    refute File.file?(old_path)
    assert File.file?(File.join(@output_root, "current", "collections", "featured-picks.html"))
  end

  private

  def page_document
    {
      "id" => "home", "slug" => "index", "title" => "Home", "rootNodeId" => "body",
      "nodes" => {
        "body" => {
          "id" => "body", "moduleId" => "base.body", "props" => {}, "breakpointOverrides" => {},
          "children" => [], "classIds" => [],
        },
      },
    }
  end
end
