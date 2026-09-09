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

  def test_serves_the_baked_sitemap_and_robots_txt
    create_page(slug: "index", text: "Home", title: "Home")
    Bake.call(state: @state, output_root: @published_root)

    get "/sitemap.xml"
    assert_equal 200, last_response.status
    assert_match(/xml/, last_response.content_type)
    assert_includes last_response.body, "sitemap-0.xml"

    get "/sitemap-0.xml"
    assert_equal 200, last_response.status
    assert_includes last_response.body, "<urlset"

    get "/robots.txt"
    assert_equal 200, last_response.status
    assert_includes last_response.body, "Sitemap:"
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
    assert_includes last_response.body, "<title>Featured — 2 Products — Page 2 | Store</title>"
    assert_includes last_response.body, 'name="robots" content="noindex, follow"'
    assert_includes last_response.body, 'rel="canonical" href="/collections/featured"'
    assert_includes last_response.body, 'href="/products/product-2"'
    refute_includes last_response.body, 'href="/products/product-1"'
    assert_includes last_response.body, "Page 2 of 2"
  end

  def publish_search_page
    page = SearchPage.ensure!
    page.update(status: "published")
    page
  end

  def create_product(title:, slug:, sku:)
    product = Product.create(
      title:, slug:, status: "active", description_document: "",
      created_at: Time.now, updated_at: Time.now
    )
    Variant.create(product_id: product.id, sku:, title: "Default", price_cents: 1_000,
                   currency: "USD", stock: 1, position: 0)
    product
  end

  def test_search_reads_the_keyword_query_and_lists_matches
    publish_search_page
    create_product(title: "Water 500ml", slug: "water", sku: "WAT-500")
    create_product(title: "Navy Suit", slug: "suit", sku: "SUIT-1")

    get "/search?keyword=water500ml"

    assert_equal 200, last_response.status
    assert_equal "live", last_response.headers.fetch("x-dukafy-render")
    assert_includes last_response.body, "<title>Water500ml — 1 Product | Store</title>"
    assert_includes last_response.body, 'content="Shop 1 water500ml product at Store. Prices from $10.00."'
    assert_includes last_response.body, 'name="robots" content="noindex, follow"'
    assert_includes last_response.body, 'rel="canonical" href="/search?keyword=water500ml"'
    assert_includes last_response.body, 'name="keyword"'
    assert_includes last_response.body, 'action="/search"'
    assert_includes last_response.body, 'value="water500ml"'
    assert_includes last_response.body, 'href="/products/water"'
    refute_includes last_response.body, 'href="/products/suit"'
    assert_includes last_response.body, '"@type":"CollectionPage"'
    assert_includes last_response.body, '"@type":"Product"'
    assert_includes last_response.body, '"@type":"Offer"'
    assert_includes last_response.body, "Water 500ml"
  end

  def test_search_without_a_keyword_is_the_form
    publish_search_page

    get "/search"

    assert_equal 200, last_response.status
    assert_includes last_response.body, "<title>Search</title>"
    assert_includes last_response.body, 'name="robots" content="noindex, follow"'
    assert_includes last_response.body, 'rel="canonical" href="/search"'
    assert_includes last_response.body, 'name="keyword"'
    refute_includes last_response.body, '"@type":"CollectionPage"'
  end

  def test_baked_search_is_still_served_live_with_noindex
    publish_search_page
    Bake.call(state: @state, output_root: @published_root)

    get "/search"

    assert_equal 200, last_response.status
    assert_equal "live", last_response.headers.fetch("x-dukafy-render")
    assert_includes last_response.body, 'name="robots" content="noindex, follow"'
  end

  def test_search_with_a_keyword_and_no_hits_is_a_404
    publish_search_page
    create_product(title: "Water 500ml", slug: "water", sku: "WAT-500")

    get "/search?keyword=no-such-product"

    assert_equal 404, last_response.status
    assert_includes last_response.body, "<title>No-such-product | Store</title>"
    refute_includes last_response.body, "0 Product"
    assert_includes last_response.body, 'name="robots" content="noindex, follow"'
    assert_includes last_response.body, 'name="keyword"'
    refute_includes last_response.body, '"@type":"CollectionPage"'
    refute_includes last_response.body, 'href="/products/water"'
  end

  def test_successful_html_page_loads_are_counted
    StorefrontLoad.dataset.delete
    create_page(slug: "index", text: "Home", title: "Home")
    Bake.call(state: @state, output_root: @published_root)

    get "/"
    get "/?utm_source=ad"

    assert_equal 200, last_response.status
    row = StorefrontLoad.first(path: "/")
    assert_equal 2, row.views
  end

  def test_assets_robots_and_missing_pages_are_not_counted
    StorefrontLoad.dataset.delete
    create_page(slug: "index", text: "Home", title: "Home")
    create_page(slug: "404", text: "Missing", title: "Missing")
    Bake.call(state: @state, output_root: @published_root)
    html = File.read(File.join(@published_root, "current", "index.html"))
    css_name = html[%r{/assets/(site-[0-9a-f]{12}\.css)}, 1]

    get "/assets/#{css_name}"
    get "/robots.txt"
    get "/sitemap.xml"
    get "/no-such-page"

    assert_equal 0, StorefrontLoad.count
  end
end
