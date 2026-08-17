require_relative "../spec_helper"

class WooImportSpec < Minitest::Test
  def setup
    CollectionProduct.dataset.delete
    Variant.dataset.delete
    Collection.dataset.delete
    Product.dataset.delete
    PluginRecord.where(plugin_id: "probe").delete
    PluginLog.dataset.delete
  end

  def plugin = Dukafi::Plugins.find("probe")

  def test_woo_price_strings_become_cents_and_publish_becomes_active
    result = Probe::WooImport.sync!(plugin, use_sample: true)
    tote = Product.first(slug: "canvas-tote")

    assert tote
    assert_equal "active", tote.status
    assert_equal 2_950, tote.variants.first.price_cents
    assert_equal "WOO-TOTE", tote.variants.first.sku
    assert_equal "created", result.fetch("imported").first.fetch("action")
  end

  def test_woo_variations_become_dukafi_variants
    Probe::WooImport.sync!(plugin, use_sample: true)
    shirt = Product.first(slug: "linen-shirt")

    assert_equal %w[WOO-SHIRT-S WOO-SHIRT-L], shirt.variants.map(&:sku)
    assert_equal ["Small", "Large"], shirt.variants.map(&:title)
    assert_equal [4_000, 4_200], shirt.variants.map(&:price_cents)
  end

  def test_woo_categories_become_collections
    Probe::WooImport.sync!(plugin, use_sample: true)
    bags = Collection.first(slug: "bags")

    assert bags
    assert_includes bags.products.map(&:slug), "canvas-tote"
  end

  def test_a_second_sync_updates_the_same_product_instead_of_duplicating
    Probe::WooImport.sync!(plugin, use_sample: true)
    Probe::WooImport.sync!(plugin, products: [{
      "id" => 101, "name" => "Canvas tote (restocked)", "slug" => "canvas-tote",
      "status" => "publish", "sku" => "WOO-TOTE", "price" => "31.00", "stock_quantity" => 20,
    }])

    assert_equal 1, Product.where(slug: "canvas-tote").count
    tote = Product.first(slug: "canvas-tote")
    assert_equal "Canvas tote (restocked)", tote.title
    assert_equal 3_100, tote.variants.first.price_cents
    assert_equal 20, tote.variants.first.stock
  end

  def test_the_woo_http_call_is_logged_not_made
    Probe::WooImport.sync!(plugin, use_sample: true)
    row = PluginLog.where(plugin_id: "probe", kind: "import").first

    assert_includes row.message, "Would GET"
    refute_includes row.message, "200 OK"
  end

  def test_images_are_logged_not_downloaded
    before = MediaAsset.count
    Probe::WooImport.sync!(plugin, use_sample: true)

    assert_equal before, MediaAsset.count
    assert PluginLog.where(plugin_id: "probe").all.any? { |row| row.message.include?("Would download") }
  end

  def test_the_mapping_table_is_plugin_storage_not_a_core_column
    Probe::WooImport.sync!(plugin, use_sample: true)
    mapped = plugin.storage.collection("woo_products").get("101")

    assert mapped
    assert_equal Product.first(slug: "canvas-tote").id, mapped.fetch("productId")
    refute Product.columns.include?(:woo_id)
  end

  def test_woo_meta_data_lands_on_declared_catalogue_fields
    Probe::WooImport.sync!(plugin, use_sample: true)
    car = Product.first(slug: "2018-toyota-axio")

    assert_equal "Toyota", CatalogueFields.hash_for(car.fields, owner: :product).fetch("make")
    assert_equal 2018, CatalogueFields.hash_for(car.fields, owner: :product).fetch("model_year")
    variant = car.variants.first
    assert_equal "Japan", CatalogueFields.hash_for(variant.fields, owner: :variant).fetch("origin")
    assert_equal 42_000, CatalogueFields.hash_for(variant.fields, owner: :variant).fetch("mileage")
  end
end
