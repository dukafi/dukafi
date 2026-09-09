require_relative "../spec_helper"

class StoreContextSpec < Minitest::Test
  def setup
    Review.dataset.delete
    CollectionProduct.dataset.delete
    Collection.dataset.delete
    ProductImage.dataset.delete
    MediaAsset.dataset.delete
    Variant.dataset.delete
    Product.dataset.delete
    Page.dataset.delete
    StoreProfile.dataset.delete
    SiteState.dataset.delete
  end

  def test_an_empty_store_is_a_valid_snapshot
    payload = StoreContext.call

    assert_equal true, payload.dig("profile", "thin")
    assert_equal 0, payload.dig("pages", "total")
    assert_equal 0, payload.dig("products", "total")
    assert_equal [], payload.dig("products", "sample")
    assert_equal "", payload.dig("settings", "name")
    assert_equal "en", payload.dig("settings", "language")
    assert_nil payload.dig("settings", "ogImage")
  end

  def test_search_media_matches_filename_and_alt
    MediaAsset.create(path: "uploads/shop-front.jpg", mime: "image/jpeg", alt_text: "The storefront", created_at: Time.now)
    MediaAsset.create(path: "uploads/bag.jpg", mime: "image/jpeg", alt_text: "Leather bag", created_at: Time.now)

    hits = StoreContext.search_media("storefront")
    assert_equal ["/uploads/shop-front.jpg"], hits.map { |row| row.fetch("path") }
    assert_equal [], StoreContext.search_media("a yacht in monaco")
  end

  def test_caps_the_product_sample
    21.times do |index|
      Product.create(title: "P#{index}", slug: "p-#{index}", status: "active", description_document: "")
    end

    payload = StoreContext.call
    assert_equal 21, payload.dig("products", "total")
    assert_equal StoreContext::SAMPLE, payload.dig("products", "sample").length
  end
end
