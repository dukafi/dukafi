require_relative "../spec_helper"

# Conditional client-side runtimes: a page ships a <script> tag if and only if
# a module on it declared that runtime. Before this, htmx was hardcoded into
# every page, so a text-only page carried ~51KB of JavaScript it never used.
class RuntimeScriptsSpec < Minitest::Test
  Scripts = Dukafi::Publisher::RuntimeScripts

  def registry
    Dukafi::Publisher::Registry.new.tap do |registry|
      registry.register("base.body") { |_props, children, _context| { html: children.join } }
      registry.register("plain.text") { |_props, _children, _context| { html: "<p>hi</p>" } }
      registry.register("needs.htmx") do |_props, _children, _context|
        { html: %(<span hx-get="/x"></span>), runtimes: [:htmx] }
      end
      registry.register("also.needs.htmx") do |_props, _children, _context|
        { html: %(<b hx-get="/y"></b>), runtimes: ["htmx"] }
      end
      registry.register("bogus.runtime") do |_props, _children, _context|
        { html: "<i></i>", runtimes: [:not_a_real_runtime] }
      end
    end
  end

  def node(id, module_id, children: [])
    { "id" => id, "moduleId" => module_id, "children" => children, "props" => {}, "classIds" => [] }
  end

  def render(*module_ids)
    child_ids = module_ids.each_index.map { |i| "c#{i}" }
    nodes = { "root" => node("root", "base.body", children: child_ids) }
    module_ids.each_with_index { |mid, i| nodes["c#{i}"] = node("c#{i}", mid) }
    Dukafi::Publisher::RenderPage.call(
      document: { "rootNodeId" => "root", "nodes" => nodes }, registry: registry
    )
  end

  def test_page_with_no_interactive_modules_declares_no_runtimes
    assert_equal [], render("plain.text", "plain.text").runtimes
  end

  def test_page_collects_the_runtime_a_module_declares
    assert_equal [:htmx], render("plain.text", "needs.htmx").runtimes
  end

  def test_runtimes_are_deduped_across_nodes_and_accept_strings
    # Three htmx-driven modules on one page must still yield a single tag.
    result = render("needs.htmx", "needs.htmx", "also.needs.htmx")
    assert_equal [:htmx], result.runtimes
    assert_equal 1, Scripts.tags(result.runtimes).scan("htmx.min.js").length
  end

  def test_unknown_runtime_names_are_dropped_rather_than_raising
    # A stray declaration must not take down a published page.
    assert_equal [], render("bogus.runtime").runtimes
    assert_equal "", Scripts.tags([:not_a_real_runtime])
  end

  def test_html_document_emits_script_tags_only_for_requested_runtimes
    bare = Dukafi::Publisher::HtmlDocument.call(title: "T", body: "<p>x</p>")
    refute_includes bare, "<script"

    with_htmx = Dukafi::Publisher::HtmlDocument.call(title: "T", body: "<p>x</p>", runtimes: [:htmx])
    assert_includes with_htmx, %(<script src="/js/htmx.min.js" defer></script>)
  end

  def test_end_to_end_a_text_page_ships_no_js_and_a_cart_page_ships_htmx
    # Uses the REAL module registry, so this breaks if a fragment module ever
    # stops declaring its runtime while still emitting hx- attributes.
    text_only = {
      "rootNodeId" => "r",
      "nodes" => {
        "r" => node("r", "base.body", children: ["t"]),
        "t" => { "id" => "t", "moduleId" => "base.text", "props" => { "text" => "Hello" },
                 "children" => [], "classIds" => [] },
      },
    }
    cart = {
      "rootNodeId" => "r",
      "nodes" => {
        "r" => node("r", "base.body", children: ["b"]),
        "b" => node("b", "store.stock-badge"),
      },
    }

    plain = Dukafi::Publisher::RenderPage.call(document: text_only, registry: Dukafi::Publisher::REGISTRY)
    assert_equal [], plain.runtimes
    refute_includes Dukafi::Publisher::HtmlDocument.call(title: "T", body: plain.html, runtimes: plain.runtimes), "<script"

    carted = Dukafi::Publisher::RenderPage.call(
      document: cart, registry: Dukafi::Publisher::REGISTRY, prefetched: {}
    )
    assert_equal [:htmx], carted.runtimes
    assert_includes carted.html, "hx-get"
    assert_includes Dukafi::Publisher::HtmlDocument.call(title: "T", body: carted.html, runtimes: carted.runtimes), "htmx.min.js"
  end

  # Every module that emits hx- attributes must declare :htmx, or the published
  # page silently loses its interactivity. This catches the mismatch directly
  # rather than waiting for someone to notice a dead Add-to-cart button.
  def test_htmx_pages_include_in_flight_busy_styles
    result = render("needs.htmx")
    assert_includes result.css, "@keyframes dukafy-spin"
    refute_includes render("plain.text").css, "dukafy-spin"
  end

  def test_every_module_emitting_hx_attributes_declares_the_htmx_runtime
    %w[store.buy-button store.stock-badge base.form].each do |module_id|
      document = {
        "rootNodeId" => "r",
        "nodes" => { "r" => node("r", "base.body", children: ["n"]), "n" => node("n", module_id) },
      }
      result = Dukafi::Publisher::RenderPage.call(
        document: document, registry: Dukafi::Publisher::REGISTRY, prefetched: {}
      )
      assert_includes result.html, "hx-", "#{module_id} should emit hx- attributes"
      assert_includes result.runtimes, :htmx, "#{module_id} emits hx- attributes but did not declare :htmx"
    end
  end
end
