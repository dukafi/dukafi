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
end
