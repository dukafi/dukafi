require_relative "../spec_helper"

class RecipesSpec < Minitest::Test
  def setup
    CustomRow.dataset.delete
    CustomTable.dataset.delete
    Collection.dataset.delete
    Product.dataset.delete
  end

  def test_snapshot_fills_this_store_into_loop_and_form_html
    CustomTable.create(
      name: "Team", slug: "team",
      columns_json: JSON.generate([{ "id" => "name", "label" => "Name", "type" => "text" }]),
    )
    Collection.create(title: "Featured", slug: "featured", sort_order: 0)

    payload = Recipes.snapshot
    assert_equal %w[loops cms forms cart overlays components seo design], payload.fetch("topics")
    assert_equal "team", payload.dig("thisStore", "tables", 0, "slug")
    assert_equal "featured", payload.dig("thisStore", "collections", 0, "slug")

    cms = payload.fetch("recipes").find { |row| row["id"] == "cms-loop" }
    assert_includes cms.fetch("html"), 'data-dukafy-loop="data/team"'
    assert_includes cms.fetch("html"), 'data-dukafy-bind-text="currentEntry.name"'

    form = payload.fetch("recipes").find { |row| row["id"] == "cms-form" }
    assert_includes form.fetch("html"), 'data-dukafy-form-mode="cms"'
    assert_includes form.fetch("html"), 'data-dukafy-target-table="team"'
    assert_includes form.fetch("html"), 'name="name"'

    grid = payload.fetch("recipes").find { |row| row["id"] == "collection-grid" }
    assert_includes grid.fetch("html"), 'data-dukafy-loop="collections/featured.products"'
    assert_includes grid.fetch("html"), 'data-dukafy-pagination'

    search = payload.fetch("recipes").find { |row| row["id"] == "search-grid" }
    assert_includes search.fetch("html"), 'data-dukafy-loop="current-query"'
    assert_includes search.fetch("html"), 'name="keyword"'
    assert_includes search.fetch("html"), 'action="/search"'
    assert_includes search.fetch("html"), 'id="search-results"'

    related = payload.fetch("recipes").find { |row| row["id"] == "related-grid" }
    assert_includes related.fetch("html"), 'data-dukafy-loop="currentEntry.related"'

    search_rules = search.fetch("rules").join(" ")
    assert_match(/noindex/i, search_rules)
    assert_match(/rank/i, search_rules)
    refute_includes search_rules, "meta keywords"

    spotlight = payload.fetch("recipes").find { |row| row["id"] == "homepage-spotlight" }
    assert_equal "loops", spotlight.fetch("topic")
    assert_includes spotlight.fetch("html"), 'data-dukafy-loop="collections/featured.products"'
    assert_includes spotlight.fetch("html"), 'id="featured"'
    assert_includes spotlight.fetch("html"), 'data-dukafy-pagination'
    assert_includes spotlight.fetch("html"), 'data-dukafy-action="loop.next"'
    assert_match(/REPLACES/, spotlight.fetch("rules").join(" "))
    assert_match(/discounts/i, spotlight.fetch("rules").join(" "))
    assert_match(/top of the page/i, spotlight.fetch("rules").join(" "))

    rank = payload.fetch("recipes").find { |row| row["id"] == "rank-for" }
    assert_equal "seo", rank.fetch("topic")
    assert_includes rank.fetch("html"), 'data-dukafy-loop="collections/featured.products"'
    rank_rules = rank.fetch("rules").join(" ")
    assert_match(/noindex/, rank_rules)
    refute_match(%r{/search\?keyword=.*rank}i, rank_rules)
    assert_includes rank_rules, "set_page_seo"
    assert_includes rank_rules, "generate_sitemaps"

    page_seo = payload.fetch("recipes").find { |row| row["id"] == "page-seo" }
    assert_equal "seo", page_seo.fetch("topic")
    assert_equal "", page_seo.fetch("html")
    assert_includes page_seo.fetch("rules").join(" "), "keywords"
    assert_includes page_seo.fetch("rules").join(" "), "update_store_settings"
    assert_includes page_seo.fetch("rules").join(" "), "title"
  end

  def test_spotlight_prefers_featured_over_the_first_collection
    Collection.create(title: "Milk", slug: "milk", sort_order: 0)
    Collection.create(title: "Featured", slug: "featured", sort_order: 9)

    payload = Recipes.snapshot("loops")
    spotlight = payload.fetch("recipes").find { |row| row["id"] == "homepage-spotlight" }
    assert_includes spotlight.fetch("html"), 'data-dukafy-loop="collections/featured.products"'
  end

  def test_seo_topic_is_the_rank_playbook
    payload = Recipes.snapshot("seo")
    ids = payload.fetch("recipes").map { |row| row["id"] }
    assert_equal %w[rank-for page-seo], ids
    assert(payload.fetch("recipes").all? { |row| row["topic"] == "seo" })
  end

  def test_design_topic_is_the_quiet_storefront
    payload = Recipes.snapshot("design")
    quiet = payload.fetch("recipes").find { |row| row["id"] == "quiet-section" }
    assert_equal "design", quiet.fetch("topic")
    assert_includes quiet.fetch("html"), "bg-white"
    refute_includes quiet.fetch("html"), "gradient"
    assert_match(/vague/i, quiet.fetch("rules").join(" "))
    assert_match(/gradient/i, quiet.fetch("rules").join(" "))
    hero = payload.fetch("recipes").find { |row| row["id"] == "quiet-hero" }
    assert_includes hero.fetch("html"), "md:grid-cols-2"
    refute_includes hero.fetch("html"), "gradient"
  end

  def test_topic_filters_and_rejects_unknown
    payload = Recipes.snapshot("components")
    assert(payload.fetch("recipes").all? { |row| row["topic"] == "components" })
    insert = payload.fetch("recipes").find { |row| row["id"] == "insert-component" }
    assert_includes insert.fetch("html"), "data-dukafy-component="
    assert_raises(ArgumentError) { Recipes.snapshot("react") }
  end

  def test_summary_points_at_seo_and_loop_sources
    Collection.create(title: "Featured", slug: "featured", sort_order: 0)
    summary = Recipes.summary
    assert_includes summary.fetch("topics"), "seo"
    assert_includes summary.fetch("topics"), "design"
    assert_includes summary.fetch("loopSources"), "collections/featured.products"
    assert_includes summary.fetch("loopSources"), "current-query"
    assert_match(/rank for/i, summary.fetch("note"))
  end
end
