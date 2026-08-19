require_relative "../spec_helper"

class ListingJsonLdSpec < Minitest::Test
  def prefetched
    {
      "products" => {
        "bag" => { "title" => "Canvas Bag", "slug" => "bag", "href" => "/products/bag" },
        "hat" => { "title" => "Wool Hat", "slug" => "hat", "href" => "/products/hat" },
      },
      "collections" => {
        "featured" => {
          "title" => "Featured", "slug" => "featured",
          "products" => [
            { "title" => "Canvas Bag", "slug" => "bag", "href" => "/products/bag" },
          ],
        },
      },
    }
  end

  def listing_document
    {
      "nodes" => {
        "body" => { "id" => "body", "moduleId" => "base.body", "props" => {},
                    "children" => ["loop"], "classIds" => [], "breakpointOverrides" => {} },
        "loop" => { "id" => "loop", "moduleId" => "store.relationship-loop",
                    "props" => { "relationship" => "products", "perPage" => 12 },
                    "children" => [], "classIds" => [], "breakpointOverrides" => {} },
      },
    }
  end

  def test_a_products_loop_emits_collection_page_item_list
    payload = Dukafi::Publisher::ListingJsonLd.call(
      document: listing_document, prefetched: prefetched, path: "shop",
      title: "Shop", description: "Everything we sell",
      site: { "name" => "My Site", "settings" => { "areaServed" => "Kenya", "shippingBlurb" => "Delivery countrywide." } }
    )

    assert_equal "CollectionPage", payload.fetch("@type")
    assert_equal "Shop", payload.fetch("name")
    org = payload.fetch("publisher")
    assert_equal "Organization", org.fetch("@type")
    assert_equal "My Site", org.fetch("name")
    assert_equal "Kenya", org.fetch("areaServed")
    assert_equal "Delivery countrywide.", org.fetch("description")
    list = payload.fetch("mainEntity")
    assert_equal "ItemList", list.fetch("@type")
    assert_equal 2, list.fetch("numberOfItems")
    names = list.fetch("itemListElement").map { |item| item.fetch("name") }
    assert_includes names, "Canvas Bag"
    assert_includes names, "Wool Hat"
    assert_equal "/products/bag", list.fetch("itemListElement").find { |item| item["name"] == "Canvas Bag" }.fetch("url")
  end

  def test_a_collection_entry_lists_only_that_collections_products
    document = {
      "nodes" => {
        "loop" => {
          "id" => "loop", "moduleId" => "store.relationship-loop",
          "props" => { "relationship" => "products", "sourceSlug" => "" },
          "children" => [], "classIds" => [], "breakpointOverrides" => {},
          "dynamicBindings" => {
            "sourceSlug" => { "source" => "currentEntry", "field" => "slug", "format" => "plain" },
          },
        },
      },
    }
    payload = Dukafi::Publisher::ListingJsonLd.call(
      document:, prefetched: prefetched, path: "collections/featured",
      title: "Featured", current_entry: prefetched.dig("collections", "featured")
    )

    names = payload.fetch("mainEntity").fetch("itemListElement").map { |item| item.fetch("name") }
    assert_equal ["Canvas Bag"], names
  end

  def test_an_empty_listing_emits_nothing
    payload = Dukafi::Publisher::ListingJsonLd.call(
      document: listing_document, prefetched: { "products" => {} }, path: "shop", title: "Shop"
    )

    assert_nil payload
    assert_equal "", Dukafi::Publisher::ListingJsonLd.script_tag(payload)
  end

  def test_the_script_tag_does_not_use_product_schema_on_the_list
    payload = Dukafi::Publisher::ListingJsonLd.call(
      document: listing_document, prefetched: prefetched, path: "shop", title: "Shop"
    )
    html = Dukafi::Publisher::HtmlDocument.call(title: "Shop", body: "<p>x</p>", json_ld: payload)

    assert_includes html, 'type="application/ld+json"'
    refute_includes html, '"@type":"Product"'
    assert_includes html, '"@type":"CollectionPage"'
  end

  def test_a_current_query_loop_lists_only_the_keyword_matches
    document = {
      "nodes" => {
        "loop" => {
          "id" => "loop", "moduleId" => "store.relationship-loop",
          "props" => { "source" => "current-query", "perPage" => 12 },
          "children" => [], "classIds" => [], "breakpointOverrides" => {},
        },
      },
    }
    prefetched = {
      "products" => {
        "water" => { "title" => "Water 500ml", "slug" => "water", "href" => "/products/water",
                     "priceCents" => 1000, "currency" => "KES",
                     "variants" => [{ "sku" => "WAT-500", "title" => "Bottle" }] },
        "suit" => { "title" => "Navy Suit", "slug" => "suit", "href" => "/products/suit",
                    "variants" => [] },
      },
    }

    payload = Dukafi::Publisher::ListingJsonLd.call(
      document:, prefetched:, path: "search?keyword=water500ml",
      title: "Water500ml — 1 Product | Shop", description: "Shop 1 water500ml product at Shop. Prices from KES 10.00.",
      query_params: { "keyword" => "water500ml" },
      site: { "name" => "Shop", "settings" => { "areaServed" => "Kenya" } }
    )

    names = payload.fetch("mainEntity").fetch("itemListElement").map { |item| item.fetch("name") }
    assert_equal ["Water 500ml"], names
    assert_equal "/search?keyword=water500ml", payload.fetch("url")
    refute payload.key?("publisher")
    product = payload.fetch("mainEntity").fetch("itemListElement").first.fetch("item")
    assert_equal "Product", product.fetch("@type")
    assert_equal "Water 500ml", product.fetch("name")
    assert_equal "/products/water", product.fetch("url")
    assert_equal "WAT-500", product.fetch("sku")
    assert_equal "Offer", product.fetch("offers").fetch("@type")
    assert_equal "10.00", product.fetch("offers").fetch("price")
    assert_equal "KES", product.fetch("offers").fetch("priceCurrency")
  end
end
