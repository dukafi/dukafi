require_relative "../spec_helper"

class CatalogueFieldsSpec < Minitest::Test
  def setup
    Variant.dataset.delete
    Product.dataset.delete
  end

  def plugin = Dukafi::Plugins.find("probe")

  def test_probe_declares_car_fields_on_products_and_variants
    keys = CatalogueFields.declared(:variant).map(&:key)

    assert_includes keys, "origin"
    assert_includes keys, "mileage"
    assert_includes CatalogueFields.declared(:product).map(&:key), "make"
  end

  def test_a_reserved_core_name_cannot_be_a_field
    error = assert_raises(CatalogueFields::Invalid) do
      CatalogueFields.merge("{}", { "sku" => "nope" }, owner: :variant)
    end
    assert_includes error.message, "core field"
  end

  def test_writes_are_namespaced_and_read_back_as_short_keys
    stored = CatalogueFields.merge("{}", { "origin" => "Japan", "mileage" => "42000" }, owner: :variant)

    assert_equal "Japan", stored.fetch("probe.origin")
    assert_equal 42_000, stored.fetch("probe.mileage")
    assert_equal "Japan", CatalogueFields.hash_for(stored, owner: :variant).fetch("origin")
    list = CatalogueFields.list_for(stored, owner: :variant)
    assert_equal "Origin", list.find { |row| row["key"] == "origin" }.fetch("label")
  end

  def test_commerce_writes_persist_fields_on_a_variant
    product = CommerceWrites.create_product!("title" => "Axio", "status" => "active",
                                             "fields" => { "make" => "Toyota" })
    variant = CommerceWrites.create_variant!(product, "sku" => "AXIO-1", "title" => "Default",
                                             "priceCents" => 100, "stock" => 1, "position" => 0,
                                             "fields" => { "origin" => "Japan", "mileage" => 12_000 })

    assert_equal "Toyota", CatalogueFields.hash_for(product.refresh.fields, owner: :product).fetch("make")
    assert_equal "Japan", CatalogueFields.hash_for(variant.refresh.fields, owner: :variant).fetch("origin")
    assert_equal 12_000, CatalogueFields.hash_for(variant.refresh.fields, owner: :variant).fetch("mileage")
  end

  def test_prefetcher_exposes_a_fields_list_and_flattens_short_keys
    product = CommerceWrites.create_product!("title" => "Axio", "slug" => "axio", "status" => "active",
                                             "fields" => { "make" => "Toyota" })
    CommerceWrites.create_variant!(product, "sku" => "AXIO-1", "title" => "Default",
                                   "priceCents" => 100, "stock" => 1, "position" => 0,
                                   "fields" => { "origin" => "Japan" })

    entry = CommercePrefetcher.call.dig("products", "axio")
    assert_equal "Toyota", entry.fetch("make")
    assert_equal "Japan", entry.fetch("variants").first.fetch("origin")
    assert_equal "make", entry.fetch("fields").first.fetch("key")
  end
end
