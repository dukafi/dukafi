# The cart's DATA CONTRACT — the "API" merchants bind their own design against.
#
# Dukafi does not ship cart markup. A merchant composes the cart out of plain
# nodes on canvas and binds them to these fields, exactly the way a product
# template binds `currentEntry.title`. This service is the only place that
# decides what a cart entry looks like.
#
# Field names deliberately mirror CommercePrefetcher's product/variant hashes
# (`title`, `imageUrl`, `href`, `priceDisplay`) so the binding picker and the
# `{currentEntry.field}` token syntax behave identically inside a cart loop.
#
# Prices are ALWAYS read from the live Variant row, never from a snapshot
# stored on the cart item — a merchant's price edit must be reflected
# immediately, and the cart must never disagree with checkout.
class CartPayload
  # `discount_code` is whatever the visitor has applied (session-stored). It
  # is re-validated on EVERY render, so a code that expires or runs out
  # mid-session simply stops contributing instead of erroring at checkout.
  def self.call(cart, discount_code: nil)
    new(cart, discount_code).call
  end

  def initialize(cart, discount_code = nil)
    @cart = cart
    @discount_code = discount_code
  end

  def call
    items = @cart ? CartItem.where(cart_id: @cart.id).eager(variant: :product).order(:id).all : []
    entries = items.filter_map { |item| entry(item) }
    { "items" => entries, "cart" => summary(entries) }
  end

  private

  def entry(item)
    variant = item.variant
    return unless variant

    product = variant.product
    line_cents = variant.price_cents * item.quantity
    {
      # Identity — what the line is
      "productSlug" => product&.slug.to_s,
      "sku" => variant.sku,
      "title" => product&.title.to_s,
      "variantTitle" => variant.title.to_s,
      "href" => product ? "/products/#{product.slug}" : "",
      "imageUrl" => image_url(product),
      # Quantity and money — both raw cents (for logic) and display strings
      # (for text bindings, which can't format currency themselves)
      "quantity" => item.quantity,
      "currency" => variant.currency,
      "unitPriceCents" => variant.price_cents,
      "unitPriceDisplay" => money(variant.price_cents, variant.currency),
      "linePriceCents" => line_cents,
      "linePriceDisplay" => money(line_cents, variant.currency),
      # Stock is what a "only 2 left" or sold-out treatment binds against
      "stock" => variant.stock,
    }
  end

  def summary(entries)
    count = entries.sum { |entry| entry.fetch("quantity") }
    currencies = entries.map { |entry| entry.fetch("currency") }.uniq
    subtotal = entries.sum { |entry| entry.fetch("linePriceCents") }
    discount = DiscountLookup.call(@discount_code, subtotal)
    discount_cents = discount.ok? ? discount.amount_cents : 0
    # v1 is single-currency (CommerceSettings pins it and every variant is
    # retagged on change), so more than one currency means data drift. Report
    # the sum as unavailable rather than adding up numbers that don't add up.
    mixed = currencies.length > 1
    currency = mixed ? "" : currencies.first.to_s
    total = subtotal - discount_cents
    {
      "count" => count,
      "isEmpty" => entries.empty?,
      "currency" => currency,
      "subtotalCents" => mixed ? nil : subtotal,
      "subtotalDisplay" => mixed ? "" : money(subtotal, currencies.first),
      # Only a code that currently validates is reported — an expired or
      # exhausted one reads as "no discount", never as a stale saving.
      "discountCode" => discount.ok? ? discount.discount.code : "",
      "discountCents" => mixed ? nil : discount_cents,
      "discountDisplay" => mixed || discount_cents.zero? ? "" : money(discount_cents, currency),
      "totalCents" => mixed ? nil : total,
      "totalDisplay" => mixed ? "" : money(total, currency),
    }
  end

  def image_url(product)
    return "" unless product

    asset = product.media_assets.min_by(&:id)
    asset ? "/#{asset.path}" : ""
  end

  def money(cents, currency)
    Dukafi::Publisher::StoreModules.format_price(cents.to_i, currency.to_s.upcase)
  end
end
