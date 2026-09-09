require_relative "../spec_helper"
require "rack/test"
require "base64"
require "securerandom"
require_relative "../../app"

class ThemesSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Dukafi.app

  def setup
    Review.dataset.delete
    CustomRow.dataset.delete
    CustomTable.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
    post_json "/admin/api/cms/setup", siteName: "Demo Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def json = JSON.parse(last_response.body)

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def empty_page(slug, title)
    root = SecureRandom.hex(8)
    {
      "id" => SecureRandom.hex(8), "slug" => slug, "title" => title,
      "rootNodeId" => root,
      "nodes" => {
        root => {
          "id" => root, "moduleId" => "base.body", "props" => {},
          "breakpointOverrides" => {}, "children" => [], "parentId" => nil, "classIds" => [],
        },
      },
    }
  end

  def test_export_records_media_as_urls_not_bytes
    MediaAsset.create(path: "uploads/bag.jpg", mime: "image/jpeg", alt_text: "Bag", created_at: Time.now)
    Product.create(title: "Bag", slug: "bag", status: "active", description_document: "")
    Page.create(slug: "about", title: "About", kind: "page", status: "draft", document: empty_page("about", "About"))

    get "/admin/api/cms/themes/export"
    assert_equal 200, last_response.status
    payload = ThemeArchive.unpack(last_response.body)

    assert_equal "demo-store", payload.dig("theme", "id")
    assert_equal 1, payload.dig("theme", "contents", "media")
    refute payload["media"].first.key?("bytes")
    refute payload["media"].first.key?("bytesBase64")
    assert_match(%r{\Ahttps?://.+/uploads/bag\.jpg\z}, payload["media"].first.fetch("url"))
    assert_equal "about", payload["pages"].find { |page| page["slug"] == "about" }.fetch("slug")
    assert_equal ["bag"], payload.dig("catalogue", "products").map { |row| row["slug"] }
  end

  def test_import_overrides_pages_and_skips_existing_products
    Page.create(slug: "about", title: "About", kind: "page", status: "draft", document: empty_page("about", "About"))
    Product.create(title: "Bag", slug: "bag", status: "active", description_document: "")
    Product.first.add_variant(sku: "BAG-1", title: "Default", price_cents: 1000, currency: "KES", stock: 2, position: 0)

    get "/admin/api/cms/themes/export"
    archive = Base64.strict_encode64(last_response.body)

    Page.first(slug: "about").update(title: "Changed")

    post_json "/admin/api/cms/themes/apply", archive: archive, remap: {}, options: {
      "overridePages" => true, "products" => true, "pages" => true, "templates" => true,
    }
    assert_equal 200, last_response.status, last_response.body
    assert_equal "About", Page.first(slug: "about").title
    assert_equal 1, Product.where(slug: "bag").count
    assert json.dig("skipped", "products").to_i >= 1
  end

  def test_import_creates_a_missing_page
    get "/admin/api/cms/themes/export"
    archive = Base64.strict_encode64(last_response.body)

    Page.create(slug: "about", title: "About", kind: "page", status: "draft", document: empty_page("about", "About"))
    get "/admin/api/cms/themes/export"
    archive = Base64.strict_encode64(last_response.body)
    Page.first(slug: "about").destroy

    post_json "/admin/api/cms/themes/apply", archive: archive, remap: {}, options: { "overridePages" => true, "pages" => true }
    assert_equal 200, last_response.status, last_response.body
    refute_nil Page.first(slug: "about")
  end

  def test_uploads_send_cors_so_another_origin_can_copy_them
    header "Origin", "https://myshop.ke"
    get "/uploads/missing.jpg"
    assert_equal "*", last_response.get_header("Access-Control-Allow-Origin")

    header "Origin", "https://myshop.ke"
    options "/uploads/missing.jpg"
    assert_equal 204, last_response.status
    assert_equal "*", last_response.get_header("Access-Control-Allow-Origin")
  end

  def test_default_theme_falls_back_to_the_bundled_theme_when_the_registry_is_down
    PluginCatalogue.http = lambda { |_url| raise PluginCatalogue::Error.new("unreachable", "offline") }
    get "/admin/api/cms/themes/default"
    assert_equal 200, last_response.status
    assert_equal "september-2026", json.dig("theme", "id")
  ensure
    PluginCatalogue.http = nil
  end

  def test_catalogue_falls_back_to_bundled_starters_when_the_registry_is_down
    PluginCatalogue.http = lambda { |_url| raise PluginCatalogue::Error.new("unreachable", "offline") }
    get "/admin/api/cms/themes/catalogue"
    assert_equal 200, last_response.status
    ids = json.fetch("themes").map { |row| row.fetch("id") }
    assert_includes ids, "september-2026"
    assert_includes ids, "duka-classic"
    assert json.fetch("degraded")
  ensure
    PluginCatalogue.http = nil
  end

  def test_export_omits_unchecked_sections
    MediaAsset.create(path: "uploads/bag.jpg", mime: "image/jpeg", alt_text: "Bag", created_at: Time.now)
    Product.create(title: "Bag", slug: "bag", status: "active", description_document: "")

    get "/admin/api/cms/themes/export?media=0&products=0"
    assert_equal 200, last_response.status
    payload = ThemeArchive.unpack(last_response.body)

    assert_nil payload["media"]
    assert_nil payload["catalogue"]
    assert_equal 0, payload.dig("theme", "contents", "media")
    assert_equal 0, payload.dig("theme", "contents", "products")
  end

  def test_export_strips_forms_when_forms_are_off
    Page.create(slug: "contact", title: "Contact", kind: "page", status: "draft", document: form_page)

    get "/admin/api/cms/themes/export?forms=0"
    payload = ThemeArchive.unpack(last_response.body)
    page = payload["pages"].find { |row| row["slug"] == "contact" }

    assert_equal 0, payload.dig("theme", "contents", "forms")
    refute page["document"]["nodes"].any? { |_id, node| node["moduleId"] == "base.form" }
  end

  def test_import_creates_missing_products_and_collections
    product = Product.create(title: "Bag", slug: "bag", status: "active", description_document: "")
    product.add_variant(sku: "BAG-1", title: "Default", price_cents: 2500, currency: "KES", stock: 4, position: 0)
    collection = Collection.create(title: "Featured", slug: "featured", description: "Picks", sort_order: 1)
    CommerceWrites.set_collection_products!(collection, [product.id])

    get "/admin/api/cms/themes/export"
    archive = Base64.strict_encode64(last_response.body)

    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete

    post_json "/admin/api/cms/themes/apply", archive: archive, remap: {}, options: { "products" => true }
    assert_equal 200, last_response.status, last_response.body
    imported = Product.first(slug: "bag")
    refute_nil imported
    assert_equal 2500, imported.variants.first.price_cents
    featured = Collection.first(slug: "featured")
    refute_nil featured
    assert_equal ["bag"], featured.products.map(&:slug)
  end

  def test_apply_persists_theme_on_site_settings
    get "/admin/api/cms/themes/export"
    archive = Base64.strict_encode64(last_response.body)

    post_json "/admin/api/cms/themes/apply", archive: archive, remap: {}, options: { "pages" => true }
    assert_equal 200, last_response.status, last_response.body
    theme = SiteState.first.site.dig("settings", "theme")
    refute_nil theme
    assert_equal "demo-store", theme["themeId"]
    refute_nil theme["version"]
    refute_nil theme["appliedAt"]
  end

  def test_bundled_september_2026_apply_publish_bakes_storefront_content
    bytes = ThemeCatalogue.download("september-2026")
    refute_nil bytes
    archive = Base64.strict_encode64(bytes)

    post_json "/admin/api/cms/themes/apply", archive: archive, remap: {}, options: {
      "overridePages" => true, "pages" => true, "templates" => true, "partials" => true,
      "tables" => true, "products" => true,
    }
    assert_equal 200, last_response.status, last_response.body
    page = Page.first(slug: "index")
    refute_nil page
    assert_equal "Home", page.title
    refute_nil Page.first(slug: "journal")
    refute_nil CustomTable.first(slug: "journal")
    refute_nil Collection.first(slug: "featured")
    page.update(status: "published")

    published_root = Dir.mktmpdir("dukafi-theme-bake-")
    previous = ENV["DUKAFY_PUBLISHED_ROOT"]
    ENV["DUKAFY_PUBLISHED_ROOT"] = published_root
    begin
      Bake.call(state: SiteState.first, output_root: published_root)
      html = File.read(File.join(published_root, "current", "index.html"))
      assert_includes html, "Goods for everyday use"
      get "/"
      assert_equal 200, last_response.status
      assert_includes last_response.body, "Shop the range"
    ensure
      ENV["DUKAFY_PUBLISHED_ROOT"] = previous
      FileUtils.remove_entry(published_root) if published_root && Dir.exist?(published_root)
    end
  end

  def test_bundled_starter_apply_publish_bakes_storefront_content
    bytes = ThemeCatalogue.download("duka-classic")
    refute_nil bytes
    archive = Base64.strict_encode64(bytes)

    post_json "/admin/api/cms/themes/apply", archive: archive, remap: {}, options: {
      "overridePages" => true, "pages" => true, "templates" => true, "partials" => true,
    }
    assert_equal 200, last_response.status, last_response.body
    page = Page.first(slug: "index")
    refute_nil page
    page.update(status: "published")

    published_root = Dir.mktmpdir("dukafi-theme-bake-")
    previous = ENV["DUKAFY_PUBLISHED_ROOT"]
    ENV["DUKAFY_PUBLISHED_ROOT"] = published_root
    begin
      Bake.call(state: SiteState.first, output_root: published_root)
      html = File.read(File.join(published_root, "current", "index.html"))
      assert_includes html, "Made for everyday moments"
      get "/"
      assert_equal 200, last_response.status
      assert_includes last_response.body, "Made for everyday moments"
    ensure
      ENV["DUKAFY_PUBLISHED_ROOT"] = previous
      FileUtils.remove_entry(published_root) if published_root && Dir.exist?(published_root)
    end
  end

  def form_page
    {
      "id" => "contact-page", "slug" => "contact", "title" => "Contact", "rootNodeId" => "body",
      "nodes" => {
        "body" => {
          "id" => "body", "moduleId" => "base.body", "props" => {},
          "breakpointOverrides" => {}, "children" => ["form"], "parentId" => nil, "classIds" => [],
        },
        "form" => {
          "id" => "form", "moduleId" => "base.form",
          "props" => { "mode" => "cms", "formId" => "contact" },
          "breakpointOverrides" => {}, "children" => [], "parentId" => "body", "classIds" => [],
        },
      },
    }
  end
end
