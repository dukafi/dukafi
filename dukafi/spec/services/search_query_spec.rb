require_relative "../spec_helper"

class SearchQuerySpec < Minitest::Test
  def water
    {
      "title" => "Water 500ml",
      "slug" => "water-500-ml",
      "descriptionHtml" => "<p>Still water.</p>",
      "variants" => [{ "sku" => "WAT-500", "title" => "Bottle" }],
    }
  end

  def suit
    {
      "title" => "Navy Suit",
      "slug" => "suit",
      "descriptionHtml" => "",
      "variants" => [{ "sku" => "SUIT-1", "title" => "Default" }],
    }
  end

  def test_keyword_reads_the_query_param_and_ignores_blanks
    assert_equal "water500ml", SearchQuery.keyword("keyword" => "water500ml")
    assert_equal "water", SearchQuery.keyword("keyword" => "  <b>water</b>  ")
    long = "x" * 120
    assert_equal "x" * SearchQuery::MAX_LENGTH, SearchQuery.keyword("keyword" => long)
    assert_nil SearchQuery.keyword("keyword" => "  ")
    assert_nil SearchQuery.keyword("keyword" => "")
    assert_nil SearchQuery.keyword("q" => "water500ml")
    assert_nil SearchQuery.keyword(nil)
  end

  def test_compact_keywords_match_spaced_titles
    assert SearchQuery.match?(water, "water500ml")
    assert SearchQuery.match?(water, "Water 500ml")
    assert SearchQuery.match?(water, "WAT-500")
    refute SearchQuery.match?(suit, "water500ml")
  end

  def test_filter_returns_only_matching_products
    hits = SearchQuery.filter([water, suit], "water500ml")

    assert_equal ["Water 500ml"], hits.map { |item| item["title"] }
    assert_equal [], SearchQuery.filter([water, suit], nil)
    assert_equal [], SearchQuery.filter([water, suit], "no-such-sku")
  end
end
