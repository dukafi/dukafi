require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

class StorefrontSpec < Minitest::Test
  include Rack::Test::Methods

  def app
    Dukafi.app
  end

  def setup
    PageDependency.dataset.delete
    PageSource.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    SlugRedirect.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    @published_root = Dir.mktmpdir("dukafi-storefront-")
    ENV["DUKAFY_PUBLISHED_ROOT"] = @published_root
    @state = SiteState.create(site: {
      "name" => "Store", "settings" => { "language" => "en", "framework" => { "colors" => { "tokens" => [] } } },
    }, seq: 0, publish_version: 0)
  end

  def teardown
    ENV.delete("DUKAFY_PUBLISHED_ROOT")
    FileUtils.remove_entry(@published_root) if File.exist?(@published_root)
  end

  def document(text)
    {
      "id" => "page", "slug" => "index", "title" => "Page", "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", children: ["text"]),
        "text" => node("text", "base.text", props: { "tag" => "h1", "text" => text }),
      },
    }
  end

  def node(id, module_id, children: [], props: {})
    { "id" => id, "moduleId" => module_id, "props" => props, "breakpointOverrides" => {}, "children" => children, "classIds" => [] }
  end

  def create_page(slug:, text:, title: slug)
    Page.create(slug:, title:, kind: "page", status: "published", document: document(text))
  end

  def test_serves_baked_page_for_empty_and_tracking_only_queries
    create_page(slug: "index", text: "Disk page", title: "Home")
    Bake.call(state: @state, output_root: @published_root)

    get "/?utm_source=newsletter&gclid=123"

    assert_equal 200, last_response.status
    assert_equal "disk", last_response.headers.fetch("x-dukafy-render")
    assert_includes last_response.body, "Disk page"
  end

  def test_real_query_uses_live_render_fallback
    create_page(slug: "index", text: "Live page", title: "Home")

    get "/?loop_products_page=2"

    assert_equal 200, last_response.status
    assert_equal "live", last_response.headers.fetch("x-dukafy-render")
    assert_includes last_response.body, "<style>"
    assert_includes last_response.body, "Live page"
  end

  def test_serves_hashed_css_with_immutable_cache_headers
    create_page(slug: "index", text: "Styled", title: "Home")
    Bake.call(state: @state, output_root: @published_root)
    html = File.read(File.join(@published_root, "current", "index.html"))
    css_name = html[%r{/assets/(site-[0-9a-f]{12}\.css)}, 1]

    get "/assets/#{css_name}"

    assert_equal 200, last_response.status
    assert_equal "public, max-age=31536000, immutable", last_response.headers.fetch("cache-control")
    assert_includes last_response.headers.fetch("content-type"), "text/css"
  end

  def test_uses_authored_404_page
    create_page(slug: "404", text: "Nothing here", title: "Missing")

    get "/does-not-exist"

    assert_equal 404, last_response.status
    assert_includes last_response.body, "Nothing here"
  end

  def test_invalid_slug_path_returns_a_valid_rack_404_response
    get "/favicon.ico"

    assert_equal 404, last_response.status
    assert_includes last_response.headers.fetch("content-type"), "text/html"
    assert_includes last_response.body, "Page not found"
  end

  def test_invalid_asset_path_returns_a_valid_rack_404_response
    get "/assets/not-a-hashed-bundle.css"

    assert_equal 404, last_response.status
    assert_equal "Asset not found", last_response.body
  end

  def test_redirects_old_product_and_collection_slugs_permanently
    SlugRedirect.create(resource_type: "product", old_slug: "old-bag", destination_slug: "new-bag")
    SlugRedirect.create(resource_type: "collection", old_slug: "old-bags", destination_slug: "new-bags")

    get "/products/old-bag"
    assert_equal 301, last_response.status
    assert_equal "/products/new-bag", last_response.headers.fetch("location")

    get "/collections/old-bags"
    assert_equal 301, last_response.status
    assert_equal "/collections/new-bags", last_response.headers.fetch("location")
  end

  def test_collection_pagination_query_renders_the_shared_template_live
    template = CollectionTemplate.ensure!
    template_document = template.document_data
    template_document["nodes"]["collection-products"]["props"]["perPage"] = 1
    template.update(document: template_document, status: "published", published_document: JSON.generate(template_document))
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    2.times do |index|
      product = Product.create(
        title: "Product #{index + 1}", slug: "product-#{index + 1}", status: "active",
        description_document: "", created_at: Time.now, updated_at: Time.now
      )
      Variant.create(product_id: product.id, sku: "SKU-#{index + 1}", title: "Default", price_cents: 1_000, currency: "USD", stock: 1, position: 0)
      CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: index)
    end

    get "/collections/featured?loop_collection-products_page=2"

    assert_equal 200, last_response.status
    assert_equal "live", last_response.headers.fetch("x-dukafy-render")
    assert_includes last_response.body, 'href="/products/product-2"'
    refute_includes last_response.body, 'href="/products/product-1"'
    assert_includes last_response.body, "Page 2 of 2"
  end
end
