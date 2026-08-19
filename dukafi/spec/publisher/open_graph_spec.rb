require_relative "../spec_helper"

class OpenGraphSpec < Minitest::Test
  def setup
    @previous = ENV["DUKAFI_PUBLIC_ORIGIN"]
    ENV["DUKAFI_PUBLIC_ORIGIN"] = "https://shop.example"
  end

  def teardown
    if @previous
      ENV["DUKAFI_PUBLIC_ORIGIN"] = @previous
    else
      ENV.delete("DUKAFI_PUBLIC_ORIGIN")
    end
  end

  def test_a_product_uses_the_chosen_og_image_not_the_first_gallery_image
    tags = Dukafi::Publisher::OpenGraph.for_product(
      {
        "title" => "CK One", "slug" => "ck-one", "href" => "/products/ck-one",
        "imageUrl" => "/uploads/card.jpg", "ogImageUrl" => "/uploads/hero.jpg",
        "images" => [
          { "url" => "/uploads/card.jpg", "width" => 400, "height" => 400, "alt" => "Card" },
          { "url" => "/uploads/hero.jpg", "width" => 1200, "height" => 800, "alt" => "Bottle" },
        ],
        "priceCents" => 4_999, "currency" => "KES",
      },
      { "name" => "Dukafi" },
      title: "CK One", description: "A citrus classic."
    )

    assert_includes tags, 'property="og:type" content="product"'
    assert_includes tags, 'property="og:image" content="https://shop.example/uploads/hero.jpg"'
    assert_includes tags, 'property="og:image:width" content="1200"'
    assert_includes tags, 'property="og:image:alt" content="Bottle"'
    assert_includes tags, 'property="product:price:amount" content="49.99"'
    assert_includes tags, 'property="product:price:currency" content="KES"'
    assert_includes tags, 'name="twitter:card" content="summary_large_image"'
    refute_includes tags, "/uploads/card.jpg"
  end

  def test_escapes_title_and_skips_blank_images
    tags = Dukafi::Publisher::OpenGraph.tags(title: 'Shop & "More"', image: "  ")

    assert_includes tags, "Shop &amp; &quot;More&quot;"
    refute_includes tags, "og:image"
    assert_includes tags, 'name="twitter:card" content="summary"'
  end
end
