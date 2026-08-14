require_relative "../spec_helper"

class StoreModulesSpec < Minitest::Test
  def test_product_card_matches_golden_output_and_uses_prefetched_catalog_data
    document = {
      "rootNodeId" => "card",
      "nodes" => {
        "card" => {
          "id" => "card", "moduleId" => "store.product-card", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => {
            "productSlug" => "canvas-bag", "title" => "Fallback", "priceCents" => 1,
          },
        },
      },
    }
    prefetched = {
      "products" => {
        "canvas-bag" => {
          "title" => "Canvas & Bag", "href" => "/products/canvas-bag",
          "imageUrl" => "/uploads/bag.jpg", "priceCents" => 12_900, "currency" => "USD",
        },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(
      document:, registry: Dukafi::Publisher::REGISTRY, prefetched:
    )

    assert_equal File.read(File.expand_path("../golden/product_card.html", __dir__)).chomp, result.html
    assert_includes result.css, ".dukafy-product-card{"
  end

  def test_price_resolves_the_selected_variant_and_formats_currency
    document = {
      "rootNodeId" => "price",
      "nodes" => {
        "price" => {
          "id" => "price", "moduleId" => "store.price", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => {
            "productSlug" => "canvas-bag", "variantSku" => "BAG-L", "priceCents" => 1, "currency" => "USD",
          },
        },
      },
    }
    prefetched = {
      "products" => {
        "canvas-bag" => {
          "variants" => [
            { "sku" => "BAG-S", "priceCents" => 10_000, "currency" => "USD", "position" => 0 },
            { "sku" => "BAG-L", "priceCents" => 13_950, "currency" => "USD", "position" => 1 },
          ],
        },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal '<span class="dukafy-price" data-product="canvas-bag" data-variant="BAG-L">$139.50</span>', result.html
    assert_equal "", result.css
  end

  def test_price_uses_fallback_without_a_catalog_product
    definition = Dukafi::Publisher::REGISTRY.fetch("store.price")
    output = definition.render(
      { "productSlug" => "", "variantSku" => "", "priceCents" => 2_599, "currency" => "EUR" },
      [], prefetched: {}
    )

    assert_equal '<span class="dukafy-price" data-product="">EUR 25.99</span>', output.fetch(:html)
  end

  def test_image_gallery_matches_golden_output_and_uses_prefetched_images
    document = {
      "rootNodeId" => "gallery",
      "nodes" => {
        "gallery" => {
          "id" => "gallery", "moduleId" => "store.image-gallery", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => {
            "productSlug" => "canvas-bag", "images" => "/fallback.jpg", "alt" => "Fallback",
          },
        },
      },
    }
    prefetched = {
      "products" => {
        "canvas-bag" => {
          "images" => [
            { "url" => "/uploads/bag-front.jpg", "alt" => "Canvas bag, front" },
            { "url" => "/uploads/bag-side.jpg", "alt" => "Canvas bag, side & strap" },
          ],
        },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal File.read(File.expand_path("../golden/image_gallery.html", __dir__)).chomp, result.html
    assert_includes result.css, ".dukafy-image-gallery{"
  end

  def test_image_gallery_uses_safe_authored_fallbacks
    definition = Dukafi::Publisher::REGISTRY.fetch("store.image-gallery")
    output = definition.render(
      { "productSlug" => "", "images" => "javascript:alert(1)\n/uploads/detail.jpg", "alt" => 'Detail "view"' },
      [], prefetched: {}
    )

    refute_includes output.fetch(:html), "javascript:"
    assert_includes output.fetch(:html), 'src="/uploads/detail.jpg" alt="Detail &quot;view&quot;"'
  end

  def test_variant_picker_matches_golden_output_in_catalog_order
    document = {
      "rootNodeId" => "picker",
      "nodes" => {
        "picker" => {
          "id" => "picker", "moduleId" => "store.variant-picker", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => {
            "productSlug" => "canvas-bag", "label" => "Bag size", "name" => "variant_sku", "selectedSku" => "BAG-L",
          },
        },
      },
    }
    prefetched = {
      "products" => {
        "canvas-bag" => {
          "variants" => [
            { "sku" => "BAG-L", "title" => "Large", "priceCents" => 13_950, "currency" => "USD", "stock" => 4, "position" => 1 },
            { "sku" => "BAG-S", "title" => "Small & light", "priceCents" => 10_000, "currency" => "USD", "stock" => 0, "position" => 0 },
          ],
        },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal File.read(File.expand_path("../golden/variant_picker.html", __dir__)).chomp, result.html
    assert_includes result.css, ".dukafy-variant-picker{"
  end

  def test_variant_picker_disables_an_empty_catalog_and_sanitizes_field_name
    definition = Dukafi::Publisher::REGISTRY.fetch("store.variant-picker")
    output = definition.render(
      { "productSlug" => "missing", "label" => '<Choose "one">', "name" => 'bad" onclick="x', "selectedSku" => "" },
      [], prefetched: {}
    )

    assert_includes output.fetch(:html), 'name="variant" disabled'
    assert_includes output.fetch(:html), '&lt;Choose &quot;one&quot;&gt;'
  end

  def test_buy_button_matches_golden_output_for_an_in_stock_variant
    definition = Dukafi::Publisher::REGISTRY.fetch("store.buy-button")
    output = definition.render(
      { "productSlug" => "canvas-bag", "variantSku" => "BAG-L", "label" => "Add bag", "quantity" => 2 }, [],
      prefetched: { "products" => { "canvas-bag" => { "variants" => [
        { "sku" => "BAG-L", "stock" => 3, "position" => 0 },
      ] } } }
    )

    assert_equal File.read(File.expand_path("../golden/buy_button.html", __dir__)).chomp, output.fetch(:html)
    assert_includes output.fetch(:css), ".dukafy-buy-button{"
  end

  def test_buy_button_disables_when_the_variant_is_unavailable
    definition = Dukafi::Publisher::REGISTRY.fetch("store.buy-button")
    output = definition.render(
      { "productSlug" => "canvas-bag", "variantSku" => "BAG-S", "label" => "Add", "quantity" => 1 }, [],
      prefetched: { "products" => { "canvas-bag" => { "variants" => [
        { "sku" => "BAG-S", "stock" => 0, "position" => 0 },
      ] } } }
    )

    assert_includes output.fetch(:html), '<button class="dukafy-buy-button" type="submit" disabled>Sold out</button>'
  end

  def test_collection_loop_matches_golden_output_and_round_robins_children
    document = {
      "rootNodeId" => "featured-loop",
      "nodes" => {
        "featured-loop" => {
          "id" => "featured-loop", "moduleId" => "store.collection-loop",
          "children" => %w[card price], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "collectionSlug" => "featured", "perPage" => 2 },
        },
        "card" => {
          "id" => "card", "moduleId" => "store.product-card", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "productSlug" => "" },
        },
        "price" => {
          "id" => "price", "moduleId" => "store.price", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "productSlug" => "" },
        },
      },
    }
    prefetched = {
      "collections" => {
        "featured" => { "products" => [
          { "slug" => "first", "title" => "First", "href" => "/products/first", "imageUrl" => "", "priceCents" => 1_000, "currency" => "USD", "variants" => [] },
          { "slug" => "second", "title" => "Second", "href" => "/products/second", "imageUrl" => "", "priceCents" => 2_000, "currency" => "USD", "variants" => [] },
          { "slug" => "third", "title" => "Third", "href" => "/products/third", "imageUrl" => "", "priceCents" => 3_000, "currency" => "USD", "variants" => [] },
        ] },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal File.read(File.expand_path("../golden/collection_loop.html", __dir__)).chomp, result.html
    assert_includes result.css, ".dukafy-collection-loop{"

    second_page = Dukafi::Publisher::RenderPage.call(
      document:, registry: Dukafi::Publisher::REGISTRY, prefetched:,
      query_params: { "loop_featured-loop_page" => "2" }
    )
    assert_includes second_page.html, 'href="/products/third"'
    assert_includes second_page.html, 'Page 2 of 2'
  end

  # store.collection-loop is a deprecated alias — the test above already
  # proves it still renders through the generalized render_relationship_loop
  # path byte-for-byte. The tests below prove the new store.relationship-loop
  # id: a plain composable child row (no product-card) repeating per item,
  # and iterating a product's variants instead of a collection's products.
  def test_relationship_loop_matches_golden_output_with_a_composable_child_row
    document = {
      "rootNodeId" => "featured-loop",
      "nodes" => {
        "featured-loop" => {
          "id" => "featured-loop", "moduleId" => "store.relationship-loop",
          "children" => %w[row], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "relationship" => "products", "sourceSlug" => "featured", "perPage" => 2 },
        },
        "row" => {
          "id" => "row", "moduleId" => "base.container", "children" => %w[row-image row-title row-price],
          "classIds" => [], "breakpointOverrides" => {}, "props" => {},
        },
        "row-image" => {
          "id" => "row-image", "moduleId" => "base.image", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => {},
          "dynamicBindings" => { "src" => { "source" => "currentEntry", "field" => "imageUrl", "format" => "media", "fallback" => "empty" } },
        },
        "row-title" => {
          "id" => "row-title", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "h3", "text" => "Product title" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } },
        },
        "row-price" => {
          "id" => "row-price", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "span", "text" => "$0.00" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "priceDisplay", "format" => "plain", "fallback" => "static" } },
        },
      },
    }
    prefetched = {
      "collections" => {
        "featured" => { "products" => [
          { "slug" => "first", "title" => "First", "imageUrl" => "/uploads/first.jpg", "priceDisplay" => "$10.00" },
          { "slug" => "second", "title" => "Second", "imageUrl" => "/uploads/second.jpg", "priceDisplay" => "$20.00" },
          { "slug" => "third", "title" => "Third", "imageUrl" => "/uploads/third.jpg", "priceDisplay" => "$30.00" },
        ] },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal File.read(File.expand_path("../golden/relationship_loop_products.html", __dir__)).chomp, result.html
    assert_includes result.css, ".dukafy-collection-loop{"
  end

  def test_relationship_loop_iterates_a_products_variants
    document = {
      "rootNodeId" => "variant-loop",
      "nodes" => {
        "variant-loop" => {
          "id" => "variant-loop", "moduleId" => "store.relationship-loop",
          "children" => %w[row], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "relationship" => "variants", "sourceSlug" => "canvas-bag", "perPage" => 5 },
        },
        "row" => {
          "id" => "row", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "span", "text" => "" },
          "dynamicBindings" => {
            "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" },
          },
        },
      },
    }
    prefetched = {
      "products" => {
        "canvas-bag" => {
          "variants" => [
            { "sku" => "BAG-S", "title" => "Small", "priceDisplay" => "$100.00" },
            { "sku" => "BAG-L", "title" => "Large", "priceDisplay" => "$139.50" },
          ],
        },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal(
      '<div class="dukafy-collection-loop" data-collection="canvas-bag" data-page="1"><span>Small</span><span>Large</span></div>',
      result.html,
    )
  end

  def test_relationship_loop_orders_by_price_and_direction
    document = {
      "rootNodeId" => "featured-loop",
      "nodes" => {
        "featured-loop" => {
          "id" => "featured-loop", "moduleId" => "store.relationship-loop",
          "children" => %w[row], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "relationship" => "products", "sourceSlug" => "featured", "perPage" => 10, "orderBy" => "price", "direction" => "desc" },
        },
        "row" => {
          "id" => "row", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "span", "text" => "" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } },
        },
      },
    }
    prefetched = {
      "collections" => {
        "featured" => { "products" => [
          { "slug" => "first", "title" => "First", "priceCents" => 1_000 },
          { "slug" => "second", "title" => "Second", "priceCents" => 3_000 },
          { "slug" => "third", "title" => "Third", "priceCents" => 2_000 },
        ] },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal(
      '<div class="dukafy-collection-loop" data-collection="featured" data-page="1"><span>Second</span><span>Third</span><span>First</span></div>',
      result.html,
    )
  end

  def test_relationship_loop_orders_by_title_ascending_by_default
    document = {
      "rootNodeId" => "featured-loop",
      "nodes" => {
        "featured-loop" => {
          "id" => "featured-loop", "moduleId" => "store.relationship-loop",
          "children" => %w[row], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "relationship" => "products", "sourceSlug" => "featured", "perPage" => 10, "orderBy" => "title" },
        },
        "row" => {
          "id" => "row", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "span", "text" => "" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } },
        },
      },
    }
    prefetched = {
      "collections" => {
        "featured" => { "products" => [
          { "slug" => "z", "title" => "Zeta" },
          { "slug" => "a", "title" => "Alpha" },
          { "slug" => "m", "title" => "Mid" },
        ] },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal(
      '<div class="dukafy-collection-loop" data-collection="featured" data-page="1"><span>Alpha</span><span>Mid</span><span>Zeta</span></div>',
      result.html,
    )
  end

  def test_relationship_loop_offset_skips_leading_items_after_ordering
    document = {
      "rootNodeId" => "featured-loop",
      "nodes" => {
        "featured-loop" => {
          "id" => "featured-loop", "moduleId" => "store.relationship-loop",
          "children" => %w[row], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "relationship" => "products", "sourceSlug" => "featured", "perPage" => 10, "orderBy" => "price", "offset" => 1 },
        },
        "row" => {
          "id" => "row", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "span", "text" => "" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } },
        },
      },
    }
    prefetched = {
      "collections" => {
        "featured" => { "products" => [
          { "slug" => "first", "title" => "First", "priceCents" => 1_000 },
          { "slug" => "second", "title" => "Second", "priceCents" => 3_000 },
          { "slug" => "third", "title" => "Third", "priceCents" => 2_000 },
        ] },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal(
      '<div class="dukafy-collection-loop" data-collection="featured" data-page="1"><span>Third</span><span>Second</span></div>',
      result.html,
    )
  end

  def test_relationship_loop_orderby_manual_or_absent_keeps_stored_order_unchanged
    document = {
      "rootNodeId" => "featured-loop",
      "nodes" => {
        "featured-loop" => {
          "id" => "featured-loop", "moduleId" => "store.relationship-loop",
          "children" => %w[row], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "relationship" => "products", "sourceSlug" => "featured", "perPage" => 10, "orderBy" => "manual" },
        },
        "row" => {
          "id" => "row", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "span", "text" => "" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } },
        },
      },
    }
    prefetched = {
      "collections" => {
        "featured" => { "products" => [
          { "slug" => "z", "title" => "Zeta" },
          { "slug" => "a", "title" => "Alpha" },
        ] },
      },
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal(
      '<div class="dukafy-collection-loop" data-collection="featured" data-page="1"><span>Zeta</span><span>Alpha</span></div>',
      result.html,
    )
  end

  def test_relationship_loop_with_no_slug_pulls_from_every_product_across_every_collection
    document = {
      "rootNodeId" => "any-loop",
      "nodes" => {
        "any-loop" => {
          "id" => "any-loop", "moduleId" => "store.relationship-loop",
          "children" => %w[row], "classIds" => [], "breakpointOverrides" => {},
          "props" => { "relationship" => "products", "sourceSlug" => "", "perPage" => 10 },
        },
        "row" => {
          "id" => "row", "moduleId" => "base.text", "children" => [], "classIds" => [],
          "breakpointOverrides" => {}, "props" => { "tag" => "span", "text" => "" },
          "dynamicBindings" => { "text" => { "source" => "currentEntry", "field" => "title", "format" => "plain", "fallback" => "static" } },
        },
      },
    }
    prefetched = {
      "products" => {
        "bag" => { "slug" => "bag", "title" => "Bag" },
        "hat" => { "slug" => "hat", "title" => "Hat" },
      },
      "collections" => {},
    }

    result = Dukafi::Publisher::RenderPage.call(document:, registry: Dukafi::Publisher::REGISTRY, prefetched:)

    assert_equal(
      '<div class="dukafy-collection-loop" data-collection="" data-page="1"><span>Bag</span><span>Hat</span></div>',
      result.html,
    )
  end

  def test_stock_badge_always_renders_a_fragment_placeholder
    definition = Dukafi::Publisher::REGISTRY.fetch("store.stock-badge")
    output = definition.render(
      { "productSlug" => "canvas-bag", "variantSku" => "BAG-L", "lowStockThreshold" => 4 },
      [], prefetched: { "products" => {} }
    )

    assert_equal :fragment, Dukafi::Publisher::DYNAMIC_MAP.fetch("store.stock-badge")
    assert_equal File.read(File.expand_path("../golden/stock_badge.html", __dir__)).chomp, output.fetch(:html)
    assert_includes output.fetch(:css), ".dukafy-stock-badge{"
    refute_includes output.fetch(:html), "data-stock="
  end


end
