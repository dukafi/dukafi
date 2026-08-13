require_relative "../spec_helper"

class RenderPageSpec < Minitest::Test
  def registry
    Dukafy::Publisher::Registry.new.tap do |registry|
      registry.register("base.body") do |_props, children, _context|
        { html: children.join }
      end
      registry.register(
        "base.box",
        schema: {
          "label" => { type: :text },
          "gap" => { type: :text, breakpoint_overridable: true },
        },
        defaults: { "label" => "Box", "gap" => "0" },
      ) do |props, children, _context|
        { html: %(<section data-label="#{props.fetch('label')}" data-gap="#{props.fetch('gap')}">#{children.join}</section>), css: ".box{}" }
      end
      registry.register("base.text", schema: { "text" => { type: :text } }) do |props, _children, _context|
        { html: "<p>#{props.fetch('text')}</p>", css: ".text{}" }
      end
    end
  end

  def node(id, module_id, children: [], props: {}, overrides: {})
    {
      "id" => id, "moduleId" => module_id, "children" => children,
      "props" => props, "breakpointOverrides" => overrides, "classIds" => [],
    }
  end

  def bound_text(id, source, field)
    node(id, "base.text", props: { "text" => "fallback", "tag" => "p" })
      .merge("dynamicBindings" => { "text" => { "source" => source, "field" => field } })
  end

  def test_walks_bottom_up_escapes_props_and_deduplicates_css
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: %w[box other]),
        "box" => node("box", "base.box", children: ["text"], props: { "label" => %(<unsafe ") }),
        "text" => node("text", "base.text", props: { "text" => "Hello <script>" }),
        "other" => node("other", "base.text", props: { "text" => "Again" }),
      },
    }

    result = Dukafy::Publisher::RenderPage.call(document: document, registry: registry)

    assert_equal '<section data-label="&lt;unsafe &quot;" data-gap="0"><p>Hello &lt;script&gt;</p></section><p>Again</p>', result.html
    assert_equal ".text{}\n.box{}", result.css
  end

  def test_interpolates_current_entry_tokens_embedded_in_string_props
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: %w[title stock]),
        "title" => node("title", "base.text", props: { "text" => "{currentEntry.title} - {currentEntry.priceDisplay}" }),
        "stock" => node("stock", "base.text", props: { "text" => "Stock: {currentEntry.stock|N/A}" }),
      },
    }

    result = Dukafy::Publisher::RenderPage.call(
      document: document, registry: registry,
      current_entry: { "title" => "Canvas & Bag", "priceDisplay" => "$48.00" },
    )

    assert_equal "<p>Canvas &amp; Bag - $48.00</p><p>Stock: N/A</p>", result.html
  end

  def test_only_approved_breakpoint_props_override_base_content
    document = {
      "rootNodeId" => "box",
      "nodes" => {
        "box" => node(
          "box", "base.box", props: { "label" => "Base", "gap" => "1" },
          overrides: { "mobile" => { "label" => "Wrong", "gap" => "8" } },
        ),
      },
    }

    result = Dukafy::Publisher::RenderPage.call(
      document: document, registry: registry, breakpoint_id: "mobile"
    )

    assert_includes result.html, 'data-label="Base"'
    assert_includes result.html, 'data-gap="8"'
  end

  def test_rejects_missing_nodes_and_cycles
    missing = { "rootNodeId" => "root", "nodes" => { "root" => node("root", "base.body", children: ["gone"]) } }
    assert_raises(ArgumentError) do
      Dukafy::Publisher::RenderPage.call(document: missing, registry: registry)
    end

    cyclic = { "rootNodeId" => "root", "nodes" => { "root" => node("root", "base.body", children: ["root"]) } }
    assert_raises(ArgumentError) do
      Dukafy::Publisher::RenderPage.call(document: cyclic, registry: registry)
    end
  end

  def test_resolves_site_class_names_onto_node_roots_and_body
    document = {
      "rootNodeId" => "root",
      "nodes" => {
        "root" => node("root", "base.body", children: ["box"]).merge("classIds" => ["body-class"]),
        "box" => node("box", "base.box").merge("classIds" => %w[flex padding]),
      },
    }
    site = {
      "styleRules" => {
        "body-class" => { "name" => "bg-white" },
        "flex" => { "name" => "flex" },
        "padding" => { "name" => "p-4" },
      },
    }

    result = Dukafy::Publisher::RenderPage.call(document: document, registry: registry, site: site)

    assert_includes result.html, '<section class="flex p-4"'
    assert_equal ["bg-white"], result.body_classes
  end

  # An entry STACK, not a single slot. A loop nested inside another loop must
  # still reach the entity it was iterated from — a variant knowing its
  # product. Before this, `@current_entry` was one slot and `parentEntry`
  # resolved to nothing, so a nested loop could only ever bind its own fields.
  def test_a_nested_loop_can_reach_the_entry_of_the_loop_around_it
    document = {
      "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", children: ["products"]),
        "products" => node("products", "store.relationship-loop", children: ["row"],
                           props: { "relationship" => "products", "perPage" => 10 }),
        "row" => node("row", "base.container", children: %w[product-title variants]),
        "product-title" => bound_text("product-title", "currentEntry", "title"),
        "variants" => node("variants", "store.relationship-loop", children: ["variant-row"],
                           props: { "relationship" => "variants", "perPage" => 10 }),
        "variant-row" => node("variant-row", "base.container", children: %w[variant-title owner]),
        # Inside the variants loop: currentEntry is the VARIANT...
        "variant-title" => bound_text("variant-title", "currentEntry", "title"),
        # ...and parentEntry is the PRODUCT it belongs to.
        "owner" => bound_text("owner", "parentEntry", "title"),
      },
    }
    prefetched = {
      "products" => {
        "bag" => {
          "slug" => "bag", "title" => "Canvas Bag",
          "variants" => [
            { "sku" => "L", "title" => "Large", "position" => 0 },
            { "sku" => "S", "title" => "Small", "position" => 1 },
          ],
        },
      },
    }

    html = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: prefetched
    ).html

    assert_includes html, "<p>Canvas Bag</p>"
    assert_includes html, "<p>Large</p>"
    assert_includes html, "<p>Small</p>"
    # Each variant row names its owning product — proof the stack survives a
    # level of nesting rather than the inner loop clobbering the outer entry.
    assert_equal 3, html.scan("Canvas Bag").length, "expected the product title once + once per variant"
  end

  def test_parent_entry_outside_a_nested_loop_falls_back_to_the_static_value
    document = {
      "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", children: ["loop"]),
        "loop" => node("loop", "store.relationship-loop", children: ["row"],
                       props: { "relationship" => "products", "perPage" => 10 }),
        "row" => node("row", "base.container", children: ["orphan"]),
        # Only one level deep, so there IS no parent entry.
        "orphan" => bound_text("orphan", "parentEntry", "title"),
      },
    }
    prefetched = { "products" => { "bag" => { "slug" => "bag", "title" => "Canvas Bag" } } }

    html = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: prefetched
    ).html

    # Unresolved, so the authored fallback text stands rather than rendering
    # the product by accident.
    assert_includes html, "<p>fallback</p>"
    refute_includes html, "<p>Canvas Bag</p>"
  end

  # ── Loop sources as PATHS ────────────────────────────────────────────
  # `currentEntry.<listField>` is what makes nesting composable: loop a list
  # field and the entity in scope becomes that field's item type, whose own
  # list fields can be looped in turn.

  def catalogue
    {
      "products" => {
        "bag" => {
          "slug" => "bag", "title" => "Canvas Bag",
          "images" => [
            { "url" => "/uploads/a.jpg", "alt" => "Front" },
            { "url" => "/uploads/b.jpg", "alt" => "Side" },
          ],
          "variants" => [{ "sku" => "L", "title" => "Large", "position" => 0 }],
        },
        "mug" => { "slug" => "mug", "title" => "Mug", "images" => [], "variants" => [] },
      },
      "collections" => {
        "featured" => { "slug" => "featured", "title" => "Featured",
                        "products" => [{ "slug" => "bag", "title" => "Canvas Bag" }] },
      },
    }
  end

  def loop_document(source, child_field, inner: nil)
    nodes = {
      "body" => node("body", "base.body", children: ["loop"]),
      "loop" => node("loop", "store.relationship-loop", children: ["row"],
                     props: { "source" => source, "perPage" => 20 }),
      "row" => node("row", "base.container", children: ["field"] + (inner ? ["inner"] : [])),
      "field" => bound_text("field", "currentEntry", child_field),
    }
    if inner
      nodes["inner"] = node("inner", "store.relationship-loop", children: ["inner-row"],
                            props: { "source" => inner.fetch(:source), "perPage" => 20 })
      nodes["inner-row"] = node("inner-row", "base.container", children: %w[inner-field owner])
      nodes["inner-field"] = bound_text("inner-field", "currentEntry", inner.fetch(:field))
      nodes["owner"] = bound_text("owner", "parentEntry", "title")
    end
    { "rootNodeId" => "body", "nodes" => nodes }
  end

  def render_loop(source, child_field, inner: nil)
    Dukafy::Publisher::RenderPage.call(
      document: loop_document(source, child_field, inner: inner),
      registry: Dukafy::Publisher::REGISTRY, prefetched: catalogue
    ).html
  end

  def test_a_bare_products_source_iterates_the_whole_catalogue
    html = render_loop("products", "title")

    assert_includes html, "Canvas Bag"
    assert_includes html, "Mug"
  end

  def test_a_collection_scoped_source_iterates_only_its_products
    html = render_loop("collections/featured.products", "title")

    assert_includes html, "Canvas Bag"
    refute_includes html, "Mug"
  end

  def test_a_named_products_variants_source_iterates_that_products_variants
    html = render_loop("products/bag.variants", "title")

    assert_includes html, "Large"
  end

  # The point of the whole exercise: loop a product's images from inside a
  # product loop, and bind fields of the IMAGE while still reaching the product.
  def test_a_nested_loop_over_a_list_field_yields_that_fields_entity
    html = render_loop("products", "title", inner: { source: "currentEntry.images", field: "alt" })

    assert_includes html, "Front"
    assert_includes html, "Side"
    # parentEntry still reaches the product from inside the images loop:
    # the bag's own title once, plus once per image. (Mug has no images, so
    # it contributes only its own title.)
    assert_equal 3, html.scan("Canvas Bag").length
    assert_includes html, "Mug"
  end

  def test_a_nested_variants_loop_still_works_through_a_path
    html = render_loop("products", "title", inner: { source: "currentEntry.variants", field: "title" })

    assert_includes html, "Large"
  end

  def test_an_unknown_or_empty_source_iterates_nothing_rather_than_erroring
    ["products/nope.variants", "collections/nope.products", "currentEntry.images", "nonsense.path"].each do |source|
      html = render_loop(source, "title")
      refute_includes html, "Canvas Bag", "#{source} should have yielded no items"
    end
  end

  # Documents authored before `source` existed carry relationship + sourceSlug.
  def test_legacy_relationship_props_still_resolve
    document = {
      "rootNodeId" => "body",
      "nodes" => {
        "body" => node("body", "base.body", children: ["loop"]),
        "loop" => node("loop", "store.relationship-loop", children: ["row"],
                       props: { "relationship" => "products", "sourceSlug" => "featured", "perPage" => 20 }),
        "row" => node("row", "base.container", children: ["field"]),
        "field" => bound_text("field", "currentEntry", "title"),
      },
    }

    html = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: catalogue
    ).html

    assert_includes html, "Canvas Bag"
    refute_includes html, "Mug"
  end

  # ── cart.addItem — add-to-cart on any node ───────────────────────────
  # Replaces `store.buy-button`, whose fixed <form>/<button>/<output> markup
  # was the last hardcoded commerce control.

  def add_button(action)
    node("btn", "base.button", props: { "label" => "Add to cart", "href" => "" })
      .merge("actions" => { "click" => action })
  end

  def render_add(action, product: nil)
    nodes = { "body" => node("body", "base.body", children: ["btn"]), "btn" => add_button(action) }
    document = { "rootNodeId" => "body", "nodes" => nodes }
    if product
      # Inside a products loop, so a product is in scope.
      nodes["body"] = node("body", "base.body", children: ["loop"])
      nodes["loop"] = node("loop", "store.relationship-loop", children: ["btn"],
                           props: { "source" => "products", "perPage" => 5 })
    end
    Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY,
      prefetched: product ? { "products" => { "bag" => product } } : {}
    ).html
  end

  def test_add_to_cart_resolves_the_product_in_scope
    html = render_add({ "type" => "cart.addItem", "quantity" => 2 },
                      product: { "slug" => "bag", "title" => "Canvas Bag" })

    assert_includes html, 'hx-post="/fragments/cart/items"'
    assert_includes html, "product_slug&quot;:&quot;bag"
    assert_includes html, "quantity&quot;:&quot;2"
    # The surrounding form is submitted too, so a merchant's own
    # `<select name="variant_sku">` is honoured.
    assert_includes html, 'hx-include="closest form"'
    # Still an ordinary button — no Dukafy markup.
    assert_includes html, "<button"
    assert_includes html, "Add to cart"
  end

  def test_add_to_cart_accepts_an_explicit_product_and_variant
    html = render_add({ "type" => "cart.addItem", "productSlug" => "mug", "variantSku" => "MUG-S" })

    assert_includes html, "product_slug&quot;:&quot;mug"
    assert_includes html, "variant_sku&quot;:&quot;MUG-S"
  end

  def test_add_to_cart_defaults_to_one_and_ignores_a_nonsense_quantity
    html = render_add({ "type" => "cart.addItem", "productSlug" => "mug", "quantity" => 0 })
    assert_includes html, "quantity&quot;:&quot;1"

    html = render_add({ "type" => "cart.addItem", "productSlug" => "mug", "quantity" => "abc" })
    assert_includes html, "quantity&quot;:&quot;1"
  end

  def test_add_to_cart_with_no_product_in_scope_renders_inert
    html = render_add({ "type" => "cart.addItem" })

    # A button that posts an add for nothing is worse than one that does
    # nothing visibly — it would 404 on click.
    assert_includes html, "Add to cart"
    refute_includes html, "/fragments/cart/items"
  end

  # A loop inside a <select> must not emit a wrapping <div>: browsers hoist or
  # drop it and the options stop working. This is what makes
  # `store.variant-picker` replaceable by the merchant's own markup.
  def test_a_wrapper_less_loop_emits_valid_markup_inside_a_select
    document = {
      "rootNodeId" => "sel",
      "nodes" => {
        "sel" => node("sel", "base.select", children: ["loop"], props: { "fieldId" => "variant_sku" }),
        "loop" => node("loop", "store.relationship-loop", children: ["opt"],
                       props: { "source" => "currentEntry.variants", "perPage" => 20, "wrapper" => "none" }),
        "opt" => node("opt", "base.option", props: { "value" => "", "label" => "x" })
          .merge("dynamicBindings" => {
            "value" => { "source" => "currentEntry", "field" => "sku" },
            "label" => { "source" => "currentEntry", "field" => "title" },
          }),
      },
    }
    entry = { "slug" => "bag", "variants" => [
      { "sku" => "BAG-L", "title" => "Large" }, { "sku" => "BAG-S", "title" => "Small" },
    ] }

    html = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}, current_entry: entry
    ).html

    refute_includes html, "<div", "a wrapper inside <select> is invalid markup"
    assert_includes html, %(<option value="BAG-L">Large</option>)
    assert_includes html, %(<option value="BAG-S">Small</option>)
    assert_includes html, %(name="variant_sku")
  end

  def test_a_loop_still_wraps_and_paginates_by_default
    document = {
      "rootNodeId" => "loop",
      "nodes" => {
        "loop" => node("loop", "store.relationship-loop", children: ["opt"],
                       props: { "source" => "currentEntry.variants", "perPage" => 1 }),
        "opt" => node("opt", "base.text", props: { "text" => "x", "tag" => "span" }),
      },
    }
    entry = { "variants" => [{ "sku" => "A" }, { "sku" => "B" }] }

    html = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}, current_entry: entry
    ).html

    assert_includes html, %(class="dukafy-collection-loop")
    # Two variants at one per page — the wrapper is what pagination hangs off.
    assert_includes html, "dukafy-collection-loop__pagination"
  end

  # Inline `{source.field}` tokens must resolve for EVERY source a structured
  # binding resolves. Only `currentEntry` did, so `{cart.subtotalDisplay}`
  # rendered as literal text — on the canvas and on the published page.
  def token_document(text)
    {
      "rootNodeId" => "b",
      "nodes" => {
        "b" => node("b", "base.body", children: ["t"]),
        "t" => node("t", "base.text", props: { "text" => text, "tag" => "p" }),
      },
    }
  end

  def render_token(text, cart: nil, entry: nil)
    Dukafy::Publisher::RenderPage.call(
      document: token_document(text), registry: Dukafy::Publisher::REGISTRY,
      prefetched: {}, cart: cart, current_entry: entry
    ).html
  end

  def test_cart_tokens_resolve_like_cart_bindings
    cart = { "items" => [], "cart" => { "subtotalDisplay" => "$279.00", "count" => 2 } }

    assert_includes render_token("Total {cart.subtotalDisplay}", cart: cart), "<p>Total $279.00</p>"
    assert_includes render_token("{cart.count} items", cart: cart), "<p>2 items</p>"
  end

  def test_current_and_parent_entry_tokens_still_resolve
    assert_includes render_token("Buy {currentEntry.title}", entry: { "title" => "Bag" }),
                    "<p>Buy Bag</p>"
  end

  def test_a_token_with_no_frame_in_scope_uses_its_fallback
    assert_includes render_token("Total {cart.subtotalDisplay|nothing yet}"), "<p>Total nothing yet</p>"
    # No fallback given — resolves to empty rather than printing the token.
    assert_includes render_token("Total {cart.subtotalDisplay}"), "<p>Total </p>"
  end

  def test_tokens_for_sources_with_no_server_frame_are_left_verbatim
    # `page`/`site`/`route` have no server-side frames. Leaving them intact
    # says "unresolved"; blanking them would look like empty content.
    html = render_token("Site {site.name} here")
    assert_includes html, "{site.name}"
  end

  # A cart-wide value has nowhere to live: inside the cart loop it repeats once
  # per line, and outside it there is no cart at bake time. The cart REGION is
  # that somewhere — a node the browser re-fetches per visitor.
  def region_document
    {
      "rootNodeId" => "b",
      "nodes" => {
        "b" => node("b", "base.body", children: ["r"]),
        "r" => node("r", "base.container", children: ["t"])
                 .merge("actions" => { "region" => "cart" }),
        "t" => node("t", "base.text", props: { "text" => "Items: {cart.count}", "tag" => "p" }),
      },
    }
  end

  def render_region(cart: nil)
    Dukafy::Publisher::RenderPage.call(
      document: region_document, registry: Dukafy::Publisher::REGISTRY,
      prefetched: {}, cart: cart
    )
  end

  def test_a_cart_region_bakes_as_an_empty_self_fetching_shell
    html = render_region.html

    assert_includes html, 'hx-get="/fragments/cart/region?node=r"'
    assert_includes html, 'hx-trigger="revealed, dukafy:cart-updated from:body, dukafy:cart-line-updated from:body"'
    # The subtree is NOT baked: every value in it would be a guess about a
    # visitor the baker has never met.
    refute_includes html, "Items:"
  end

  def test_a_cart_region_renders_its_subtree_when_a_cart_is_in_scope
    html = render_region(cart: { "items" => [], "cart" => { "count" => 4 } }).html

    assert_includes html, "<p>Items: 4</p>"
  end

  # The swap replaces the placeholder outerHTML, so if the fragment's own
  # output dropped the wiring the region would render once and then silently
  # stop tracking the cart.
  def test_a_rendered_cart_region_keeps_its_own_refresh_wiring
    html = render_region(cart: { "items" => [], "cart" => { "count" => 4 } }).html

    assert_includes html, 'hx-get="/fragments/cart/region?node=r"'
    assert_includes html, "dukafy:cart-updated from:body"
  end

  # A rendered region MUST NOT carry `revealed`. htmx guards that trigger with
  # a `data-hx-revealed` attribute on the element, and an outerHTML swap
  # replaces the element with fresh markup that has no such attribute — the
  # guard resets, the new element is already in view, and it fires again
  # immediately. That is an infinite request loop, not a refresh.
  def test_a_rendered_cart_region_does_not_retrigger_itself_on_reveal
    html = render_region(cart: { "items" => [], "cart" => { "count" => 4 } }).html

    refute_includes html, "revealed"
  end

  # The placeholder is the one element that DOES need it: it swaps itself away
  # the first time it fires, so the trigger cannot recur.
  def test_the_baked_placeholder_still_loads_itself_on_reveal
    assert_includes render_region.html, 'hx-trigger="revealed, dukafy:cart-updated from:body, dukafy:cart-line-updated from:body"'
  end

  # `visibleWhen` — whether a node renders at all. The third overlay, next to
  # `dynamicBindings` (where data comes from) and `actions` (what it does).
  def conditional_document(condition, text: "SHOWN")
    {
      "rootNodeId" => "b",
      "nodes" => {
        "b" => node("b", "base.body", children: ["c"]),
        "c" => node("c", "base.text", props: { "text" => text, "tag" => "p" })
                 .merge("visibleWhen" => condition),
      },
    }
  end

  def render_condition(condition, cart: nil, entry: nil)
    Dukafy::Publisher::RenderPage.call(
      document: conditional_document(condition), registry: Dukafy::Publisher::REGISTRY,
      prefetched: {}, cart: cart, current_entry: entry
    ).html
  end

  def cond(source, field, operator, value = nil)
    base = { "source" => source, "field" => field, "operator" => operator }
    value.nil? ? base : base.merge("value" => value)
  end

  def test_a_condition_hides_or_shows_the_node
    entry = { "inCart" => true, "cartQuantity" => 3 }

    assert_includes render_condition(cond("currentEntry", "inCart", "isTrue"), entry: entry), "SHOWN"
    refute_includes render_condition(cond("currentEntry", "inCart", "isFalse"), entry: entry), "SHOWN"
  end

  # Zero and empty must read as "no", or `cartQuantity` cannot be conditioned
  # on directly and `inCart` misbehaves before any cart exists.
  def test_zero_empty_and_missing_all_count_as_false
    [{ "inCart" => 0 }, { "inCart" => "" }, { "inCart" => false }, {}].each do |entry|
      refute_includes render_condition(cond("currentEntry", "inCart", "isTrue"), entry: entry), "SHOWN"
      assert_includes render_condition(cond("currentEntry", "inCart", "isFalse"), entry: entry), "SHOWN"
    end
  end

  # A baked page has no cart, so the "not in cart" branch is what ships — the
  # correct default for a visitor who has added nothing.
  def test_with_no_cart_in_scope_the_not_in_cart_branch_renders
    assert_includes render_condition(cond("currentEntry", "inCart", "isFalse")), "SHOWN"
    refute_includes render_condition(cond("currentEntry", "inCart", "isTrue")), "SHOWN"
  end

  def test_comparison_operators
    entry = { "cartQuantity" => 3, "title" => "Bag" }

    assert_includes render_condition(cond("currentEntry", "cartQuantity", "greaterThan", "2"), entry: entry), "SHOWN"
    refute_includes render_condition(cond("currentEntry", "cartQuantity", "greaterThan", "5"), entry: entry), "SHOWN"
    assert_includes render_condition(cond("currentEntry", "cartQuantity", "lessThan", "5"), entry: entry), "SHOWN"
    assert_includes render_condition(cond("currentEntry", "title", "equals", "Bag"), entry: entry), "SHOWN"
    refute_includes render_condition(cond("currentEntry", "title", "notEquals", "Bag"), entry: entry), "SHOWN"
  end

  def test_cart_level_conditions_read_the_cart_frame
    cart = { "items" => [], "cart" => { "count" => 2 } }

    assert_includes render_condition(cond("cart", "count", "isTrue"), cart: cart), "SHOWN"
    refute_includes render_condition(cond("cart", "count", "isTrue")), "SHOWN"
  end

  # Hiding content because we failed to understand the rule is the worse
  # failure: it looks like the node was deleted, with nothing to debug.
  def test_a_malformed_condition_leaves_the_node_visible
    assert_includes render_condition(cond("currentEntry", "inCart", "sortOf"), entry: { "inCart" => false }), "SHOWN"
    assert_includes render_condition({ "nonsense" => true }), "SHOWN"
  end

  def test_a_hidden_node_renders_nothing_at_all_including_its_children
    document = {
      "rootNodeId" => "b",
      "nodes" => {
        "b" => node("b", "base.body", children: ["wrap"]),
        "wrap" => node("wrap", "base.container", children: ["kid"])
                    .merge("visibleWhen" => cond("currentEntry", "inCart", "isTrue")),
        "kid" => node("kid", "base.text", props: { "text" => "CHILD", "tag" => "p" }),
      },
    }

    html = Dukafy::Publisher::RenderPage.call(
      document: document, registry: Dukafy::Publisher::REGISTRY, prefetched: {}
    ).html

    # No empty wrapper left behind, and the child never rendered.
    assert_equal "", html
  end

  # Quantity controls on a PRODUCT card. `currentEntry` there is a product —
  # it has variants, not a sku — so the line verbs used to render as plain,
  # dead <button>s. `with_cart_facts` now resolves the cart line's sku, and
  # outside a cart list the verb swaps nothing and lets the region refresh.
  def stepper_document
    cond = ->(op) { { "source" => "currentEntry", "field" => "inCart", "operator" => op } }
    {
      "rootNodeId" => "b",
      "nodes" => {
        "b" => node("b", "base.body", children: ["state"]),
        "state" => node("state", "base.container", children: %w[add minus])
                     .merge("actions" => { "region" => "cart" }),
        "add" => node("add", "base.button", props: { "label" => "Add" })
                   .merge("visibleWhen" => cond.call("isFalse"),
                          "actions" => { "click" => { "type" => "cart.addItem", "quantity" => 1 } }),
        "minus" => node("minus", "base.button", props: { "label" => "-" })
                     .merge("visibleWhen" => cond.call("isTrue"),
                            "actions" => { "click" => { "type" => "cart.setQuantity", "delta" => -1 } }),
      },
    }
  end

  def render_stepper(cart)
    Dukafy::Publisher::RenderPage.call(
      document: stepper_document, registry: Dukafy::Publisher::REGISTRY,
      prefetched: { "products" => { "suit" => { "slug" => "suit" } } },
      cart: cart, current_entry: { "slug" => "suit" }
    ).html
  end

  def test_a_quantity_verb_on_a_product_card_resolves_the_cart_line
    html = render_stepper(
      "items" => [{ "productSlug" => "suit", "sku" => "main", "quantity" => 2 }],
      "cart" => { "count" => 2 },
    )

    assert_includes html, 'hx-post="/fragments/cart/items/update"'
    assert_includes html, "variant_sku&quot;:&quot;main"
    # No row to replace outside a cart list — the region refreshes on the event.
    assert_includes html, 'hx-swap="none"'
    refute_includes html, "data-dukafy-cart-line"
  end

  def test_a_quantity_verb_with_nothing_in_the_cart_stays_inert
    html = render_stepper("items" => [], "cart" => { "count" => 0 })

    # The "add" branch shows instead, and it IS wired.
    assert_includes html, 'hx-post="/fragments/cart/items"'
    refute_includes html, "/fragments/cart/items/update"
  end

  def test_a_cart_region_requests_the_htmx_runtime_on_both_paths
    assert_includes render_region.runtimes, :htmx
    assert_includes render_region(cart: { "items" => [], "cart" => {} }).runtimes, :htmx
  end
end
