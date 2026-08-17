require_relative "../spec_helper"

class PluginStorageSpec < Minitest::Test
  def setup
    PluginRecord.dataset.delete
  end

  def test_put_and_get_are_scoped_to_the_plugin_and_collection
    a = PluginStorage.new("probe")
    b = PluginStorage.new("other")
    a.collection("woo_products").put("101", { "productId" => 7 })
    b.collection("woo_products").put("101", { "productId" => 9 })
    a.collection("inbox").put("101", { "nope" => true })

    assert_equal 7, a.collection("woo_products").get("101").fetch("productId")
    assert_equal 9, b.collection("woo_products").get("101").fetch("productId")
    assert_nil a.collection("woo_products").get("missing")
  end

  def test_put_overwrites_the_same_key
    store = PluginStorage.new("probe").collection("woo_products")
    store.put("101", { "productId" => 1 })
    store.put("101", { "productId" => 2 })

    assert_equal 1, store.all.length
    assert_equal 2, store.get("101").fetch("productId")
  end
end
