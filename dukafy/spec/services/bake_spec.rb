require_relative "../spec_helper"

class BakeSpec < Minitest::Test
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
    @output_root = Dir.mktmpdir("dukafy-bake-")
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
    css_name = html[%r{/assets/(site-[0-9a-f]{12}\.css)}, 1]
    assert File.file?(File.join(@output_root, "current", "assets", css_name))
    assert_equal 1, @state.refresh.publish_version
  end

  def test_failed_bake_preserves_current_symlink_and_version
    FileUtils.mkdir_p(File.join(@output_root, "slot_0"))
    File.write(File.join(@output_root, "slot_0", "sentinel"), "live")
    File.symlink("slot_0", File.join(@output_root, "current"))
    Page.create(slug: "index", title: "Broken", kind: "page", status: "published", document: document(text: "Before"))
    Page.first.update(document: document(text: "After").tap { |doc| doc["nodes"]["text"]["moduleId"] = "missing.module" })

    assert_raises(KeyError) { Bake.call(state: @state, output_root: @output_root) }
    assert_equal "slot_0", File.readlink(File.join(@output_root, "current"))
    assert_equal "live", File.read(File.join(@output_root, "current", "sentinel"))
    assert_equal 0, @state.refresh.publish_version
  end

  def test_rejects_traversal_slug
    unsafe_page = Struct.new(:slug, :title, :document_data, :published_document_data).new(
      "../escape", "Unsafe", document, nil
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
    assert_includes html, "<h1>Canvas &amp; Carry Bag</h1>"
    assert_includes html, '<span class="dukafy-price" data-product="canvas-bag">$129.00</span>'
    assert_includes html, 'name="product_slug" value="canvas-bag"'
    assert_includes html, 'hx-get="/fragments/stock?product_slug=canvas-bag'
  end
end
