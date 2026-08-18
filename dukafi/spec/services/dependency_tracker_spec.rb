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

  def test_relationship_loop_tracks_a_pinned_collections_products
    document = {
      "nodes" => {
        "loop" => {
          "moduleId" => "store.relationship-loop",
          "props" => { "relationship" => "products", "sourceSlug" => "featured" },
        },
      },
    }
    prefetched = { "collections" => { "featured" => { "products" => [{ "id" => 3 }, { "id" => 4 }] } } }

    assert_equal [3, 4], DependencyTracker.product_ids(document:, prefetched:)
  end

  def test_relationship_loop_tracks_a_pinned_products_variants
    document = {
      "nodes" => {
        "loop" => {
          "moduleId" => "store.relationship-loop",
          "props" => { "relationship" => "variants", "sourceSlug" => "bag" },
        },
      },
    }
    prefetched = { "products" => { "bag" => { "id" => 11 } } }

    assert_equal [11], DependencyTracker.product_ids(document:, prefetched:)
  end

  def test_relationship_loop_tracks_the_current_products_variants_when_unpinned
    document = {
      "nodes" => {
        "loop" => { "moduleId" => "store.relationship-loop", "props" => { "relationship" => "variants" } },
      },
    }

    assert_equal [11], DependencyTracker.product_ids(document:, prefetched: {}, current_entry: { "id" => 11, "variants" => [] })
  end

  def test_relationship_loop_with_no_collection_and_no_entry_tracks_every_product
    document = {
      "nodes" => {
        "loop" => { "moduleId" => "store.relationship-loop", "props" => { "relationship" => "products" } },
      },
    }
    prefetched = { "products" => { "bag" => { "id" => 3 }, "hat" => { "id" => 5 } } }

    assert_equal [3, 5], DependencyTracker.product_ids(document:, prefetched:)
  end

  def test_a_data_table_loop_does_not_collect_product_ids
    document = {
      "nodes" => {
        "loop" => {
          "moduleId" => "store.relationship-loop",
          "props" => { "source" => "data/team" },
        },
      },
    }
    prefetched = { "products" => { "bag" => { "id" => 3 } } }

    assert_equal [], DependencyTracker.product_ids(document:, prefetched:)
  end

  def test_a_collection_template_loop_tracks_only_that_collections_products
    document = {
      "nodes" => {
        "loop" => { "moduleId" => "store.relationship-loop", "props" => { "relationship" => "products" } },
      },
    }
    prefetched = { "products" => { "bag" => { "id" => 3 }, "hat" => { "id" => 5 } } }
    collection = { "id" => 1, "slug" => "featured", "products" => [{ "id" => 3 }] }

    assert_equal [3], DependencyTracker.product_ids(document:, prefetched:, current_entry: collection)
  end
end
