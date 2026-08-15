require_relative "../spec_helper"

# The header and footer that wrap every page.
#
# The properties worth pinning are about IDENTITY and PLACEMENT: node ids must
# survive composition (the fragment endpoints address nodes by id, so a
# renamed one leaves the header's cart badge unable to find itself), and the
# header has to land before the page's own content rather than merely
# somewhere in it.
class SitePartialsSpec < Minitest::Test
  def setup
    Page.dataset.delete
    SiteState.dataset.delete
    @state = SiteState.create(site: {
      "name" => "Test Store",
      "settings" => { "language" => "en", "framework" => { "colors" => { "tokens" => [] } } },
      "styleRules" => {},
    }, publish_version: 0)
  end

  def node(id, module_id, children = [], props = {})
    { "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => {}, "classIds" => [] }
  end

  def page_document
    {
      "id" => "p", "slug" => "about", "title" => "About", "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", %w[page-copy]),
        "page-copy" => node("page-copy", "base.text", [], { "tag" => "p", "text" => "Page content" }),
      },
    }
  end

  def partial(prefix, text)
    {
      "id" => prefix, "slug" => prefix, "title" => prefix, "rootNodeId" => "#{prefix}-body",
      "nodes" => {
        "#{prefix}-body" => node("#{prefix}-body", "base.body", ["#{prefix}-bar"]),
        "#{prefix}-bar" => node("#{prefix}-bar", "base.container", ["#{prefix}-text"]),
        "#{prefix}-text" => node("#{prefix}-text", "base.text", [], { "tag" => "p", "text" => text }),
      },
    }
  end

  def render(document)
    Dukafi::Publisher::RenderPage.call(
      document: document, registry: Dukafi::Publisher::REGISTRY, prefetched: {}
    ).html
  end

  def test_a_page_with_no_partials_is_untouched
    assert_equal page_document, SitePartials.compose(page_document)
  end

  def test_the_header_lands_before_the_page_and_the_footer_after
    composed = SitePartials.compose(page_document,
                                    header_document: partial("hdr", "Header here"),
                                    footer_document: partial("ftr", "Footer here"))

    html = render(composed)
    assert_operator html.index("Header here"), :<, html.index("Page content")
    assert_operator html.index("Page content"), :<, html.index("Footer here")
  end

  # Ids are how the cart and form fragments find a region to re-render. Rename
  # one during composition and the header's cart badge silently stops working.
  def test_node_ids_survive_composition
    composed = SitePartials.compose(page_document, header_document: partial("hdr", "Header here"))

    assert composed.fetch("nodes").key?("hdr-bar")
    assert composed.fetch("nodes").key?("hdr-text")
  end

  # One body per document — the partial's own root is dropped and its children
  # are re-parented, or the page would publish with a body inside a body.
  def test_the_partials_own_root_is_dropped
    composed = SitePartials.compose(page_document, header_document: partial("hdr", "Header here"))

    refute composed.fetch("nodes").key?("hdr-body")
    assert_equal "body", composed.dig("nodes", "hdr-bar", "parentId")
  end

  def test_an_empty_partial_changes_nothing
    empty = { "rootNodeId" => "e-body", "nodes" => { "e-body" => node("e-body", "base.body", []) } }

    assert_equal page_document, SitePartials.compose(page_document, header_document: empty)
  end

  # A collision means something is already wrong upstream; silently replacing
  # the page's own node would be the worse failure of the two.
  def test_a_colliding_id_leaves_the_pages_own_node_alone
    clashing = {
      "rootNodeId" => "c-body",
      "nodes" => {
        "c-body" => node("c-body", "base.body", %w[page-copy]),
        "page-copy" => node("page-copy", "base.text", [], { "tag" => "p", "text" => "Header version" }),
      },
    }

    composed = SitePartials.compose(page_document, header_document: clashing)

    assert_equal "Page content", composed.dig("nodes", "page-copy", "props", "text")
  end

  # ── The seeded pair ──────────────────────────────────────────────────────

  def test_the_seeded_header_carries_live_cart_and_account_areas
    SitePartials.ensure!(store_name: "Test Store")
    header = SitePartials.header

    assert_equal "partial", header.kind
    nodes = header.document_data.fetch("nodes")
    # A cart region, so `{cart.count}` resolves and re-renders per visitor.
    assert_equal "cart", nodes.dig("hdr-cart", "actions", "region")
    # A form region, so `form.signedIn` resolves — the account area's whole
    # reason for existing.
    assert_equal "form", nodes.dig("hdr-account", "actions", "region")
    assert_equal "signedOut", nodes.dig("hdr-signin", "visibleWhen", "field")
    assert_equal "signedIn", nodes.dig("hdr-orders", "visibleWhen", "field")
  end

  def test_seeding_twice_does_not_duplicate
    SitePartials.ensure!(store_name: "Test Store")
    SitePartials.ensure!(store_name: "Test Store")

    assert_equal 2, Page.where(kind: "partial").count
  end

  # Class names in a seeded document are HANDLES into the site's style
  # registry, not class names. A document carrying raw names publishes with no
  # styling at all and says nothing about why — which is exactly what the first
  # version of this header did.
  def test_seeding_registers_its_classes_and_stores_ids
    SitePartials.ensure!(store_name: "Test Store")
    header = SitePartials.header

    ids = header.document_data.dig("nodes", "hdr-inner", "classIds")
    rules = @state.refresh.site.fetch("styleRules")

    refute_includes ids, "flex", "raw class names must not reach classIds"
    assert_includes ids, SiteStyleRules.id_for("flex")
    # And the rule exists, which is also what gets the utility COMPILED into
    # the bundle — `DeclaredClassNames` reads the registry, not the document.
    assert_equal "flex", rules.dig(SiteStyleRules.id_for("flex"), "name")
    assert_equal "max-w-6xl", rules.dig(SiteStyleRules.id_for("max-w-6xl"), "name")
  end

  # An existing rule for the same class wins, or the site ends up with two
  # rules both rendering `.flex`.
  def test_an_existing_rule_for_the_same_class_is_reused
    @state.update(site: @state.site.merge("styleRules" => {
                                            "custom-flex" => { "id" => "custom-flex", "name" => "flex",
                                                               "kind" => "class", "selector" => ".flex" },
                                          }))

    mapping = SiteStyleRules.ensure!(%w[flex gap-4], state: @state.refresh)

    assert_equal "custom-flex", mapping.fetch("flex")
    assert_equal SiteStyleRules.id_for("gap-4"), mapping.fetch("gap-4")
  end

  # A partial has no URL. Every `kind: "page"` query skips it, which is what
  # keeps `/site-header` from being a page on the storefront.
  def test_a_partial_is_not_a_page
    SitePartials.ensure!(store_name: "Test Store")

    assert_nil Page.first(slug: "site-header", kind: "page")
    assert_equal 0, Page.where(kind: "page").count
  end

  # The account area bakes as an EMPTY placeholder that fetches itself — the
  # same trade the cart region makes. Worth pinning because it is the property
  # that makes a shared static header safe: the file on disk cannot claim
  # anyone is signed in, because it contains neither branch.
  #
  # It also means the account links appear a moment after load, and not at all
  # without JavaScript. That is the cost of one file served to everyone.
  def test_the_baked_header_carries_no_visitor_state
    SitePartials.ensure!(store_name: "Test Store")
    composed = SitePartials.compose(
      page_document,
      header_document: SitePartials.document_for(SitePartials.header, use_draft: true),
    )

    html = render(composed)

    refute_includes html, "Sign in"
    refute_includes html, "Sign out"
    refute_includes html, "My orders"
    # Both live areas are placeholders pointed at their own fragment.
    assert_includes html, "/fragments/form/region?node=hdr-account"
    assert_includes html, "/fragments/cart/region?node=hdr-cart"
    # The static parts of the header are on the page as normal markup.
    assert_includes html, "Test Store"
    assert_includes html, "Shop"
  end
end
