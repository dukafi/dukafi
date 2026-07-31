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

    result = Dukafy::Publisher::RenderPage.call(
      document:, registry: Dukafy::Publisher::REGISTRY, prefetched:
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

    result = Dukafy::Publisher::RenderPage.call(document:, registry: Dukafy::Publisher::REGISTRY, prefetched:)

    assert_equal '<span class="dukafy-price" data-product="canvas-bag" data-variant="BAG-L">$139.50</span>', result.html
    assert_equal "", result.css
  end

  def test_price_uses_fallback_without_a_catalog_product
    definition = Dukafy::Publisher::REGISTRY.fetch("store.price")
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

    result = Dukafy::Publisher::RenderPage.call(document:, registry: Dukafy::Publisher::REGISTRY, prefetched:)

    assert_equal File.read(File.expand_path("../golden/image_gallery.html", __dir__)).chomp, result.html
    assert_includes result.css, ".dukafy-image-gallery{"
  end

  def test_image_gallery_uses_safe_authored_fallbacks
    definition = Dukafy::Publisher::REGISTRY.fetch("store.image-gallery")
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

    result = Dukafy::Publisher::RenderPage.call(document:, registry: Dukafy::Publisher::REGISTRY, prefetched:)

    assert_equal File.read(File.expand_path("../golden/variant_picker.html", __dir__)).chomp, result.html
    assert_includes result.css, ".dukafy-variant-picker{"
  end

  def test_variant_picker_disables_an_empty_catalog_and_sanitizes_field_name
    definition = Dukafy::Publisher::REGISTRY.fetch("store.variant-picker")
    output = definition.render(
      { "productSlug" => "missing", "label" => '<Choose "one">', "name" => 'bad" onclick="x', "selectedSku" => "" },
      [], prefetched: {}
    )

    assert_includes output.fetch(:html), 'name="variant" disabled'
    assert_includes output.fetch(:html), '&lt;Choose &quot;one&quot;&gt;'
  end
end
