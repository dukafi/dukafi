# Maps WooCommerce REST product JSON onto Dukafi catalogue rows.
#
# Woo speaks dollars-as-strings, `publish`/`draft`, SKUs on the parent or on
# variations, categories as `{id,name,slug}`. Dukafi speaks cents, `active`/
# `draft`, variants-always, collections. The plugin owns that translation.
# The host never sees a Woo field — writes go through CommerceWrites.
#
# The lab does not call Woo. A real importer would GET /wp-json/wc/v3/products
# in this job; here that GET is a log row and the payload is posted or sampled.
module Probe
  module WooImport
    module_function

    SAMPLE = [
      {
        "id" => 101,
        "name" => "Canvas tote",
        "slug" => "canvas-tote",
        "status" => "publish",
        "description" => "<p>A bag from a Woo store.</p>",
        "sku" => "WOO-TOTE",
        "price" => "29.50",
        "regular_price" => "29.50",
        "stock_quantity" => 8,
        "categories" => [{ "id" => 9, "name" => "Bags", "slug" => "bags" }],
        "images" => [{ "src" => "https://woo.example/tote.jpg", "alt" => "Tote" }],
      },
      {
        "id" => 303,
        "name" => "2018 Toyota Axio",
        "slug" => "2018-toyota-axio",
        "status" => "publish",
        "description" => "<p>One car, extra fields the coffee shop does not have.</p>",
        "sku" => "AXIO-001",
        "price" => "1450000.00",
        "stock_quantity" => 1,
        "categories" => [{ "id" => 15, "name" => "Cars", "slug" => "cars" }],
        "meta_data" => [
          { "key" => "make", "value" => "Toyota" },
          { "key" => "model_year", "value" => "2018" },
        ],
        "variations" => [
          {
            "id" => 304, "sku" => "AXIO-001", "price" => "1450000.00", "stock_quantity" => 1,
            "meta_data" => [
              { "key" => "origin", "value" => "Japan" },
              { "key" => "mileage", "value" => "42000" },
            ],
          },
        ],
      },
      {
        "id" => 202,
        "name" => "Linen shirt",
        "slug" => "linen-shirt",
        "status" => "publish",
        "description" => "<p>Sized in Woo, one product here.</p>",
        "categories" => [{ "id" => 12, "name" => "Shirts", "slug" => "shirts" }],
        "images" => [],
        "variations" => [
          { "id" => 203, "sku" => "WOO-SHIRT-S", "price" => "40.00", "stock_quantity" => 3,
            "attributes" => [{ "name" => "Size", "option" => "Small" }] },
          { "id" => 204, "sku" => "WOO-SHIRT-L", "price" => "42.00", "stock_quantity" => 1,
            "attributes" => [{ "name" => "Size", "option" => "Large" }] },
        ],
      },
    ].freeze

    def sync!(plugin, products: nil, use_sample: false)
      plugin.log("import", "Would GET https://woo.example/wp-json/wc/v3/products (no HTTP in the lab)")
      rows = extract_products(products)
      if rows.empty?
        rows = extract_products(plugin.storage.collection("inbox").get("products"))
      end
      rows = SAMPLE if rows.empty? && use_sample
      raise ArgumentError, "No Woo products to import." if rows.empty?

      imported = rows.map { |row| upsert_product!(plugin, stringify(row)) }
      plugin.storage.collection("inbox").put("products", { "products" => rows })
      { "ok" => true, "imported" => imported, "note" => "Wrote through CommerceWrites. Woo was not called." }
    end

    def extract_products(value)
      return SAMPLE if value == true
      return [] if value.nil?

      value = JSON.parse(value) if value.is_a?(String)
      if value.is_a?(Hash)
        inner = value["products"] || value[:products]
        return extract_products(inner) unless inner.nil?
        return [stringify(value)] if value.key?("id") || value.key?("name")

        return []
      end
      Array(value)
    end

    def upsert_product!(plugin, woo)
      woo_id = woo["id"]
      raise ArgumentError, "A Woo product needs an id." if woo_id.to_s.empty?

      maps = plugin.storage.collection("woo_products")
      mapped = maps.get(woo_id.to_s)
      product = mapped && Product[mapped["productId"]]
      attrs = {
        "title" => woo["name"].to_s,
        "slug" => woo["slug"].to_s,
        "status" => dukafi_status(woo["status"]),
        "descriptionHtml" => woo["description"].to_s,
        "fields" => product_meta(woo),
      }
      action = if product
        CommerceWrites.update_product!(product, attrs)
        "updated"
      else
        product = CommerceWrites.create_product!(attrs)
        "created"
      end
      maps.put(woo_id.to_s, { "productId" => product.id, "slug" => product.slug, "wooId" => woo_id })

      variants = upsert_variants!(plugin, product, woo)
      upsert_categories!(plugin, product, woo)
      Array(woo["images"]).each do |image|
        next unless image.is_a?(Hash)

        plugin.log("import", "Would download #{image["src"]} (not fetched)",
                   { "wooId" => woo_id, "alt" => image["alt"] })
      end
      plugin.log("import", "#{action} Woo ##{woo_id} → #{product.slug}",
                 { "wooId" => woo_id, "productId" => product.id, "slug" => product.slug,
                   "variants" => variants.length })
      { "action" => action, "wooId" => woo_id, "productId" => product.id, "slug" => product.slug,
        "variants" => variants }
    end

    def upsert_variants!(plugin, product, woo)
      maps = plugin.storage.collection("woo_variants")
      variations_of(woo).map.with_index do |woo_var, index|
        key = woo_var["id"].to_s
        mapped = maps.get(key)
        variant = mapped && Variant[mapped["variantId"]]
        variant = nil unless variant && variant.product_id == product.id
        params = {
          "sku" => sku_for(woo_var, woo, index),
          "title" => variant_title(woo_var),
          "priceCents" => cents(woo_var["price"] || woo_var["regular_price"]),
          "stock" => Integer(woo_var["stock_quantity"] || 0, exception: false) || 0,
          "position" => index,
          "fields" => variant_meta(woo, woo_var),
        }
        if variant
          CommerceWrites.update_variant!(variant, params)
        else
          variant = CommerceWrites.create_variant!(product, params)
        end
        maps.put(key, { "variantId" => variant.id, "sku" => variant.sku, "wooId" => woo_var["id"] })
        { "wooId" => woo_var["id"], "variantId" => variant.id, "sku" => variant.sku }
      end
    end

    def upsert_categories!(plugin, product, woo)
      maps = plugin.storage.collection("woo_categories")
      Array(woo["categories"]).filter_map do |cat|
        next unless cat.is_a?(Hash)
        next if cat["id"].to_s.empty?

        mapped = maps.get(cat["id"].to_s)
        collection = mapped && Collection[mapped["collectionId"]]
        unless collection
          collection = CommerceWrites.create_collection!(
            "title" => cat["name"].to_s,
            "slug" => cat["slug"].to_s,
          )
          maps.put(cat["id"].to_s, { "collectionId" => collection.id, "slug" => collection.slug,
                                     "wooId" => cat["id"] })
        end
        CommerceWrites.add_product_to_collection!(collection, product)
        { "wooId" => cat["id"], "collectionId" => collection.id, "slug" => collection.slug }
      end
    end

    def meta_hash(woo)
      Array(woo["meta_data"]).each_with_object({}) do |row, acc|
        next unless row.is_a?(Hash)

        key = row["key"].to_s
        next if key.empty? || key.start_with?("_")

        acc[key] = row["value"]
      end
    end

    def product_meta(woo)
      variant_keys = CatalogueFields.declared(:variant).map(&:key)
      meta_hash(woo).reject { |key, _| variant_keys.include?(key) }
    end

    def variant_meta(woo, woo_var)
      fields = meta_hash(woo_var)
      variant_keys = CatalogueFields.declared(:variant).map(&:key)
      meta_hash(woo).each { |key, value| fields[key] = value if variant_keys.include?(key) }
      fields
    end

    def variations_of(woo)
      vars = woo["variations"]
      hashes = Array(vars).select { |row| row.is_a?(Hash) }
      return hashes unless hashes.empty?

      [{
        "id" => "default-#{woo["id"]}",
        "sku" => woo["sku"],
        "price" => woo["price"] || woo["regular_price"],
        "stock_quantity" => woo["stock_quantity"],
        "attributes" => [],
      }]
    end

    def sku_for(woo_var, woo, index)
      sku = woo_var["sku"].to_s.strip
      sku = woo["sku"].to_s.strip if sku.empty?
      sku.empty? ? "woo-#{woo["id"]}-#{index}" : sku
    end

    def variant_title(woo_var)
      attrs = Array(woo_var["attributes"]).filter_map do |attr|
        next unless attr.is_a?(Hash)

        attr["option"].to_s
      end
      attrs.empty? ? "Default" : attrs.join(" / ")
    end

    def dukafi_status(value)
      value.to_s == "publish" ? "active" : "draft"
    end

    # Woo prices are major-unit strings ("29.50"). Dukafi stores cents.
    def cents(value)
      str = value.to_s.strip
      return 0 if str.empty?

      units, frac = str.split(".", 2)
      frac = (frac || "00").ljust(2, "0")[0, 2]
      units.to_i.abs * 100 + frac.to_i
    end

    def stringify(hash)
      return {} unless hash.is_a?(Hash)

      hash.to_h { |key, value| [key.to_s, value] }
    end
  end
end
