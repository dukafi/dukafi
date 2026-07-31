class Dukafy
  module Publisher
    module StoreModules
      PRODUCT_CARD_CSS = <<~CSS
        .dukafy-product-card{display:grid;gap:.75rem;color:inherit;text-decoration:none}.dukafy-product-card__image{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#f4f4f5}.dukafy-product-card__body{display:grid;gap:.25rem}.dukafy-product-card__title,.dukafy-product-card__price{margin:0}
      CSS

      module_function

      def register(registry)
        registry.register(
          "store.product-card",
          schema: { "imageUrl" => { type: :image }, "href" => { type: :url } },
          defaults: {
            "productSlug" => "", "imageUrl" => "", "title" => "Product title",
            "priceCents" => 0, "currency" => "USD", "href" => "",
          },
        ) do |props, _children, context|
          product = context[:prefetched].dig("products", props["productSlug"]) || {}
          title = product.key?("title") ? CGI.escapeHTML(product["title"].to_s) : props["title"]
          image_url = BaseHelpers.safe_url(product.fetch("imageUrl", props["imageUrl"]))
          href = BaseHelpers.safe_url(product.fetch("href", props["href"].to_s.empty? ? "/products/#{props['productSlug']}" : props["href"]))
          cents = Integer(product.fetch("priceCents", props["priceCents"]) || 0)
          currency = product.fetch("currency", props["currency"]).to_s.upcase
          price = format_price(cents, currency)
          image = image_url == "#" || image_url.empty? ? '<span class="dukafy-product-card__image" aria-hidden="true"></span>' : %(<img class="dukafy-product-card__image" src="#{image_url}" alt="" loading="lazy" decoding="async">)
          html = %(<a class="dukafy-product-card" href="#{href}">#{image}<span class="dukafy-product-card__body"><strong class="dukafy-product-card__title">#{title}</strong><span class="dukafy-product-card__price">#{price}</span></span></a>)
          { html:, css: PRODUCT_CARD_CSS }
        end
        registry.register(
          "store.price",
          defaults: { "productSlug" => "", "variantSku" => "", "priceCents" => 0, "currency" => "USD" },
        ) do |props, _children, context|
          product = context[:prefetched].dig("products", props["productSlug"]) || {}
          variants = product.fetch("variants", [])
          variant = if props["variantSku"].to_s.empty?
            variants.min_by { |item| item.fetch("position", 0) }
          else
            variants.find { |item| item["sku"] == props["variantSku"] }
          end
          cents = Integer(variant&.fetch("priceCents", nil) || product["priceCents"] || props["priceCents"] || 0)
          currency = variant&.fetch("currency", nil) || product["currency"] || props["currency"]
          { html: %(<span class="dukafy-price" data-product="#{CGI.escapeHTML(props['productSlug'].to_s)}"#{props['variantSku'].to_s.empty? ? '' : %( data-variant="#{CGI.escapeHTML(props['variantSku'].to_s)}")}>#{format_price(cents, currency.to_s.upcase)}</span>) }
        end
      end

      def format_price(cents, currency)
        amount = format("%.2f", cents / 100.0)
        currency == "USD" ? "$#{amount}" : "#{CGI.escapeHTML(currency)} #{amount}"
      end
    end

    StoreModules.register(REGISTRY)
  end
end
