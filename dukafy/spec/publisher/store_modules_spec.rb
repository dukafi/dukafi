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
end
