require_relative "../spec_helper"

class CommercePrefetcherSpec < Minitest::Test
  def setup
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
  end

  def test_prefetches_ordered_active_collection_products_as_plain_hashes
    now = Time.now
    first = Product.create(
      title: "First", slug: "first", status: "active", created_at: now, updated_at: now,
      description_document: "<p>Handwoven canvas</p>",
    )
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
    assert_equal "$10.00", result.dig("products", "first", "priceDisplay")
    assert_equal "$10.00", result.dig("products", "first", "variants", 0, "priceDisplay")
    assert_equal now.to_i, result.dig("products", "first", "createdAt")
    assert_equal "<p>Handwoven canvas</p>", result.dig("products", "first", "descriptionHtml")
    assert_equal ["second"], result.dig("products", "first", "related").map { |product| product.fetch("slug") }
    assert_equal [], result.dig("products", "first", "related").first.fetch("related")
    refute_includes result.dig("products", "first", "related").map { |product| product.fetch("slug") }, "first"
  end

  def test_prefetches_a_products_attached_images_in_order
    now = Time.now
    product = Product.create(title: "Tote", slug: "tote", status: "active", created_at: now, updated_at: now)
    second = MediaAsset.create(path: "uploads/second.jpg", mime: "image/jpeg", width: 800, height: 600, variants_json: "[]", created_at: now)
    first = MediaAsset.create(path: "uploads/first.jpg", mime: "image/jpeg", width: 400, height: 300, variants_json: "[]", created_at: now)
    ProductImage.dataset.insert(product_id: product.id, media_asset_id: second.id, position: 1)
    ProductImage.dataset.insert(product_id: product.id, media_asset_id: first.id, position: 0)

    result = CommercePrefetcher.call
    entry = result.dig("products", "tote")

    assert_equal "/uploads/first.jpg", entry.fetch("imageUrl")
    assert_equal "/uploads/first.jpg", entry.fetch("ogImageUrl")
    assert_equal ["/uploads/first.jpg", "/uploads/second.jpg"], entry.fetch("images").map { |image| image.fetch("url") }
    assert_equal 400, entry.dig("images", 0, "width")
  end

  def test_a_product_can_pick_a_share_image_that_is_not_the_first
    now = Time.now
    product = Product.create(title: "Tote", slug: "tote", status: "active", created_at: now, updated_at: now)
    first = MediaAsset.create(path: "uploads/first.jpg", mime: "image/jpeg", width: 400, height: 300, variants_json: "[]", created_at: now)
    hero = MediaAsset.create(path: "uploads/hero.jpg", mime: "image/jpeg", width: 1200, height: 800, variants_json: "[]", created_at: now)
    ProductImage.dataset.insert(product_id: product.id, media_asset_id: first.id, position: 0)
    ProductImage.dataset.insert(product_id: product.id, media_asset_id: hero.id, position: 1)
    product.update(og_media_asset_id: hero.id)

    entry = CommercePrefetcher.call.dig("products", "tote")

    assert_equal "/uploads/first.jpg", entry.fetch("imageUrl")
    assert_equal "/uploads/hero.jpg", entry.fetch("ogImageUrl")
  end

  def test_imageless_product_has_an_empty_image_url_not_a_broken_one
    Product.create(title: "Bare", slug: "bare", status: "active", created_at: Time.now, updated_at: Time.now)

    entry = CommercePrefetcher.call.dig("products", "bare")

    assert_equal "", entry.fetch("imageUrl")
    assert_equal "", entry.fetch("ogImageUrl")
    assert_equal [], entry.fetch("images")
  end

  def test_prefetches_a_collection_cover_image
    now = Time.now
    cover = MediaAsset.create(path: "uploads/cover.jpg", mime: "image/jpeg", width: 800, height: 600, variants_json: "[]", created_at: now)
    Collection.create(title: "Featured", slug: "featured", description: "", sort_order: 0, media_asset_id: cover.id)

    entry = CommercePrefetcher.call.dig("collections", "featured")

    assert_equal "/uploads/cover.jpg", entry.fetch("imageUrl")
  end
end
