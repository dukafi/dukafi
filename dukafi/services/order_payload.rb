# A customer's own orders — the DATA CONTRACT their account page binds to.
#
# Same shape of thing as `CartPayload`: Dukafi ships no order-history markup,
# so a merchant composes the list out of plain nodes and binds
# `currentEntry.totalDisplay` exactly the way a product card binds
# `currentEntry.title`. Field names deliberately mirror the cart's
# (`title`, `sku`, `quantity`, `unitPriceDisplay`, `linePriceDisplay`,
# `imageUrl`, `href`) so a merchant who has built a cart already knows this.
#
# Two things are different from every other loop source, and both follow from
# whose data this is:
#
#   · It is NEVER baked. Products are the same for everyone and can be written
#     into a static file; an order belongs to one person, so an orders loop
#     bakes as a placeholder that fetches itself — the same mechanism the cart
#     already uses (`cart_lines_placeholder`).
#   · The customer is taken from the SESSION, never from a parameter. There is
#     no `?customer_id=`, so there is nothing to tamper with: a page showing
#     someone else's orders is not reachable by editing a URL.
#
# Line prices are SNAPSHOTS read from `order_items`, unlike the cart's, which
# are read live from the variant. An order says what was actually charged, and
# must not change because the merchant edited a price afterwards.
class OrderPayload
  # Most recent first, because the thing a customer came to check is almost
  # always the last thing they bought.
  def self.for_customer(customer, limit: 200)
    return [] unless customer

    orders = Order.where(customer_id: customer.id)
                  .order(Sequel.desc(:created_at), Sequel.desc(:id))
                  .limit(limit)
                  .eager(:order_items)
                  .all
    orders.map { |order| entry(order) }
  end

  # One order, for the same customer only. `nil` for anyone else's — the
  # detail view is reached by token, and a token from another account must not
  # resolve.
  def self.for_customer_token(customer, token)
    return nil unless customer && !token.to_s.empty?

    order = Order.first(public_token: token.to_s, customer_id: customer.id)
    order && entry(order)
  end

  def self.entry(order)
    lines = order.order_items.map { |item| line(item, order.currency) }
    settled = order.settled_payment
    {
      # Identity. `reference` is the public token, which is also what the
      # payment region takes as `order_token` — so a "Pay now" button on a row
      # needs nothing else.
      "id" => order.id,
      "reference" => order.public_token.to_s,
      "number" => "##{order.id}",
      # Status, as both a string to compare and booleans to condition on.
      # `visibleWhen` compares strings, so the pair is not redundant: the
      # booleans keep a "Pay now" button from needing to know every status
      # that is not paid.
      "status" => order.status.to_s,
      "statusLabel" => order.status.to_s.capitalize,
      "isPaid" => %w[paid fulfilled shipped].include?(order.status.to_s),
      "isAwaitingPayment" => order.status.to_s == "pending",
      "placedAt" => order.created_at&.utc&.iso8601,
      "date" => order.created_at&.strftime("%-d %B %Y").to_s,
      "currency" => order.currency.to_s,
      "itemCount" => lines.sum { |entry| entry.fetch("quantity") },
      "subtotalCents" => order.subtotal_cents,
      "subtotalDisplay" => money(order.subtotal_cents, order.currency),
      "discountCents" => order.discount_cents,
      "discountDisplay" => money(order.discount_cents, order.currency),
      "discountCode" => order.discount_code.to_s,
      "hasDiscount" => order.discount_cents.to_i.positive?,
      "shippingCents" => order.shipping_cents,
      "shippingDisplay" => money(order.shipping_cents, order.currency),
      "totalCents" => order.total_cents,
      "totalDisplay" => money(order.total_cents, order.currency),
      # What actually paid for this. Flattened onto the order rather than
      # hidden behind a list, because the one thing a customer wants to see is
      # "it went through, here is the receipt" — and a page should not have to
      # loop to say it.
      "paymentReceipt" => settled&.receipt.to_s,
      "paymentProvider" => settled&.provider.to_s,
      "paymentReference" => settled&.provider_reference.to_s,
      "paidAt" => settled&.updated_at&.utc&.iso8601,
      "paidOn" => settled&.updated_at&.strftime("%-d %B %Y at %H:%M").to_s,
      "paymentAmountDisplay" => settled ? money(settled.amount_cents, settled.currency) : "",
      # `lines` rather than `items`, because `items` already means cart items
      # in the source vocabulary and an order line is not one — it carries no
      # cart facts and cannot be re-quantified.
      "lines" => lines,
      # Every attempt, newest first — for a page that wants to show the
      # history rather than only the outcome.
      "payments" => order.payment_attempts
                         .sort_by { |attempt| [attempt.updated_at || attempt.created_at, attempt.id] }
                         .reverse
                         .map { |attempt| payment(attempt) },
    }
  end

  # One attempt. No `request_payload` and no `response_payload`: those hold
  # whatever the provider echoed back, which is not something to put on a page
  # a customer can read.
  def self.payment(attempt)
    {
      "id" => attempt.id,
      "provider" => attempt.provider.to_s,
      "status" => attempt.status.to_s,
      "statusLabel" => attempt.status.to_s.capitalize,
      "succeeded" => attempt.succeeded?,
      "receipt" => attempt.receipt.to_s,
      "reference" => attempt.provider_reference.to_s,
      "amountDisplay" => money(attempt.amount_cents, attempt.currency),
      "amountCents" => attempt.amount_cents,
      "at" => attempt.updated_at&.utc&.iso8601,
      "on" => attempt.updated_at&.strftime("%-d %B %Y at %H:%M").to_s,
      # The provider's own words when it refused. Useful on an admin screen,
      # and harmless on a customer's — it is why THEIR payment did not work.
      "error" => attempt.error.to_s,
    }
  end

  def self.line(item, currency)
    variant = item.variant_id && Variant[item.variant_id]
    product = variant&.product
    {
      "title" => item.product_title.to_s,
      "variantTitle" => item.variant_title.to_s,
      "sku" => item.sku.to_s,
      "quantity" => item.quantity,
      "unitPriceCents" => item.unit_price_cents,
      "unitPriceDisplay" => money(item.unit_price_cents, currency),
      "linePriceCents" => item.unit_price_cents * item.quantity,
      "linePriceDisplay" => money(item.unit_price_cents * item.quantity, currency),
      # The product may have been renamed, re-slugged or deleted since. The
      # TITLE always comes from the order (what was bought), while the link and
      # image come from the catalogue if it still has them — a dead link is
      # worse than no link.
      "productSlug" => product&.slug.to_s,
      "href" => product ? "/products/#{product.slug}" : "",
      "imageUrl" => image_url(product),
    }
  end

  def self.image_url(product)
    return "" unless product

    asset = product.media_assets.min_by(&:id)
    asset ? "/#{asset.path}" : ""
  end

  def self.money(cents, currency)
    Dukafi::Publisher::StoreModules.format_price(cents.to_i, currency.to_s.upcase)
  end
end
