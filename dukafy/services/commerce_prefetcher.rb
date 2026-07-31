class CommercePrefetcher
  def self.call
    products = Product.where(status: "active").eager(:variants).all.to_h do |product|
      variant = product.variants.min_by(&:position)
      [product.slug, {
        "id" => product.id, "slug" => product.slug, "title" => product.title,
        "href" => "/products/#{product.slug}", "imageUrl" => "",
        "images" => [],
        "priceCents" => variant&.price_cents, "currency" => variant&.currency || "USD",
        "variants" => product.variants.sort_by(&:position).map do |item|
          {
            "id" => item.id, "sku" => item.sku, "title" => item.title,
            "priceCents" => item.price_cents, "currency" => item.currency,
            "stock" => item.stock, "position" => item.position,
          }
        end,
      }]
    end
    { "products" => products }
  end
end
