require "cgi"
require "securerandom"

class Fragments < Roda
  plugin :sessions, secret: ENV.fetch("SESSION_SECRET") { "dev-secret-change-me-" + "x" * 64 }

  def active_cart
    key = session["cart_key"] ||= SecureRandom.hex(24)
    Cart.first(session_key: key, status: "active") || Cart.create(
      session_key: key, status: "active", created_at: Time.now, updated_at: Time.now
    )
  end

  def current_cart
    key = session["cart_key"]
    key && Cart.first(session_key: key, status: "active")
  end

  def cart_fragment(cart, notice: nil)
    items = CartItem.where(cart_id: cart.id).all
    count = items.sum(&:quantity)
    message = notice ? %(<p class="dukafy-cart-notice" role="status">#{CGI.escapeHTML(notice)}</p>) : ""
    %(<div id="dukafy-cart-summary" class="dukafy-buy-result dukafy-cart-summary" data-cart-count="#{count}">#{message}<span>#{count} #{count == 1 ? 'item' : 'items'} in cart</span></div>)
  end

  def stock_fragment(product, variant_sku, threshold)
    variants = product&.variants || []
    variant = variant_sku.empty? ? nil : variants.find { |item| item.sku == variant_sku }
    quantity = variant ? variant.stock : variants.sum(&:stock)
    state, label = if quantity <= 0
      ["sold-out", "Sold out"]
    elsif quantity <= threshold
      ["low", "Only #{quantity} left"]
    else
      ["in-stock", "In stock"]
    end
    %(<span class="dukafy-stock-badge dukafy-stock-badge--#{state}" data-stock="#{quantity}" aria-live="polite">#{label}</span>)
  end

  def cart_badge_fragment(cart, label, href)
    count = cart ? CartItem.where(cart_id: cart.id).sum(:quantity).to_i : 0
    safe_label = CGI.escapeHTML(label)
    valid_href = href.match?(%r{\A/[a-zA-Z0-9_/?=&%.-]*\z}) ? href : "/cart"
    query = "label=#{CGI.escape(label)}&href=#{CGI.escape(valid_href)}"
    %(<a class="dukafy-cart-badge" href="#{CGI.escapeHTML(valid_href)}" hx-get="/fragments/cart/badge?#{CGI.escapeHTML(query)}" hx-trigger="revealed, dukafy:cart-updated from:body" hx-swap="outerHTML" aria-label="#{safe_label}: #{count} #{count == 1 ? 'item' : 'items'}">#{safe_label} <span class="dukafy-cart-badge__count">#{count}</span></a>)
  end

  route do |r|
    r.get("stock") do
      product = Product.first(slug: r.params["product_slug"].to_s, status: "active")
      variant_sku = r.params["variant_sku"].to_s
      threshold = Integer(r.params.fetch("low_stock_threshold", "5"), exception: false)
      threshold = [[threshold || 5, 0].max, 100_000].min
      response["Content-Type"] = "text/html; charset=utf-8"
      response["Cache-Control"] = "no-store"
      next stock_fragment(nil, variant_sku, threshold) unless product
      next stock_fragment(nil, variant_sku, threshold) if !variant_sku.empty? && product.variants.none? { |item| item.sku == variant_sku }

      stock_fragment(product, variant_sku, threshold)
    end

    r.on("cart") do
      r.post("items") do
        product = Product.first(slug: r.params["product_slug"].to_s, status: "active")
        variant = product&.variants&.find { |item| item.sku == r.params["variant_sku"].to_s }
        request.halt([404, { "content-type" => "text/html; charset=utf-8" }, [cart_fragment(active_cart, notice: "Product option not found.")]]) unless variant

        quantity = Integer(r.params.fetch("quantity", "1"), exception: false)
        request.halt([422, { "content-type" => "text/html; charset=utf-8" }, [cart_fragment(active_cart, notice: "Choose a valid quantity.")]]) unless quantity&.positive?

        cart = active_cart
        item = CartItem.first(cart_id: cart.id, variant_id: variant.id)
        new_quantity = (item&.quantity || 0) + quantity
        request.halt([409, { "content-type" => "text/html; charset=utf-8" }, [cart_fragment(cart, notice: "Only #{variant.stock} available.")]]) if new_quantity > variant.stock

        now = Time.now
        item ? item.update(quantity: new_quantity, updated_at: now) : CartItem.create(
          cart_id: cart.id, variant_id: variant.id, quantity:, created_at: now, updated_at: now
        )
        response["Content-Type"] = "text/html; charset=utf-8"
        response["HX-Trigger"] = "dukafy:cart-updated"
        cart_fragment(cart, notice: "Added #{product.title} — #{variant.title}.")
      end

      r.get("badge") do
        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-store"
        cart_badge_fragment(current_cart, r.params.fetch("label", "Cart").to_s[0, 80], r.params.fetch("href", "/cart").to_s)
      end
    end

    r.get do
      response.status = 404
      "Fragment not found"
    end
  end
end
