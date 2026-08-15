class Dukafi
  module Publisher
    module StoreModules
      PRODUCT_CARD_CSS = <<~CSS
        .dukafy-product-card{display:grid;gap:.75rem;color:inherit;text-decoration:none}.dukafy-product-card__image{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#f4f4f5}.dukafy-product-card__body{display:grid;gap:.25rem}.dukafy-product-card__title,.dukafy-product-card__price{margin:0}
      CSS
      IMAGE_GALLERY_CSS = <<~CSS
        .dukafy-image-gallery{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:.75rem}.dukafy-image-gallery__item{display:block;width:100%;height:100%;aspect-ratio:1/1;object-fit:cover;background:#f4f4f5}.dukafy-image-gallery__item:first-child{grid-row:span 2}.dukafy-image-gallery--empty{display:block;min-height:12rem;background:#f4f4f5}@media(max-width:640px){.dukafy-image-gallery{grid-template-columns:1fr}.dukafy-image-gallery__item:first-child{grid-row:auto}}
      CSS
      VARIANT_PICKER_CSS = <<~CSS
        .dukafy-variant-picker{display:grid;gap:.375rem}.dukafy-variant-picker__label{font-weight:600}.dukafy-variant-picker__select{width:100%;min-height:2.75rem;padding:.625rem .75rem;border:1px solid currentColor;border-radius:.375rem;background:inherit;color:inherit;font:inherit}
      CSS
      BUY_BUTTON_CSS = <<~CSS
        .dukafy-buy-form{display:grid;gap:.5rem}.dukafy-buy-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:.625rem 1rem;border:1px solid currentColor;border-radius:.375rem;background:#18181b;color:#fff;font:inherit;font-weight:600;cursor:pointer}.dukafy-buy-button:disabled{cursor:not-allowed;opacity:.5}
      CSS
      COLLECTION_LOOP_CSS = <<~CSS
        .dukafy-collection-loop{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:1rem}.dukafy-collection-loop__pagination{display:flex;grid-column:1/-1;align-items:center;justify-content:center;gap:1rem}.dukafy-collection-loop__pagination a{color:inherit}
      CSS
      STOCK_BADGE_CSS = <<~CSS
        .dukafy-stock-badge{display:inline-flex;align-items:center;gap:.375rem;font-size:.875rem}.dukafy-stock-badge::before{content:"";width:.5rem;height:.5rem;border-radius:999px;background:currentColor}.dukafy-stock-badge--in-stock{color:#15803d}.dukafy-stock-badge--low{color:#a16207}.dukafy-stock-badge--sold-out{color:#b91c1c}.dukafy-stock-badge--loading{opacity:.6}
      CSS
      CART_BADGE_CSS = <<~CSS
        
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
          product = bound_product(props, context)
          product_slug = bound_product_slug(props, product)
          title = product.key?("title") ? CGI.escapeHTML(product["title"].to_s) : props["title"]
          image_url = BaseHelpers.safe_url(product.fetch("imageUrl", props["imageUrl"]))
          href = BaseHelpers.safe_url(product.fetch("href", props["href"].to_s.empty? ? "/products/#{product_slug}" : props["href"]))
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
          product = bound_product(props, context)
          product_slug = bound_product_slug(props, product)
          variants = product.fetch("variants", [])
          variant = if props["variantSku"].to_s.empty?
            variants.min_by { |item| item.fetch("position", 0) }
          else
            variants.find { |item| item["sku"] == props["variantSku"] }
          end
          cents = Integer(variant&.fetch("priceCents", nil) || product["priceCents"] || props["priceCents"] || 0)
          currency = variant&.fetch("currency", nil) || product["currency"] || props["currency"]
          { html: %(<span class="dukafy-price" data-product="#{CGI.escapeHTML(product_slug)}"#{props['variantSku'].to_s.empty? ? '' : %( data-variant="#{CGI.escapeHTML(props['variantSku'].to_s)}")}>#{format_price(cents, currency.to_s.upcase)}</span>) }
        end
        registry.register(
          "store.image-gallery",
          defaults: { "productSlug" => "", "images" => "", "alt" => "" },
        ) do |props, _children, context|
          product = bound_product(props, context)
          product_slug = bound_product_slug(props, product)
          images = product.fetch("images", [])
          images = authored_images(props["images"], props["alt"]) if images.empty?
          items = images.filter_map do |image|
            source = BaseHelpers.safe_url(image.is_a?(Hash) ? image["url"] : image)
            next if source.empty? || source == "#"

            alt = CGI.escapeHTML(image.is_a?(Hash) ? image.fetch("alt", props["alt"]).to_s : props["alt"].to_s)
            responsive = image.is_a?(Hash) ? responsive_image_attributes(image) : ""
            %(<img class="dukafy-image-gallery__item" src="#{source}"#{responsive} alt="#{alt}" loading="lazy" decoding="async">)
          end.join
          modifier = items.empty? ? " dukafy-image-gallery--empty" : ""
          { html: %(<div class="dukafy-image-gallery#{modifier}" data-product="#{CGI.escapeHTML(product_slug)}">#{items}</div>), css: IMAGE_GALLERY_CSS }
        end
        registry.register(
          "store.variant-picker",
          defaults: { "productSlug" => "", "label" => "Choose an option", "name" => "variant", "selectedSku" => "" },
        ) do |props, _children, context|
          product = bound_product(props, context)
          product_slug = bound_product_slug(props, product)
          variants = product.fetch("variants", []).sort_by { |item| item.fetch("position", 0) }
          selected_sku = props["selectedSku"].to_s
          selected_sku = variants.find { |item| item.fetch("stock", 0).positive? }&.fetch("sku", "").to_s if selected_sku.empty?
          options = if variants.empty?
            '<option value="" disabled selected>No variants available</option>'
          else
            variants.map { |variant| variant_option(variant, selected_sku) }.join
          end
          disabled = variants.empty? ? " disabled" : ""
          html = %(<label class="dukafy-variant-picker" data-product="#{CGI.escapeHTML(product_slug)}"><span class="dukafy-variant-picker__label">#{CGI.escapeHTML(props['label'].to_s)}</span><select class="dukafy-variant-picker__select" name="#{safe_field_name(props['name'])}"#{disabled}>#{options}</select></label>)
          { html:, css: VARIANT_PICKER_CSS }
        end
        registry.register(
          "store.buy-button",
          defaults: { "productSlug" => "", "variantSku" => "", "label" => "Add to cart", "quantity" => 1 },
        ) do |props, _children, context|
          product = bound_product(props, context)
          product_slug = bound_product_slug(props, product)
          variants = product.fetch("variants", []).sort_by { |item| item.fetch("position", 0) }
          variant = if props["variantSku"].to_s.empty?
            variants.find { |item| item.fetch("stock", 0).positive? }
          else
            variants.find { |item| item["sku"] == props["variantSku"] }
          end
          disabled = !variant || !variant.fetch("stock", 0).positive?
          sku = variant&.fetch("sku", props["variantSku"]).to_s
          label = disabled ? "Sold out" : props["label"].to_s
          quantity = [Integer(props["quantity"] || 1), 1].max
          html = %(<form class="dukafy-buy-form" method="post" action="/fragments/cart/items" hx-post="/fragments/cart/items" hx-target="find .dukafy-buy-result" hx-swap="outerHTML"><input type="hidden" name="product_slug" value="#{CGI.escapeHTML(product_slug)}"><input type="hidden" name="variant_sku" value="#{CGI.escapeHTML(sku)}"><input type="hidden" name="quantity" value="#{quantity}"><button class="dukafy-buy-button" type="submit"#{disabled ? ' disabled' : ''}>#{CGI.escapeHTML(label)}</button><output class="dukafy-buy-result" aria-live="polite"></output></form>)
          { html:, css: BUY_BUTTON_CSS, runtimes: [:htmx] }
        end
        registry.register(
          "store.relationship-loop",
          defaults: { "relationship" => "products", "sourceSlug" => "", "perPage" => 12 },
        ) do |_props, children, _context|
          { html: %(<div class="dukafy-collection-loop">#{children.join}</div>), css: COLLECTION_LOOP_CSS }
        end
        registry.register(
          "store.collection-loop", # deprecated alias — kept so already-published documents keep rendering
          defaults: { "collectionSlug" => "", "perPage" => 12 },
        ) do |_props, children, _context|
          { html: %(<div class="dukafy-collection-loop">#{children.join}</div>), css: COLLECTION_LOOP_CSS }
        end
        registry.register(
          "store.stock-badge",
          defaults: { "productSlug" => "", "variantSku" => "", "lowStockThreshold" => 5 },
        ) do |props, _children, context|
          product = bound_product(props, context)
          product_slug = bound_product_slug(props, product)
          threshold = [[Integer(props["lowStockThreshold"] || 5), 0].max, 100_000].min
          query = "product_slug=#{CGI.escape(product_slug)}&variant_sku=#{CGI.escape(props['variantSku'].to_s)}&low_stock_threshold=#{threshold}"
          html = %(<span class="dukafy-stock-badge dukafy-stock-badge--loading" hx-get="/fragments/stock?#{CGI.escapeHTML(query)}" hx-trigger="revealed" hx-swap="outerHTML" aria-live="polite">Checking availability…</span>)
          { html:, css: STOCK_BADGE_CSS, runtimes: [:htmx] }
        end
      end

      def authored_images(value, alt)
        value.to_s.lines.map(&:strip).reject(&:empty?).map { |url| { "url" => url, "alt" => alt } }
      end

      def bound_product(props, context)
        slug = props["productSlug"].to_s
        slug.empty? ? (context[:current_product] || {}) : (context[:prefetched].dig("products", slug) || {})
      end

      def responsive_image_attributes(image)
        variants = image.fetch("variants", [])
        srcset = variants.filter_map do |variant|
          url = BaseHelpers.safe_url(variant["path"])
          %(#{url} #{Integer(variant['width'])}w) unless url.empty? || url == "#"
        end.join(", ")
        dimensions = %w[width height].filter_map { |key| image[key] ? %( #{key}="#{Integer(image[key])}") : nil }.join
        srcset.empty? ? dimensions : %( srcset="#{srcset}" sizes="auto, 100vw"#{dimensions})
      end

      def bound_product_slug(props, product)
        authored = props["productSlug"].to_s
        authored.empty? ? product.fetch("slug", "").to_s : authored
      end

      def variant_option(variant, selected_sku)
        sku = variant.fetch("sku", "").to_s
        stock = Integer(variant.fetch("stock", 0))
        title = variant.fetch("title", sku).to_s
        price = format_price(Integer(variant.fetch("priceCents", 0)), variant.fetch("currency", "USD").to_s.upcase)
        suffix = stock.positive? ? " — #{price}" : " — Sold out"
        selected = sku == selected_sku ? " selected" : ""
        disabled = stock.positive? ? "" : " disabled"
        %(<option value="#{CGI.escapeHTML(sku)}" data-price-cents="#{Integer(variant.fetch('priceCents', 0))}" data-currency="#{CGI.escapeHTML(variant.fetch('currency', 'USD').to_s.upcase)}"#{selected}#{disabled}>#{CGI.escapeHTML(title)}#{suffix}</option>)
      end

      def safe_field_name(value)
        name = value.to_s
        name.match?(/\A[a-zA-Z][a-zA-Z0-9_.-]*\z/) ? name : "variant"
      end

      def collection_pagination(parameter, page, page_count)
        return "" if page_count <= 1

        previous = page > 1 ? %(<a rel="prev" href="?#{CGI.escapeHTML(parameter)}=#{page - 1}">Previous</a>) : ""
        following = page < page_count ? %(<a rel="next" href="?#{CGI.escapeHTML(parameter)}=#{page + 1}">Next</a>) : ""
        %(<nav class="dukafy-collection-loop__pagination" aria-label="Collection pages">#{previous}<span>Page #{page} of #{page_count}</span>#{following}</nav>)
      end

      # Pagination for a loop that lives inside a FRAGMENT rather than a baked
      # page. An `?page=2` link would reload the static file and the
      # placeholder would fetch page 1 again, so the click has to page the
      # fragment in place. Same markup and classes as the baked pagination, so
      # a merchant styles one thing.
      def fragment_pagination(node_id, page, page_count, endpoint)
        return "" if page_count <= 1

        link = lambda do |target, rel, label|
          # `&amp;` because this is an ATTRIBUTE value: a bare `&` there is
          # invalid HTML, and while browsers forgive it, the parser is not the
          # only thing that reads published markup.
          %(<a rel="#{rel}" href="#" hx-get="#{CGI.escapeHTML(endpoint)}?node=#{CGI.escapeHTML(node_id)}&amp;page=#{target}" ) +
            %(hx-target="closest .dukafy-collection-loop" hx-swap="outerHTML">#{label}</a>)
        end
        previous = page > 1 ? link.call(page - 1, "prev", "Previous") : ""
        following = page < page_count ? link.call(page + 1, "next", "Next") : ""
        %(<nav class="dukafy-collection-loop__pagination" aria-label="Order pages">#{previous}<span>Page #{page} of #{page_count}</span>#{following}</nav>)
      end

      def format_price(cents, currency)
        amount = format("%.2f", cents / 100.0)
        currency == "USD" ? "$#{amount}" : "#{CGI.escapeHTML(currency)} #{amount}"
      end
    end

    StoreModules.register(REGISTRY)
  end
end
