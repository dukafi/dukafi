require_relative "../spec_helper"

class DemoStoreSeederSpec < Minitest::Test
  def setup
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
  end

  def test_seeds_twelve_products_and_three_ordered_collections_idempotently
    result = DemoStoreSeeder.call

    assert_equal 12, result.products
    assert_equal 20, result.variants
    assert_equal 3, result.collections
    assert_equal 12, Product.dataset.count
    assert_equal 20, Variant.dataset.count
    assert_equal %w[featured home-essentials gifts-under-75], Collection.order(:sort_order).select_map(:slug)
    assert_equal "everyday-canvas-tote", Collection.first(slug: "featured").products.first.slug

    DemoStoreSeeder.call
    assert_equal 12, Product.dataset.count
    assert_equal 20, Variant.dataset.count
    assert_equal 3, Collection.dataset.count
  end
end
