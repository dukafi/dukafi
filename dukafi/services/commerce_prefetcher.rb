class CommercePrefetcher
  # The whole catalogue: every active product with its variants and images,
  # plus every collection with its resolved product list. What a page bake
  # needs, because a page may loop over any of it.
  def self.call
    default_currency = CommerceSettings.current.currency
    products = Product.where(status: "active").eager(:variants, :media_assets).all.to_h do |product|
      [product.slug, product_hash(product, default_currency)]
    end
    collections = Collection.eager(:products).all.to_h do |collection|
      items = collection.products.filter_map { |product| products[product.slug] }
      [collection.slug, {
        "id" => collection.id, "slug" => collection.slug, "title" => collection.title,
        "description" => collection.description.to_s, "products" => items,
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

    MediaPrefetcher.call.merge(
      "products" => products, "collections" => collections, "reviews" => reviews,
      "paymentProviders" => providers,
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

  def self.product_hash(product, default_currency)
    variant = product.variants.min_by(&:position)
    currency = variant&.currency || default_currency
    images = product.media_assets.map do |asset|
      {
        # Was hardcoded to "" — a product photo announced itself to a screen
        # reader as nothing at all.
        "url" => "/#{asset.path}", "alt" => asset.alt_text.to_s,
        "width" => asset.width, "height" => asset.height, "variants" => asset.variants,
      }
    end
    {
      "id" => product.id, "slug" => product.slug, "title" => product.title,
      "href" => "/products/#{product.slug}", "imageUrl" => images.first&.fetch("url") || "",
      "images" => images, "createdAt" => product.created_at.to_i,
      "descriptionHtml" => product.description_document.to_s,
      "priceCents" => variant&.price_cents, "currency" => currency,
      "priceDisplay" => Dukafi::Publisher::StoreModules.format_price(variant&.price_cents || 0, currency),
      "variants" => product.variants.sort_by(&:position).map do |item|
        {
          "id" => item.id, "sku" => item.sku, "title" => item.title,
          "priceCents" => item.price_cents, "currency" => item.currency,
          "priceDisplay" => Dukafi::Publisher::StoreModules.format_price(item.price_cents, item.currency),
          "stock" => item.stock, "position" => item.position,
        }
      end,
    }
  end
  private_class_method :product_hash
end
