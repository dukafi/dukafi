require_relative "../spec_helper"

class CommercePrefetcherSpec < Minitest::Test
  def setup
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
  end

  def test_prefetches_ordered_active_collection_products_as_plain_hashes
    now = Time.now
    first = Product.create(title: "First", slug: "first", status: "active", created_at: now, updated_at: now)
    second = Product.create(title: "Second", slug: "second", status: "active", created_at: now, updated_at: now)
    draft = Product.create(title: "Draft", slug: "draft", status: "draft", created_at: now, updated_at: now)
    Variant.create(product_id: first.id, sku: "FIRST", title: "Default", price_cents: 1_000, currency: "USD", stock: 2, position: 0)
    collection = Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0)
    [second, draft, first].each_with_index do |product, position|
      CollectionProduct.dataset.insert(collection_id: collection.id, product_id: product.id, position:)
    end

    result = CommercePrefetcher.call
    products = result.dig("collections", "featured", "products")

    assert_equal %w[second first], products.map { |product| product.fetch("slug") }
    assert products.all? { |product| product.is_a?(Hash) }
    assert_equal "FIRST", result.dig("products", "first", "variants", 0, "sku")
  end
end
