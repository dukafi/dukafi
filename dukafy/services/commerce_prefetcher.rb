class CommercePrefetcher
  def self.call
    products = Product.where(status: "active").eager(:variants).all.to_h do |product|
      variant = product.variants.min_by(&:position)
      [product.slug, {
        "id" => product.id, "slug" => product.slug, "title" => product.title,
        "href" => "/products/#{product.slug}", "imageUrl" => "",
        "priceCents" => variant&.price_cents, "currency" => variant&.currency || "USD",
      }]
    end
    { "products" => products }
  end
end
