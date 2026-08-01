class CommercePrefetcher
  def self.call
    default_currency = CommerceSettings.current.currency
    products = Product.where(status: "active").eager(:variants, :media_assets).all.to_h do |product|
      variant = product.variants.min_by(&:position)
      currency = variant&.currency || default_currency
      images = product.media_assets.map do |asset|
        {
          "url" => "/#{asset.path}", "alt" => "",
          "width" => asset.width, "height" => asset.height, "variants" => asset.variants,
        }
      end
      [product.slug, {
        "id" => product.id, "slug" => product.slug, "title" => product.title,
        "href" => "/products/#{product.slug}", "imageUrl" => images.first&.fetch("url") || "",
        "images" => images, "createdAt" => product.created_at.to_i,
        "descriptionHtml" => product.description_document.to_s,
        "priceCents" => variant&.price_cents, "currency" => currency,
        "priceDisplay" => Dukafy::Publisher::StoreModules.format_price(variant&.price_cents || 0, currency),
        "variants" => product.variants.sort_by(&:position).map do |item|
          {
            "id" => item.id, "sku" => item.sku, "title" => item.title,
            "priceCents" => item.price_cents, "currency" => item.currency,
            "priceDisplay" => Dukafy::Publisher::StoreModules.format_price(item.price_cents, item.currency),
            "stock" => item.stock, "position" => item.position,
          }
        end,
      }]
    end
    collections = Collection.eager(:products).all.to_h do |collection|
      items = collection.products.filter_map { |product| products[product.slug] }
      [collection.slug, {
        "id" => collection.id, "slug" => collection.slug, "title" => collection.title,
        "description" => collection.description.to_s, "products" => items,
      }]
    end
    MediaPrefetcher.call.merge("products" => products, "collections" => collections)
  end
end
