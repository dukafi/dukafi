require_relative "../spec_helper"

class PluginCatalogueSpec < Minitest::Test
  def teardown
    PluginCatalogue.http = nil
  end

  def test_marks_plugins_already_on_this_store
    PluginCatalogue.http = lambda do |_url|
      JSON.generate("plugins" => [
        { "id" => "payhero", "name" => "PayHero", "version" => "1.0.0",
          "author" => "Dukafi", "category" => "payments", "licensed" => false,
          "logo" => "https://registry.example/logo.png",
          "images" => ["https://registry.example/shot.png"] },
        { "id" => "acme", "name" => "Acme", "version" => "2.0.0", "licensed" => true,
          "pricing" => { "purchaseUrl" => "https://acme.example/buy" } },
      ], "total" => 2, "limit" => 25, "offset" => 0)
    end

    rows = PluginCatalogue.list.fetch("plugins")
    payhero = rows.find { |row| row.fetch("id") == "payhero" }
    acme = rows.find { |row| row.fetch("id") == "acme" }

    assert_equal true, payhero.fetch("installed")
    assert_equal false, acme.fetch("installed")
    assert_equal true, acme.fetch("licensed")
    assert_equal "https://acme.example/buy", acme.fetch("purchaseUrl")
    assert_equal "https://registry.example/logo.png", payhero.fetch("logo")
    assert_equal ["https://registry.example/shot.png"], payhero.fetch("images")
  end

  def test_forwards_search_filters_and_page_to_the_registry
    seen = nil
    PluginCatalogue.http = lambda do |url|
      seen = url
      JSON.generate("plugins" => [], "total" => 40, "limit" => 25, "offset" => 25)
    end

    result = PluginCatalogue.list(q: "pay", category: "payments", licensed: "false",
                                  limit: 25, offset: 25)

    assert_includes seen, "/v1/plugins?"
    assert_includes seen, "q=pay"
    assert_includes seen, "category=payments"
    assert_includes seen, "licensed=false"
    assert_includes seen, "limit=25"
    assert_includes seen, "offset=25"
    assert_equal 40, result.fetch("total")
    assert_equal 25, result.fetch("offset")
  end

  def test_drops_unknown_categories_instead_of_asking_the_registry
    seen = nil
    PluginCatalogue.http = lambda do |url|
      seen = url
      JSON.generate("plugins" => [], "total" => 0)
    end

    PluginCatalogue.list(q: "  ship  ", category: "not-a-category", licensed: "maybe")

    assert_includes seen, "q=ship"
    refute_includes seen, "category="
    refute_includes seen, "licensed="
  end

  def test_detail_marks_whether_this_store_already_has_it
    PluginCatalogue.http = lambda do |url|
      raise "unexpected #{url}" unless url.end_with?("/v1/plugins/payhero")

      JSON.generate("id" => "payhero", "name" => "PayHero", "version" => "1.0.0",
                    "licensed" => false, "category" => "payments")
    end

    row = PluginCatalogue.detail("payhero")
    assert_equal true, row.fetch("installed")
    assert_equal "PayHero", row.fetch("name")
    assert_equal false, row.fetch("licensed")
  end
end
