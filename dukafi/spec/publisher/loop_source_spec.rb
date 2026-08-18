require_relative "../spec_helper"

class LoopSourceSpec < Minitest::Test
  def test_an_explicit_source_wins
    assert_equal "data/team", Dukafi::Publisher::LoopSource.call(
      { "source" => "data/team", "relationship" => "products" }
    )
  end

  def test_empty_source_slug_is_the_whole_catalogue
    assert_equal "products", Dukafi::Publisher::LoopSource.call(
      { "relationship" => "products", "sourceSlug" => "" }
    )
  end

  def test_a_pinned_collection_is_that_collections_products
    assert_equal "collections/featured.products", Dukafi::Publisher::LoopSource.call(
      { "relationship" => "products", "sourceSlug" => "featured" }
    )
  end

  def test_a_data_rows_relationship_uses_the_table_slug
    assert_equal "data/team", Dukafi::Publisher::LoopSource.call(
      { "relationship" => "dataRows", "sourceSlug" => "team" }
    )
  end

  def test_cart_and_variants_keep_their_request_time_spellings
    assert_equal "cart.items", Dukafi::Publisher::LoopSource.call({ "relationship" => "cartItems" })
    assert_equal "currentEntry.variants", Dukafi::Publisher::LoopSource.call({ "relationship" => "variants" })
    assert_equal "products/bag.variants", Dukafi::Publisher::LoopSource.call(
      { "relationship" => "variants", "sourceSlug" => "bag" }
    )
  end

  def test_collection_loop_is_always_a_products_relationship
    assert_equal "collections/featured.products", Dukafi::Publisher::LoopSource.call(
      { "collectionSlug" => "featured" }, module_id: "store.collection-loop"
    )
  end
end
