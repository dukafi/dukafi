require_relative "../spec_helper"
require "fileutils"
require "tmpdir"

class SitemapWriterSpec < Minitest::Test
  def setup
    PageDependency.dataset.delete
    PageSource.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    @root = Dir.mktmpdir("dukafi-sitemap-")
    @slot = File.join(@root, "slot_0")
    FileUtils.mkdir_p(@slot)
    File.symlink("slot_0", File.join(@root, "current"))
    @previous = ENV["DUKAFI_PUBLIC_ORIGIN"]
    ENV["DUKAFI_PUBLIC_ORIGIN"] = "https://shop.example"
    SiteState.create(site: { "name" => "Shop", "settings" => { "language" => "en" } }, publish_version: 1)
  end

  def teardown
    if @previous
      ENV["DUKAFI_PUBLIC_ORIGIN"] = @previous
    else
      ENV.delete("DUKAFI_PUBLIC_ORIGIN")
    end
    FileUtils.remove_entry(@root) if @root && File.exist?(@root)
  end

  def page!(slug, title: slug, access: "public", kind: "page", status: "published")
    document = {
      "id" => slug, "slug" => slug, "title" => title, "rootNodeId" => "b",
      "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }
    Page.create(slug:, title:, kind:, status:, access:, document: JSON.generate(document))
  end

  def publish_template!(kind)
    template = kind == :product ? ProductTemplate.ensure! : CollectionTemplate.ensure!
    template.update(status: "published", published_document: template.document)
    template
  end

  def test_writes_an_index_one_shard_and_robots_txt
    page!("index", title: "Home")
    page!("about")
    page!("search")
    page!("secret", access: "customer")
    publish_template!(:product)
    product = Product.create(title: "Bag", slug: "bag", status: "active",
                             description_document: "", created_at: Time.now, updated_at: Time.now)
    Product.create(title: "Draft", slug: "draft", status: "draft",
                   description_document: "", created_at: Time.now, updated_at: Time.now)
    publish_template!(:collection)
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: 0)
    Collection.create(title: "Empty", slug: "empty", description: "", sort_order: 1)

    result = SitemapWriter.call(slot_path: @slot)

    assert_equal 4, result.url_count
    xml = File.read(File.join(@slot, "sitemap-0.xml"))
    assert_includes xml, "<loc>https://shop.example/</loc>"
    assert_includes xml, "<loc>https://shop.example/about</loc>"
    assert_includes xml, "<loc>https://shop.example/products/bag</loc>"
    assert_includes xml, "<loc>https://shop.example/collections/featured</loc>"
    refute_includes xml, "/search"
    refute_includes xml, "/secret"
    refute_includes xml, "/products/draft"
    refute_includes xml, "/collections/empty"
    index = File.read(File.join(@slot, "sitemap.xml"))
    assert_includes index, "<loc>https://shop.example/sitemap-0.xml</loc>"
    robots = File.read(File.join(@slot, "robots.txt"))
    assert_includes robots, "Disallow: /search"
    assert_includes robots, "Sitemap: https://shop.example/sitemap.xml"
  end

  def test_splits_into_numbered_shards
    previous = SitemapWriter::URLS_PER_FILE
    SitemapWriter.send(:remove_const, :URLS_PER_FILE)
    SitemapWriter.const_set(:URLS_PER_FILE, 1)
    page!("index", title: "Home")
    page!("about")

    SitemapWriter.call(slot_path: @slot)

    assert File.file?(File.join(@slot, "sitemap-0.xml"))
    assert File.file?(File.join(@slot, "sitemap-1.xml"))
    index = File.read(File.join(@slot, "sitemap.xml"))
    assert_includes index, "sitemap-0.xml"
    assert_includes index, "sitemap-1.xml"
  ensure
    SitemapWriter.send(:remove_const, :URLS_PER_FILE)
    SitemapWriter.const_set(:URLS_PER_FILE, previous)
  end

  def test_includes_a_collection_once_it_has_an_active_product
    page!("index", title: "Home")
    publish_template!(:collection)
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    product = Product.create(title: "Bag", slug: "bag", status: "active",
                             description_document: "", created_at: Time.now, updated_at: Time.now)
    CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: 0)

    SitemapWriter.call(slot_path: @slot)
    xml = File.read(File.join(@slot, "sitemap-0.xml"))

    assert_includes xml, "/collections/featured"
  end
end
