require_relative "../spec_helper"

class DependencyTrackerSpec < Minitest::Test
  def test_collects_explicit_products_and_collection_members_without_duplicates
    document = {
      "nodes" => {
        "card" => { "moduleId" => "store.product-card", "props" => { "productSlug" => "bag" } },
        "price" => { "moduleId" => "store.price", "props" => { "productSlug" => "bag" } },
        "loop" => { "moduleId" => "store.collection-loop", "props" => { "collectionSlug" => "featured" } },
        "missing" => { "moduleId" => "store.buy-button", "props" => { "productSlug" => "missing" } },
      },
    }
    prefetched = {
      "products" => { "bag" => { "id" => 7 } },
      "collections" => { "featured" => { "products" => [{ "id" => 7 }, { "id" => 9 }] } },
    }

    assert_equal [7, 9], DependencyTracker.product_ids(document:, prefetched:)
  end
end
