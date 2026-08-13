require "cgi"
require "json"
require "securerandom"

class Fragments < Roda
  plugin :sessions, secret: SessionSecret.fetch

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

  CART_LOOP_MODULES = %w[store.relationship-loop].freeze
  SAFE_NODE_ID = /\A[A-Za-z0-9_-]{1,64}\z/

  # Locate a cart loop node by id across PUBLISHED documents only.
  #
  # The node id arrives from the query string, so this is the security
  # boundary: it must return a node only when that node genuinely is a
  # `cartItems` relationship loop in published content. Without the module +
  # relationship check this endpoint would render any node of any page on
  # demand — including draft content that was never meant to be public.
  # Scan published documents for a node the caller is willing to vouch for.
  #
  # The predicate IS the security boundary — the node id arrives from the query
  # string, so without it this would render any node of any page on demand,
  # including draft content that was never meant to be public.
  def find_published_node(node_id)
    return unless node_id.match?(SAFE_NODE_ID)

    # Ask SQLite which documents even contain this node, instead of loading
    # and JSON-parsing every published page until one matches. That scan is
    # linear in page count and was paid once per cart region — thirty times on
    # a thirty-card grid. `node_id` is validated above, so interpolating it
    # into the JSON path is safe; the quotes let ids containing `-` resolve.
    candidates = Page.where(status: "published").where(
      Sequel.lit(
        "json_extract(COALESCE(published_document, document), ?) IS NOT NULL",
        %($.nodes."#{node_id}"),
      ),
    )

    candidates.order(:id).each do |page|
      document = page.published_document_data || page.document_data
      node = document.is_a?(Hash) ? document.dig("nodes", node_id) : nil
      next unless node.is_a?(Hash)
      next unless yield(node)

      return [document, node]
    end
    nil
  end

  def find_cart_loop(node_id)
    find_published_node(node_id) do |node|
      CART_LOOP_MODULES.include?(node["moduleId"]) &&
        node.dig("props", "relationship").to_s == "cartItems"
    end
  end

  # A cart region is any node the merchant marked as one, so unlike the loop
  # there is no module id to check — the marker itself is the whole claim.
  def find_cart_region(node_id)
    find_published_node(node_id) { |node| node.dig("actions", "region").to_s == "cart" }
  end

  # Re-render ONE subtree with the visitor's cart in scope. `rootNodeId` is
  # repointed at the node so the fragment swaps in exactly what the baked
  # placeholder stood for, and nothing else on the page is rebuilt.
  def render_cart_subtree(document, node, prefetched: nil, current_entry: nil)
    state = SiteState.first
    subtree = document.merge("rootNodeId" => node.fetch("id"))
    Dukafy::Publisher::RenderPage.call(
      document: subtree, registry: Dukafy::Publisher::REGISTRY,
      site: state&.site, prefetched: prefetched || CommercePrefetcher.call,
      current_entry: current_entry,
      cart: CartPayload.call(current_cart, discount_code: session["discount_code"])
    ).html
  end

  def cart_lines_fragment(node_id)
    found = find_cart_loop(node_id)
    found && render_cart_subtree(*found)
  end

  # The entry a scoped region was rendered against, re-resolved from the
  # catalogue rather than trusted from the query string — the params name a
  # product and variant, they do not carry one.
  def region_entry(prefetched, product_slug, variant_sku)
    product = prefetched.dig("products", product_slug.to_s)
    return nil unless product

    return product if variant_sku.to_s.empty?

    Array(product["variants"]).find { |variant| variant["sku"].to_s == variant_sku.to_s } || product
  end

  # Modules whose render reads the prefetched catalogue. A region built only
  # from `base.*` nodes — a count, a button, two conditional branches, which is
  # what a per-card cart region actually is — needs nothing but its own
  # product, so it must not pay for the whole catalogue.
  CATALOGUE_MODULES = %w[
    store.relationship-loop store.collection-loop store.price store.variant-picker
    store.buy-button store.image-gallery store.product-card
  ].freeze

  def needs_catalogue?(document, node)
    nodes = document["nodes"]
    return true unless nodes.is_a?(Hash)

    seen = {}
    stack = [node.fetch("id")]
    until stack.empty?
      id = stack.pop
      next if seen[id]

      seen[id] = true
      current = nodes[id]
      next unless current.is_a?(Hash)
      return true if CATALOGUE_MODULES.include?(current["moduleId"])

      stack.concat(Array(current["children"]))
    end
    false
  end

  def cart_region_fragment(node_id, product_slug: nil, variant_sku: nil)
    found = find_cart_region(node_id)
    return unless found

    document, node = found
    prefetched = if needs_catalogue?(document, node)
      CommercePrefetcher.call
    else
      CommercePrefetcher.for_product(product_slug)
    end
    render_cart_subtree(
      document, node, prefetched: prefetched,
      current_entry: region_entry(prefetched, product_slug, variant_sku)
    )
  end

  # Resolve a cart line by variant SKU within the visitor's own cart.
  # Scoped to `cart` on purpose: SKUs are public, so an unscoped lookup would
  # let anyone mutate a line they don't own.
  def cart_line_for(cart, sku)
    return [nil, nil] unless cart && !sku.empty?

    variant = Variant.first(sku: sku)
    return [nil, nil] unless variant

    [variant, CartItem.first(cart_id: cart.id, variant_id: variant.id)]
  end

  # Reason codes stay machine-readable in DiscountLookup; the wording lives
  # here, at the HTTP edge.
  DISCOUNT_MESSAGES = {
    "not_found" => "That code isn’t valid.",
    "not_started" => "That code isn’t active yet.",
    "expired" => "That code has expired.",
    "exhausted" => "That code has been fully used.",
    "empty_cart" => "Add something to your cart first.",
  }.freeze

  def discount_message(reason)
    DISCOUNT_MESSAGES.fetch(reason, "That code isn’t valid.")
  end

  # Only same-origin absolute paths — never an attacker-supplied host, and
  # never a protocol-relative `//evil.com` that a browser reads as external.
  def safe_local_path(value)
    path = value.to_s
    return nil unless path.start_with?("/") && !path.start_with?("//")
    return nil unless path.match?(%r{\A/[a-zA-Z0-9_\-/?=&%.]*\z})

    path
  end

  def order_error_message(result)
    case result.reason
    when "empty_cart" then "Your cart is empty."
    when "missing_identity" then "Enter an email address or phone number."
    when "out_of_stock"
      short = result.shortages.map { |s| "#{s.title} — only #{s.available} left" }.join("; ")
      short.empty? ? "Some items are no longer available." : short
    else "Could not place the order."
    end
  end

  # A rejected cart mutation, announced as an EVENT rather than as markup.
  #
  # htmx discards 4xx bodies by default (`responseHandling` maps `[45]..` to
  # `swap: false`), so returning a rendered notice meant every failure was
  # silent — a visitor clicking "add" past the stock limit saw nothing happen
  # at all. htmx DOES process `HX-Trigger` before it decides whether to swap,
  # so the message reaches the page either way.
  #
  # This keeps the contract merchants already have: Dukafy fires events, the
  # merchant's own markup reacts. Listen with
  # `hx-trigger="dukafy:cart-error from:body"`, or read `event.detail.message`.
  #
  # The body is still emitted for callers that opt into showing 4xx responses
  # (`hx-swap` with an error-swapping `responseHandling` override).
  def cart_error_headers(message)
    {
      "content-type" => "text/html; charset=utf-8",
      # Lowercase: Rack 3 requires it, and this is a RAW response triplet —
      # it bypasses Roda's response object, which would otherwise normalise the
      # casing for us. `Rack::Lint` only runs under the dev server, so a
      # capitalised name here 500s in development and passes every Rack::Test
      # spec. See `spec/routes/rack_conformance_spec.rb`.
      "hx-trigger" => JSON.generate({ "dukafy:cart-error" => { "message" => message } }),
    }
  end

  def halt_cart_error(status, message)
    request.halt([status, cart_error_headers(message),
                  [%(<p class="dukafy-cart-notice" role="status">#{CGI.escapeHTML(message)}</p>)]])
  end

  # Shared reply for the mutating cart endpoints. Fires `dukafy:cart-updated`
  # so every other cart-aware fragment on the page (badge, a second drawer)
  # refreshes itself, and swaps in the merchant's own re-rendered subtree when
  # the caller said which node it is. No node = the trigger alone is enough.
  def cart_mutation_response(node_id)
    response["Content-Type"] = "text/html; charset=utf-8"
    response["Cache-Control"] = "no-store"
    response["HX-Trigger"] = "dukafy:cart-updated"
    cart_lines_fragment(node_id) || ""
  end

  # Re-render ONE cart line.
  #
  # Changing a quantity used to swap the whole list, rebuilding every row to
  # move one number — and taking focus and scroll position with it. Rows now
  # carry `data-dukafy-cart-line="<sku>"`, so the +/-/remove verbs target their
  # own row and only that row comes back.
  #
  # Returns "" when the line is gone (quantity stepped to zero, or removed):
  # an outerHTML swap with an empty body deletes the element, which is exactly
  # the right result.
  #
  # Falls back to the whole loop when the loop has several children, because
  # the loop round-robins them across items — which child renders a given line
  # depends on its position, and that is not recoverable from a SKU alone.
  def cart_line_fragment(node_id, sku)
    found = find_cart_loop(node_id)
    return unless found

    document, node = found
    children = node.fetch("children", [])
    return cart_lines_fragment(node_id) unless children.length == 1
    return "" unless sku.match?(/\A[A-Za-z0-9._-]{1,64}\z/)

    payload = CartPayload.call(current_cart, discount_code: session["discount_code"])
    item = payload.fetch("items").find { |line| line["sku"].to_s == sku }
    return "" unless item

    state = SiteState.first
    html = Dukafy::Publisher::RenderPage.call(
      document: document.merge("rootNodeId" => children.first),
      registry: Dukafy::Publisher::REGISTRY, site: state&.site,
      prefetched: CommercePrefetcher.call, cart: payload,
      current_entry: item, cart_loop_id: node.fetch("id"),
    ).html
    html.sub(/<([a-zA-Z][\w-]*)/) { %(<#{Regexp.last_match(1)} data-dukafy-cart-line="#{CGI.escapeHTML(sku)}") }
  end

  # A line-level change. Distinct from `dukafy:cart-updated` on purpose: the
  # cart-lines loop listens to that one and re-fetches itself wholesale, which
  # is right when the SET of lines changed (an add, an order) but would undo
  # the per-line swap we just made. Cart regions listen to both, so totals and
  # badges still update.
  def cart_line_response(node_id, sku)
    response["Content-Type"] = "text/html; charset=utf-8"
    response["Cache-Control"] = "no-store"
    response["HX-Trigger"] = "dukafy:cart-line-updated"
    cart_line_fragment(node_id, sku) || ""
  end

  # Which order this payment is for: an explicit token (an order-status page
  # serving any order) else the one just placed in this session.
  def order_for_payment
    token = request.params["order_token"].to_s
    token = session["order_token"].to_s if token.empty?
    return nil if token.empty?

    Order.first(public_token: token)
  end

  PAYMENT_ERRORS = {
    "unknown_provider" => "That payment method isn\u2019t available.",
    "provider_not_configured" => "That payment method isn\u2019t set up yet.",
    "order_not_payable" => "This order has already been paid.",
    "provider_error" => "The payment could not be started. Please try again.",
  }.freeze

  def payment_error_message(reason)
    PAYMENT_ERRORS.fetch(reason, "The payment could not be started.")
  end

  def halt_payment_error(message)
    request.halt([422, { "content-type" => "text/html; charset=utf-8" },
                  [%(<p class="dukafy-payment-error" role="alert">#{CGI.escapeHTML(message)}</p>)]])
  end

  # Re-render the merchant's own payment region with the attempt in scope, so
  # the waiting/success/failure states are theirs. Falls back to a bare status
  # line only when the region node can no longer be found.
  def payment_region_html(node_id, attempt)
    frame = {
      "status" => attempt.status, "reference" => attempt.reference,
      "receipt" => attempt.receipt.to_s, "provider" => attempt.provider,
      "terminal" => attempt.terminal?, "succeeded" => attempt.succeeded?,
      "message" => attempt.error.to_s,
      "amountDisplay" => Dukafy::Publisher::StoreModules.format_price(
        attempt.amount_cents, attempt.currency
      ),
    }
    found = find_region_node(node_id)
    return %(<p class="dukafy-payment-status" data-status="#{attempt.status}">#{CGI.escapeHTML(attempt.status)}</p>) unless found

    document, node = found
    state = SiteState.first
    Dukafy::Publisher::RenderPage.call(
      document: document.merge("rootNodeId" => node.fetch("id")),
      registry: Dukafy::Publisher::REGISTRY, site: state&.site,
      prefetched: CommercePrefetcher.call, payment: frame
    ).html
  end

  # Published documents only — the same boundary the cart loop lookup uses.
  def find_region_node(node_id)
    return nil unless node_id.match?(SAFE_NODE_ID)

    Page.where(status: "published").order(:id).each do |page|
      document = page.published_document_data || page.document_data
      node = document.is_a?(Hash) ? document.dig("nodes", node_id) : nil
      next unless node.is_a?(Hash)
      next unless node.dig("actions", "region").to_s == "payment"

      return [document, node]
    end
    nil
  end

  def safe_local_or_remote(url)
    value = url.to_s
    value.start_with?("/") ? !value.start_with?("//") : value.match?(%r{\Ahttps://})
  end


  route do |r|
    r.get("stock") do
      product = Product.first(slug: r.params["product_slug"].to_s, status: "active")
      variant_sku = r.params["variant_sku"].to_s
      default_threshold = CommerceSettings.current.low_stock_threshold
      threshold = Integer(r.params.fetch("low_stock_threshold", default_threshold.to_s), exception: false)
      threshold = [[threshold || default_threshold, 0].max, 100_000].min
      response["Content-Type"] = "text/html; charset=utf-8"
      response["Cache-Control"] = "no-store"
      next stock_fragment(nil, variant_sku, threshold) unless product
      next stock_fragment(nil, variant_sku, threshold) if !variant_sku.empty? && product.variants.none? { |item| item.sku == variant_sku }

      stock_fragment(product, variant_sku, threshold)
    end

    # ── Payments ────────────────────────────────────────────────────────
    r.on("payment") do
      # The merchant's own button posts here, carrying whatever fields their
      # form contains (a phone number for an STK push, say).
      r.post("initiate") do
        order = order_for_payment
        halt_payment_error("No order to pay for.") unless order

        outcome = Payments.start(
          order: order, provider_slug: r.params["provider"].to_s, params: r.params
        )
        halt_payment_error(payment_error_message(outcome.reason)) unless outcome.ok?

        session["payment_reference"] = outcome.attempt.reference
        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-store"
        # A hosted-checkout provider sends the customer away; a poll provider
        # keeps them here and the region watches itself.
        if outcome.result.mode == :redirect && safe_local_or_remote(outcome.result.redirect_url)
          response["HX-Redirect"] = outcome.result.redirect_url
        end
        payment_region_html(r.params["node"].to_s, outcome.attempt)
      end

      # The region polls this while an attempt is in flight. Each call asks
      # the provider directly, so a callback that never arrives still resolves.
      r.get("status") do
        attempt = Payments.find_by_reference(r.params["ref"].to_s)
        halt_payment_error("That payment is no longer available.") unless attempt

        attempt = Payments.refresh(attempt)
        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-store"
        response["HX-Trigger"] = "dukafy:payment-#{attempt.status}" if attempt.terminal?
        payment_region_html(r.params["node"].to_s, attempt)
      end
    end

    r.on("cart") do
      r.post("items") do
        product = Product.first(slug: r.params["product_slug"].to_s, status: "active")
        variants = product ? product.variants : []
        sku = r.params["variant_sku"].to_s

        # No SKU supplied means the merchant's page has no variant picker —
        # which is the RIGHT design for a product with a single variant, since
        # there is no choice to present. Requiring one anyway would force a
        # <select> with exactly one option onto every simple product, and
        # without it every "Add to cart" 404s.
        #
        # More than one variant and none named IS ambiguous, and guessing
        # would silently add the wrong size. That case says so instead.
        variant = if sku.empty?
          variants.length == 1 ? variants.first : nil
        else
          variants.find { |item| item.sku == sku }
        end

        unless variant
          notice = if sku.empty? && variants.length > 1
            "Choose an option first."
          else
            "Product option not found."
          end
          halt_cart_error(404, notice)
        end

        quantity = Integer(r.params.fetch("quantity", "1"), exception: false)
        halt_cart_error(422, "Choose a valid quantity.") unless quantity&.positive?

        # Check stock against the EXISTING cart before creating one, so a
        # rejected add leaves no empty cart row behind either.
        existing = current_cart
        item = existing && CartItem.first(cart_id: existing.id, variant_id: variant.id)
        new_quantity = (item&.quantity || 0) + quantity
        halt_cart_error(409, "Only #{variant.stock} available.") if new_quantity > variant.stock

        cart = active_cart
        now = Time.now
        item ? item.update(quantity: new_quantity, updated_at: now) : CartItem.create(
          cart_id: cart.id, variant_id: variant.id, quantity:, created_at: now, updated_at: now
        )
        # 204, deliberately: this endpoint returns NO markup.
        #
        # `cart.addItem` is the one verb with no hx-target, so htmx swaps the
        # response into the element that triggered it — the merchant's own
        # button. Returning a rendered notice therefore DESTROYED their button
        # label and replaced it with Dukafy's markup, which is exactly the
        # thing this whole design refuses to do.
        #
        # htmx skips the swap on 204, so the button is left alone. The cart
        # badge and every cart region re-fetch themselves off the
        # `dukafy:cart-updated` event below, so the visitor still sees the
        # result — in the merchant's own design.
        response["HX-Trigger"] = "dukafy:cart-updated"
        response.status = 204
        nil
      end

      # Set a line to an exact quantity (not a delta — POST items is the
      # "add" verb). Quantity 0 removes the line, so a stepper stepping down
      # to nothing does the obvious thing instead of erroring.
      r.post("items", "update") do
        cart = current_cart
        variant, item = cart_line_for(cart, r.params["variant_sku"].to_s)
        halt_cart_error(404, "That item is not in your cart.") unless item

        # `delta` (a stepper's +1/-1) is resolved server-side against the
        # CURRENT quantity — the browser can't know it without racing another
        # tab, and a stepper that guesses wrong silently corrupts the cart.
        delta = r.params["delta"]
        quantity = if delta.nil? || delta.to_s.empty?
          Integer(r.params.fetch("quantity", "").to_s, exception: false)
        else
          step = Integer(delta.to_s, exception: false)
          step && (item.quantity + step)
        end
        halt_cart_error(422, "Choose a valid quantity.") if quantity.nil? || quantity.negative?
        halt_cart_error(409, "Only #{variant.stock} available.") if quantity > variant.stock

        quantity.zero? ? item.destroy : item.update(quantity: quantity, updated_at: Time.now)
        cart_line_response(r.params["node"].to_s, r.params["variant_sku"].to_s)
      end

      r.post("items", "remove") do
        cart = current_cart
        _variant, item = cart_line_for(cart, r.params["variant_sku"].to_s)
        halt_cart_error(404, "That item is not in your cart.") unless item

        item.destroy
        cart_line_response(r.params["node"].to_s, r.params["variant_sku"].to_s)
      end

      # Apply a code. Stored on the SESSION, not the cart row: applying is not
      # a purchase, and `usage_count` only moves on real order creation
      # (task 07), so a customer can try codes freely without burning them.
      r.post("discount") do
        code = r.params["code"].to_s.strip[0, 64]
        payload = CartPayload.call(current_cart)
        result = DiscountLookup.call(code, payload.dig("cart", "subtotalCents").to_i)

        unless result.ok?
          session.delete("discount_code")
          halt_cart_error(422, discount_message(result.reason))
        end

        session["discount_code"] = result.discount.code
        cart_mutation_response(r.params["node"].to_s)
      end

      r.post("discount", "remove") do
        session.delete("discount_code")
        cart_mutation_response(r.params["node"].to_s)
      end

      # cart.createOrder — the API a merchant's own checkout button posts to.
      #
      # Takes cart + identity and nothing else. Addresses, delivery notes,
      # emergency contacts and payment confirmations are custom forms attached
      # to the order afterwards, so this endpoint never grows a field list.
      #
      # Where to go next is the merchant's call, not ours: pass `redirect` and
      # we hand htmx an HX-Redirect. Omit it and you just get the event.
      r.post("order") do
        result = CreateOrder.call(
          cart: current_cart,
          email: r.params["email"], phone: r.params["phone"], name: r.params["name"],
          discount_code: session["discount_code"]
        )

        unless result.ok?
          status = result.reason == "out_of_stock" ? 409 : 422
          halt_cart_error(status, order_error_message(result))
        end

        # The cart and its code are spent.
        session.delete("discount_code")
        session.delete("cart_key")
        # Lets a thank-you page show THIS order without an account or a
        # guessable id. The token is the capability.
        session["order_token"] = result.order.public_token

        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-store"
        response["HX-Trigger"] = "dukafy:order-created"
        destination = safe_local_path(r.params["redirect"])
        response["HX-Redirect"] = destination if destination
        %(<div class="dukafy-order-created" data-order="#{CGI.escapeHTML(result.order.public_token)}"></div>)
      end

      r.get("lines") do
        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-store"
        html = cart_lines_fragment(r.params["node"].to_s)
        unless html
          request.halt([404, { "content-type" => "text/html; charset=utf-8" },
                        [%(<div class="dukafy-cart-lines dukafy-cart-lines--missing"></div>)]])
        end
        html
      end

      r.get("region") do
        response["Content-Type"] = "text/html; charset=utf-8"
        response["Cache-Control"] = "no-store"
        html = cart_region_fragment(
          r.params["node"].to_s,
          product_slug: r.params["product"].to_s,
          variant_sku: r.params["variant"].to_s,
        )
        unless html
          request.halt([404, { "content-type" => "text/html; charset=utf-8" },
                        [%(<div class="dukafy-cart-region dukafy-cart-region--missing"></div>)]])
        end
        html
      end

    end

    r.get do
      response.status = 404
      "Fragment not found"
    end
  end
end
