class CommercePrefetcher
  # The whole catalogue: every active product with its variants and images,
  # plus every collection with its resolved product list. What a page bake
  # needs, because a page may loop over any of it.
  def self.call
    default_currency = CommerceSettings.current.currency
    products = Product.where(status: "active").eager(:variants, :media_assets).all.to_h do |product|
      [product.slug, product_hash(product, default_currency)]
    end
    collections = Collection.eager(:products, :media_asset).all.to_h do |collection|
      items = collection.products.filter_map { |product| products[product.slug] }
      cover = collection.media_asset
      [collection.slug, {
        "id" => collection.id, "slug" => collection.slug, "title" => collection.title,
        "description" => collection.description.to_s,
        "imageUrl" => cover ? "/#{cover.path}" : "",
        "products" => items,
      }]
    end
    # Only APPROVED reviews, newest first. Un-approved text must never reach a
    # page, and the filter lives here rather than in the loop so no author can
    # opt out of it by writing a different source.
    reviews = Review.approved.newest_first.limit(100).map(&:to_entry)

    # The payment methods a page may offer. Prefetched like any catalogue
    # data because it is the same for every visitor — which is what lets a
    # storefront LOOP them instead of hardcoding one provider's name and slug
    # into a button. `entry` renames `slug` to `providerSlug` so a provider in
    # scope cannot be mistaken for a product.
    providers = Dukafi::Plugins.configured_payment_providers.map do |meta|
      {
        "providerSlug" => meta.fetch("slug"),
        "name" => meta.fetch("name"),
        # Composed here rather than on the page, so a template does not have to
        # know how to phrase a button for a provider it has never heard of.
        "payLabel" => "Pay with #{meta.fetch('name')}",
        "pluginId" => meta["pluginId"].to_s,
        "fields" => Array(meta["fields"]).map do |field|
          {
            "name" => field["name"].to_s, "label" => field["label"].to_s,
            "type" => field["type"].to_s.empty? ? "text" : field["type"].to_s,
            "placeholder" => field["placeholder"].to_s,
          }
        end,
      }
    end

    attach_related!(products, collections)
    MediaPrefetcher.call.merge(
      "products" => products, "collections" => collections, "reviews" => reviews,
      "paymentProviders" => providers, "dataTables" => data_tables,
    )
  end

  # ONE product, in the identical shape.
  #
  # A scoped cart region renders a single card — but it used to reach for the
  # full catalogue just to look that card's product up by slug, so a 30-card
  # grid loaded every product thirty times to render thirty cards. That cost
  # grows with the CATALOGUE, not the page: measured at 1.9 ms for 3 products
  # and 25.1 ms for 500, paid once per region.
  #
  # `collections` is empty here on purpose — a caller that needs them is
  # rendering something this scoped path cannot serve, and `needs_catalogue?`
  # in `routes/fragments.rb` is what decides that before calling in.
  def self.for_product(slug)
    product = Product.where(status: "active", slug: slug.to_s).eager(:variants, :media_assets).first
    products = product ? { product.slug => product_hash(product, CommerceSettings.current.currency) } : {}
    MediaPrefetcher.call.merge("products" => products, "collections" => {})
  end

  def self.data_tables
    media_ids = []
    tables = CustomTable.eager(:custom_rows).order(:name).all
    tables.each do |table|
      table.column_list.each do |column|
        next unless column["type"] == "media"

        table.custom_rows.each do |row|
          id = Integer(row.cells_data[column["id"]], exception: false)
          media_ids << id if id
        end
      end
    end
    media_by_id = MediaAsset.where(id: media_ids.uniq).all.to_h { |asset| [asset.id, asset] }
    tables.to_h do |table|
      rows = table.custom_rows.sort_by(&:position).map do |row|
        CustomTableWrites.baked_row(table, row, media_by_id)
      end
      [table.slug, {
        "id" => table.id, "slug" => table.slug, "name" => table.name,
        "columns" => table.column_list, "rows" => rows,
      }]
    end
  end
  private_class_method :data_tables

  def self.product_hash(product, default_currency)
    variant = product.variants.min_by(&:position)
    currency = variant&.currency || default_currency
    images = product.media_assets.map do |asset|
      {
        "url" => "/#{asset.path}", "alt" => asset.alt_text.to_s,
        "width" => asset.width, "height" => asset.height, "variants" => asset.variants,
      }
    end
    og_asset = product.og_media_asset_id && product.media_assets.find { |asset| asset.id == product.og_media_asset_id }
    CatalogueFields.flatten({
      "id" => product.id, "slug" => product.slug, "title" => product.title,
      "href" => "/products/#{product.slug}", "imageUrl" => images.first&.fetch("url") || "",
      "ogImageUrl" => og_asset ? "/#{og_asset.path}" : (images.first&.fetch("url") || ""),
      "images" => images, "createdAt" => product.created_at.to_i,
      "descriptionHtml" => product.description_document.to_s,
      "priceCents" => variant&.price_cents, "currency" => currency,
      "priceDisplay" => Dukafi::Publisher::StoreModules.format_price(variant&.price_cents || 0, currency),
      "related" => [],
      "fields" => CatalogueFields.list_for(product.fields, owner: :product),
      "variants" => product.variants.sort_by(&:position).map do |item|
        CatalogueFields.flatten({
          "id" => item.id, "sku" => item.sku, "title" => item.title,
          "priceCents" => item.price_cents, "currency" => item.currency,
          "priceDisplay" => Dukafi::Publisher::StoreModules.format_price(item.price_cents, item.currency),
          "stock" => item.stock, "position" => item.position,
          "fields" => CatalogueFields.list_for(item.fields, owner: :variant),
        }, item.fields, owner: :variant)
      end,
    }, product.fields, owner: :product)
  end
  private_class_method :product_hash

  # Other products that share a collection with this one. Tight categories
  # (few members) come first so a "Milk" collection beats a store-wide
  # Featured dump. Nested copies omit `related` so the graph cannot cycle.
  RELATED_LIMIT = 12

  def self.attach_related!(products, collections)
    membership = Hash.new { |hash, key| hash[key] = [] }
    collections.each_value do |collection|
      slugs = Array(collection["products"]).map { |item| item["slug"] }
      slugs.each { |slug| membership[slug] << collection["slug"] if slug }
    end
    products.each do |slug, hash|
      collection_slugs = membership[slug].sort_by do |collection_slug|
        Array(collections.dig(collection_slug, "products")).length
      end
      seen = { slug => true }
      related = []
      collection_slugs.each do |collection_slug|
        Array(collections.dig(collection_slug, "products")).each do |item|
          other = item["slug"]
          next if seen[other]
          seen[other] = true
          sibling = products[other]
          next unless sibling

          related << sibling.merge("related" => [])
          break if related.length >= RELATED_LIMIT
        end
        break if related.length >= RELATED_LIMIT
      end
      hash["collectionSlugs"] = collection_slugs
      hash["related"] = related
    end
  end
  private_class_method :attach_related!
end
