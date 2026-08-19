require_relative "../spec_helper"

class BakeSpec < Minitest::Test
  def setup
    PageDependency.dataset.delete
    PageSource.dataset.delete
    CartItem.dataset.delete
    Cart.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    SiteState.dataset.delete
    @output_root = Dir.mktmpdir("dukafi-bake-")
    @state = SiteState.create(site: {
      "name" => "Test", "settings" => { "language" => "en", "framework" => { "colors" => { "tokens" => [] } } },
    }, seq: 0, publish_version: 0)
  end

  def teardown
    FileUtils.remove_entry(@output_root) if File.exist?(@output_root)
  end

  def document(text: "Published")
    {
      "id" => "home", "slug" => "index", "title" => "Home", "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", children: ["text"]),
        "text" => node("text", "base.text", props: { "tag" => "h1", "text" => text }),
      },
    }
  end

  def node(id, module_id, children: [], props: {})
    {
      "id" => id, "moduleId" => module_id, "props" => props,
      "breakpointOverrides" => {}, "children" => children, "classIds" => [],
    }
  end

  def test_bakes_published_pages_flips_symlink_and_bumps_version
    Page.create(slug: "index", title: "Home & Shop", kind: "page", status: "published", document: document)
    Page.create(slug: "draft", title: "Draft", kind: "page", status: "draft", document: document(text: "Draft"))

    result = Bake.call(state: @state, output_root: @output_root)

    assert_equal 1, result.version
    assert_equal 1, result.page_count
    assert_equal "slot_1", File.readlink(File.join(@output_root, "current"))
    html = File.read(File.join(@output_root, "current", "index.html"))
    assert_includes html, "<title>Home &amp; Shop</title>"
    assert_includes html, "<h1>Published</h1>"
    assert File.file?(File.join(@output_root, "current", "sitemap.xml"))
    assert File.file?(File.join(@output_root, "current", "sitemap-0.xml"))
    assert File.file?(File.join(@output_root, "current", "robots.txt"))
    css_name = html[%r{/assets/(site-[0-9a-f]{12}\.css)}, 1]
    assert File.file?(File.join(@output_root, "current", "assets", css_name))
    assert_equal 1, @state.refresh.publish_version
  end

  def test_a_page_seo_title_beats_the_site_meta_title
    doc = document
    doc["seoTitle"] = "About the shop"
    doc["seoDescription"] = "Who we are."
    Page.create(slug: "about", title: "About", kind: "page", status: "published", document: doc)
    @state.update(site: @state.site.merge("settings" => {
      "language" => "en", "metaTitle" => "Same title everywhere", "metaDescription" => "Site blurb",
      "framework" => { "colors" => { "tokens" => [] } },
    }))

    Bake.call(state: @state, output_root: @output_root)
    html = File.read(File.join(@output_root, "current", "about.html"))

    assert_includes html, "<title>About the shop</title>"
    assert_includes html, 'content="Who we are."'
    refute_includes html, "Same title everywhere"
    refute_includes html, "Site blurb"
  end

  def test_failed_bake_preserves_current_symlink_and_version
    FileUtils.mkdir_p(File.join(@output_root, "slot_0"))
    File.write(File.join(@output_root, "slot_0", "sentinel"), "live")
    File.symlink("slot_0", File.join(@output_root, "current"))
    Page.create(slug: "index", title: "Broken", kind: "page", status: "published", document: document(text: "Before"))
    Page.first.update(document: document(text: "After").tap { |doc| doc["nodes"]["text"]["moduleId"] = "missing.module" })
    product = Product.create(title: "Existing", slug: "existing", status: "active", description_document: "", created_at: Time.now, updated_at: Time.now)
    PageDependency.dataset.insert(page_path: "/existing", product_id: product.id)

    assert_raises(KeyError) { Bake.call(state: @state, output_root: @output_root) }
    assert_equal "slot_0", File.readlink(File.join(@output_root, "current"))
    assert_equal "live", File.read(File.join(@output_root, "current", "sentinel"))
    assert_equal 0, @state.refresh.publish_version
    assert_equal [["/existing", product.id]], PageDependency.select_map(%i[page_path product_id])
  end

  def test_rejects_traversal_slug
    # `bake_path` is what Bake actually writes to (a gated page bakes under
    # `private/`), so the double has to carry it — and the traversal guard has
    # to hold on that value, not on the slug it was derived from.
    unsafe_page = Struct.new(:slug, :title, :document_data, :published_document_data, :bake_path).new(
      "../escape", "Unsafe", document, nil, "../escape"
    )

    assert_raises(ArgumentError) do
      Bake.call(state: @state, pages: [unsafe_page], output_root: @output_root)
    end
    refute File.exist?(File.join(File.dirname(@output_root), "escape.html"))
  end

  def test_bakes_only_tailwind_classes_used_on_published_nodes
    site = @state.site
    site["styleRules"] = {
      "utility-flex" => { "name" => "flex" },
      "utility-padding" => { "name" => "p-4" },
      "unused" => { "name" => "hidden" },
    }
    @state.update(site: site)
    page_document = document(text: "The word grid is prose, not a class.")
    page_document["nodes"]["text"]["classIds"] = %w[utility-flex utility-padding]
    Page.create(
      slug: "index", title: "Tailwind", kind: "page", status: "published",
      document: page_document,
    )

    Bake.call(state: @state, output_root: @output_root)

    html = File.read(File.join(@output_root, "current", "index.html"))
    assert_includes html, 'class="flex p-4"'
    css_name = html[%r{/assets/(site-[0-9a-f]{12}\.css)}, 1]
    css = File.read(File.join(@output_root, "current", "assets", css_name))
    assert_includes css, ".flex{display:flex}"
    assert_includes css, ".p-4{"
    refute_includes css, ".hidden{"
    refute_includes css, ".grid{"
  end

  def test_bakes_each_active_product_from_the_shared_product_template
    Page.create(slug: "index", title: "Home", kind: "page", status: "published", document: document(text: "Store"))
    template = ProductTemplate.ensure!
    product = Product.create(
      title: "Canvas & Carry Bag", slug: "canvas-bag", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    Variant.create(
      product_id: product.id, sku: "BAG", title: "Default", price_cents: 12_900,
      currency: "USD", stock: 5, position: 0
    )

    result = Bake.call(
      state: @state, product_template: template, output_root: @output_root, use_draft: true
    )

    assert_equal 2, result.page_count
    html = File.read(File.join(@output_root, "current", "products", "canvas-bag.html"))
    assert_includes html, "<title>Canvas &amp; Carry Bag</title>"
    assert_includes html, 'property="og:type" content="product"'
    assert_includes html, 'property="og:title" content="Canvas &amp; Carry Bag"'
    assert_includes html, "<h1>Canvas &amp; Carry Bag</h1>"
    assert_includes html, "<span>$129.00</span>"
    assert_includes html, 'name="product_slug" value="canvas-bag"'
    assert_includes html, 'hx-get="/fragments/stock?product_slug=canvas-bag'
    assert_equal [["/products/canvas-bag", product.id]], PageDependency.select_map(%i[page_path product_id])
  end

  def test_bakes_page_one_for_each_collection_from_the_shared_template
    Page.create(slug: "index", title: "Home", kind: "page", status: "published", document: document(text: "Store"))
    template = CollectionTemplate.ensure!
    template_document = template.document_data
    template_document["nodes"]["collection-products"]["props"]["perPage"] = 2
    template.update(document: template_document)
    collection = Collection.create(title: "Featured Bags", slug: "featured", description: "Our picks", sort_order: 0)
    3.times do |index|
      product = Product.create(
        title: "Bag #{index + 1}", slug: "bag-#{index + 1}", status: "active",
        description_document: "", created_at: Time.now, updated_at: Time.now
      )
      Variant.create(product_id: product.id, sku: "BAG-#{index + 1}", title: "Default", price_cents: 1_000, currency: "USD", stock: 2, position: 0)
      CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position: index)
    end
    outsider = Product.create(
      title: "Hat", slug: "hat", status: "active",
      description_document: "", created_at: Time.now, updated_at: Time.now
    )
    Variant.create(product_id: outsider.id, sku: "HAT-1", title: "Default", price_cents: 1_000, currency: "USD", stock: 2, position: 0)

    result = Bake.call(
      state: @state, collection_template: template, output_root: @output_root, use_draft: true
    )

    assert_equal 2, result.page_count
    html = File.read(File.join(@output_root, "current", "collections", "featured.html"))
    assert_includes html, "<title>Featured Bags — 3 Products | Test</title>"
    assert_includes html, 'type="application/ld+json"'
    assert_includes html, '"@type":"CollectionPage"'
    assert_includes html, '"@type":"Organization"'
    assert_includes html, 'name="robots" content="index, follow"'
    assert_includes html, 'rel="canonical" href="/collections/featured"'
    assert_includes html, "/products/bag-1"
    refute_includes html, '"@type":"Product"'
    assert_includes html, "<h1>Featured Bags</h1>"
    assert_includes html, 'href="/products/bag-1"'
    assert_includes html, 'href="/products/bag-2"'
    refute_includes html, 'href="/products/bag-3"'
    assert_includes html, '?loop_collection-products_page=2'
    assert_equal [
      ["/collections/featured", Product.first(slug: "bag-1").id],
      ["/collections/featured", Product.first(slug: "bag-2").id],
      ["/collections/featured", Product.first(slug: "bag-3").id],
    ], PageDependency.order(:product_id).select_map(%i[page_path product_id])
    refute_includes PageDependency.select_map(:product_id), outsider.id
    assert_equal [["/collections/featured", "collections/featured.products"]],
                 PageSource.order(:page_path, :source).select_map(%i[page_path source])
  end
end
