require_relative "../spec_helper"

class PageMetaSpec < Minitest::Test
  def site
    { "name" => "Shop", "settings" => { "metaTitle" => "Site Title", "metaDescription" => "Site blurb" } }
  end

  def test_a_page_seo_title_beats_the_page_title_and_the_site_title
    meta = Dukafi::Publisher::PageMeta.for_page(
      { "title" => "About", "seoTitle" => "About the shop", "seoDescription" => "Who we are." },
      site
    )

    assert_equal "About the shop", meta[:title]
    assert_equal "Who we are.", meta[:description]
  end

  def test_blank_page_seo_falls_back_to_the_page_title_not_the_site_title
    meta = Dukafi::Publisher::PageMeta.for_page({ "title" => "Contact", "seoTitle" => "  " }, site)

    assert_equal "Contact", meta[:title]
    assert_equal "Site blurb", meta[:description]
  end

  def test_a_product_uses_its_own_name_even_when_the_site_has_a_meta_title
    meta = Dukafi::Publisher::PageMeta.for_entry(site, title: "Red lipstick", description: "<p>Matte finish.</p>")

    assert_equal "Red lipstick", meta[:title]
    assert_equal "Matte finish.", Dukafi::Publisher::PageMeta.plain_text("<p>Matte finish.</p>")
  end

  def test_a_search_result_title_includes_the_keyword_count_and_store
    one = Dukafi::Publisher::PageMeta.for_search(
      { "title" => "Search" }, site, keyword: "water", count: 1,
      items: [{ "title" => "Water 500ml", "priceCents" => 1000, "currency" => "KES" }]
    )
    many = Dukafi::Publisher::PageMeta.for_search(
      { "title" => "Search", "seoDescription" => "Search the catalogue." },
      site.merge("settings" => site["settings"].merge("shippingBlurb" => "Delivery countrywide.")),
      keyword: "fragrance", count: 5,
      items: [
        { "title" => "Calvin Klein CK One", "brand" => "Calvin Klein", "priceCents" => 4999, "currency" => "KES" },
        { "title" => "Chanel Coco Noir Eau De", "priceCents" => 12_000, "currency" => "KES" },
        { "title" => "Dior J'adore", "priceCents" => 15_000, "currency" => "KES" },
      ]
    )

    assert_equal "Water — 1 Product | Shop", one[:title]
    assert_equal "Shop 1 water product at Shop. Prices from KES 10.00.", one[:description]
    assert_equal "noindex, follow", one[:robots]
    assert_equal "/search?keyword=water", one[:canonical]
    assert_equal "Fragrance — 5 Products | Shop", many[:title]
    assert_equal "Shop 5 fragrance products at Shop. Featuring Calvin Klein, Chanel and Dior. Prices from KES 49.99. Delivery countrywide.",
                 many[:description]
  end

  def test_a_zero_result_search_omits_the_count_and_stays_noindex
    meta = Dukafi::Publisher::PageMeta.for_search(
      { "title" => "Search" }, site, keyword: "cheap loans nairobi", count: 0
    )

    assert_equal "Cheap Loans Nairobi | Shop", meta[:title]
    refute_includes meta[:title], "0 Product"
    assert_equal "No products matching cheap loans nairobi.", meta[:description]
    assert_equal "noindex, follow", meta[:robots]
  end

  def test_a_long_keyword_truncates_on_a_word_boundary
    keyword = "handcrafted mahogany dining chairs for nairobi apartments"
    meta = Dukafi::Publisher::PageMeta.for_search(
      { "title" => "Search" }, site, keyword:, count: 2
    )

    assert_equal "Handcrafted Mahogany Dining Chairs — 2 Products | Shop", meta[:title]
    refute_includes meta[:title], "apartments"
  end

  def test_a_paginated_search_appends_the_page_and_stays_noindex
    meta = Dukafi::Publisher::PageMeta.for_search(
      { "title" => "Search" }, site, keyword: "fragrance", count: 20, page: 2
    )

    assert_equal "Fragrance — 20 Products — Page 2 | Shop", meta[:title]
    assert_equal "noindex, follow", meta[:robots]
    assert_equal "/search?keyword=fragrance", meta[:canonical]
  end

  def test_a_collection_uses_the_same_formula_and_is_indexable
    meta = Dukafi::Publisher::PageMeta.for_collection(
      site,
      {
        "title" => "Living", "slug" => "living",
        "products" => [
          { "title" => "Kesi Sofa", "priceCents" => 1000, "currency" => "KES" },
          { "title" => "Mara Armchair", "priceCents" => 2000, "currency" => "KES" },
        ],
      }
    )

    assert_equal "Living — 2 Products | Shop", meta[:title]
    assert_equal "Shop 2 Living products at Shop. Featuring Kesi and Mara. Prices from KES 10.00.",
                 meta[:description]
    assert_equal "index, follow", meta[:robots]
    assert_equal "/collections/living", meta[:canonical]
  end

  def test_collection_page_two_is_noindexed
    meta = Dukafi::Publisher::PageMeta.for_collection(
      site,
      { "title" => "Living", "slug" => "living", "products" => [{ "title" => "Sofa" }, { "title" => "Chair" }] },
      page: 2
    )

    assert_equal "Living — 2 Products — Page 2 | Shop", meta[:title]
    assert_equal "noindex, follow", meta[:robots]
    assert_equal "/collections/living", meta[:canonical]
  end
end
