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

  def cart_fragment(cart, notice: nil)
    items = CartItem.where(cart_id: cart.id).all
    count = items.sum(&:quantity)
    message = notice ? %(<p class="dukafy-cart-notice" role="status">#{CGI.escapeHTML(notice)}</p>) : ""
    %(<div id="dukafy-cart-summary" class="dukafy-buy-result dukafy-cart-summary" data-cart-count="#{count}">#{message}<span>#{count} #{count == 1 ? 'item' : 'items'} in cart</span></div>)
  end

  route do |r|
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
        cart_fragment(active_cart)
      end
    end

    r.get do
      response.status = 404
      "Fragment not found"
    end
  end
end
