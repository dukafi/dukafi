require "cgi"
require "json"

class Dukafy
  module Publisher
    class RenderPage
      # `runtimes` is the set of client-side runtimes (see RuntimeScripts) the
      # rendered nodes actually asked for — the caller emits script tags for
      # those and nothing else.
      Result = Data.define(:html, :css, :body_classes, :runtimes)

      # `cart` — a CartPayload hash (`{"items" => [...], "cart" => {...}}`) for
      # request-time cart rendering. NIL at bake time, which is the point: a
      # cart is per-visitor, so a `cartItems` loop bakes as an htmx placeholder
      # and only renders real lines when the fragment endpoint re-renders that
      # same subtree with a cart in hand.
      def self.call(document:, registry:, prefetched: {}, breakpoint_id: nil, site: nil, query_params: {}, current_entry: nil, cart: nil, payment: nil, cart_loop_id: nil, page_paths: {})
        new(document, registry, prefetched, breakpoint_id, site, query_params, current_entry, cart, payment, cart_loop_id, page_paths).call
      end

      def initialize(document, registry, prefetched, breakpoint_id, site, query_params, current_entry, cart = nil, payment = nil, cart_loop_id = nil, page_paths = {})
        @document = document
        @registry = registry
        @prefetched = prefetched
        @breakpoint_id = breakpoint_id
        @site = site
        @query_params = query_params
        # An entry STACK, not a single slot: `currentEntry` is the top and
        # `parentEntry` the one beneath, so a loop nested inside another loop
        # can still reach the entity it was iterated from — a variant knowing
        # its product, an image knowing the product it belongs to.
        @cart = cart
        # The entry handed IN gets the same cart join a looped entry gets.
        # A product template page and a scoped cart region both arrive this
        # way, and without this their `currentEntry.inCart` is always false —
        # correct inside a loop, silently wrong everywhere else.
        @entry_stack = current_entry ? [with_cart_facts(current_entry, entity_of(current_entry))] : []
        @current_product = current_entry
        @payment = payment
        @payment_region_id = nil
        # Set when re-rendering ONE cart line standalone: the row's own +/-/
        # remove buttons carry the loop id, and without it they render inert.
        @cart_loop_id = cart_loop_id
        # page id -> public path, for resolving `cms:page:<id>` link targets.
        @page_paths = page_paths.is_a?(Hash) ? page_paths : {}
        @css = CssCollector.new
        @visiting = {}
        @body_classes = []
        @runtimes = []
      end

      def call
        nodes = @document.fetch("nodes")
        root_id = @document.fetch("rootNodeId")
        raise ArgumentError, "root node #{root_id.inspect} is missing" unless nodes.key?(root_id)

        html = render_node(root_id)
        Result.new(html: html, css: @css.to_s, body_classes: @body_classes, runtimes: @runtimes)
      end

      private

      def current_entry = @entry_stack.last

      def parent_entry = @entry_stack.length > 1 ? @entry_stack[-2] : nil

      def render_node(node_id)
        raise ArgumentError, "cycle detected at node #{node_id.inspect}" if @visiting[node_id]

        node = @document.fetch("nodes")[node_id]
        raise ArgumentError, "child node #{node_id.inspect} is missing" unless node

        @visiting[node_id] = true
        # Checked before ANYTHING else: a hidden node costs no render, no CSS
        # and no runtime, and its children are never walked.
        return "" unless node_visible?(node)

        definition = @registry.fetch(node.fetch("moduleId"))
        if %w[store.relationship-loop store.collection-loop].include?(definition.id)
          return render_relationship_loop(node, definition)
        end

        # A cart region's contents depend on WHO is asking, and a baked page is
        # one file served to everyone. So it bakes as an empty shell that
        # fetches itself — the same trade the cart loop already makes, lifted
        # to any node so cart-wide values (count, subtotal, total) have
        # somewhere to live OUTSIDE the per-line loop.
        return cart_region_placeholder(node) if @cart.nil? && cart_region?(node)

        # A payment button needs the id of the region it will swap, and
        # children render before their parent — so the region is recorded on
        # the way DOWN, before descending into it.
        previous_region = @payment_region_id
        @payment_region_id = node.fetch("id").to_s if node.dig("actions", "region").to_s == "payment"
        children = begin
          node.fetch("children", []).map { |child_id| render_node(child_id) }
        ensure
          @payment_region_id = previous_region unless node.dig("actions", "region").to_s == "payment"
        end
        props = escaped_props(interpolate_prop_tokens(resolve_dynamic_bindings(node, resolved_props(node, definition))), definition.schema)
        output = definition.render(props, children, prefetched: @prefetched, node: node, current_product: @current_product)
        html = output.fetch(:html)
        classes = class_names(node)
        if definition.id == "base.body"
          @body_classes = classes
        elsif classes.any?
          html = inject_classes(html, classes)
        end
        @css.add(definition.id, output[:css])
        collect_runtimes(output[:runtimes])
        html = apply_actions(html, node)
        html = apply_region(html, node)
        @payment_region_id = previous_region
        html
      ensure
        @visiting.delete(node_id)
      end

      # Union across the page, in first-seen order. Deduped because the same
      # module (or several htmx-driven ones) commonly appears many times.
      def collect_runtimes(declared)
        RuntimeScripts.normalize(declared).each do |name|
          @runtimes << name unless @runtimes.include?(name)
        end
      end

      def render_relationship_loop(node, definition)
        props = escaped_props(interpolate_prop_tokens(resolve_dynamic_bindings(node, resolved_props(node, definition))), definition.schema)
        source = loop_source(props, definition)
        # No cart in scope (baking) — emit the placeholder that fetches itself.
        return cart_lines_placeholder(node, definition) if source.start_with?("cart.") && @cart.nil?

        previous_cart_loop = @cart_loop_id
        @cart_loop_id = node.fetch("id").to_s if source.start_with?("cart.")

        items = order_relationship_items(source_items(source), props)
        skip = [Integer(props["offset"] || 0, exception: false) || 0, 0].max
        items = items.drop(skip)
        per_page = [[Integer(props["perPage"] || 12), 1].max, 100].min
        parameter = "loop_#{node.fetch('id').gsub(/[^a-zA-Z0-9_-]/, '_')}_page"
        requested_page = Integer(@query_params.fetch(parameter, "1"), exception: false) || 1
        page = [requested_page, 1].max
        page_count = [(items.length.to_f / per_page).ceil, 1].max
        page = page_count if page > page_count
        page_items = items.slice((page - 1) * per_page, per_page) || []
        child_ids = node.fetch("children", [])
        child_cycle_offset = (page - 1) * per_page
        html_items = page_items.each_with_index.map do |item, index|
          next "" if child_ids.empty?

          previous_product = @current_product
          @entry_stack.push(with_cart_facts(item, source_entity(source)))
          # A variants loop keeps the enclosing product in scope; a products
          # loop makes the item itself the product.
          # A loop over products makes each item the product in scope; a loop
          # over anything else (variants, images) keeps the enclosing one, so
          # a nested loop's children can still resolve product-bound props.
          @current_product = source_entity(source) == "product" ? item : previous_product
          begin
            row = render_node(child_ids[(child_cycle_offset + index) % child_ids.length])
            source.start_with?("cart.") ? cart_line_key(row, item) : row
          ensure
            @entry_stack.pop
            @current_product = previous_product
          end
        end.join
        source_slug = props["sourceSlug"].to_s.empty? ? props["collectionSlug"].to_s : props["sourceSlug"].to_s
        if props["wrapper"].to_s == "none"
          # No wrapping element. Required wherever HTML forbids a <div> between
          # a parent and its children — a <select> of looped <option>s being
          # the case that matters, since browsers hoist or drop the div and the
          # options stop working.
          #
          # The loop's own classes and pagination need an element to live on,
          # so both are dropped here rather than emitted somewhere invalid.
          html = html_items
        else
          pagination = StoreModules.collection_pagination(parameter, page, page_count)
          html = %(<div class="dukafy-collection-loop" data-collection="#{CGI.escapeHTML(source_slug)}" data-page="#{page}">#{html_items}#{pagination}</div>)
          classes = class_names(node)
          html = inject_classes(html, classes) if classes.any?
        end
        # Children collected their own runtimes as they rendered; this picks
        # up the loop module's own declaration.
        loop_output = definition.render(props, [], prefetched: @prefetched)
        @css.add(definition.id, loop_output[:css])
        collect_runtimes(loop_output[:runtimes])
        @cart_loop_id = previous_cart_loop
        html
      end

      # A node marked as the payment region becomes the live area the status
      # fragment swaps. While an attempt is in flight it polls itself, so a
      # lost provider callback still resolves; once terminal it stops.
      #
      # Everything inside stays the merchant's own nodes — this only adds the
      # wiring attributes around them.
      def apply_region(html, node)
        return cart_region_attributes(html, node) if cart_region?(node)
        return html unless node.dig("actions", "region").to_s == "payment"

        node_id = node.fetch("id").to_s
        return html unless node_id.match?(SAFE_NODE_ID)

        attrs = %( data-dukafy-payment="#{node_id}")
        if @payment && !@payment["terminal"]
          reference = @payment["reference"].to_s
          query = "node=#{node_id}&ref=#{CGI.escape(reference)}"
          attrs += %( hx-get="/fragments/payment/status?#{CGI.escapeHTML(query)}")
          attrs += %( hx-trigger="load delay:2s" hx-swap="outerHTML")
          collect_runtimes([:htmx])
        end
        inject_attributes(html, attrs)
      end

      # Cart verbs a merchant can attach to ANY node. Dukafy ships no stepper
      # or remove button — it ships these actions, and the merchant wires them
      # to whatever `base.button` / `base.container` they designed.
      #
      # `variant_sku` is filled from the surrounding loop iteration, which is
      # the whole reason this can't just be hand-written htmlAttributes: the
      # merchant has no way to write "this line's SKU" by hand.
      CART_ACTIONS = {
        "cart.removeItem" => { path: "/fragments/cart/items/remove", fields: [] },
        "cart.setQuantity" => { path: "/fragments/cart/items/update", fields: %w[quantity delta] },
        # Add-to-cart on ANY node. The product comes from the entry in scope
        # (a product loop, a product template) or an explicit override, and
        # the surrounding form is submitted too — so a merchant's own
        # `<select name="variant_sku">` is honoured without them having to use
        # a Dukafy variant-picker module.
        "cart.addItem" => {
          path: "/fragments/cart/items", fields: %w[quantity], form: true, product: true,
        },
        # Unlike the line verbs, checkout is NOT per-line: it needs no SKU and
        # works anywhere on the page. It submits whatever the merchant's
        # surrounding form contains, so identity fields are theirs to design.
        "cart.createOrder" => { path: "/fragments/cart/order", fields: [], form: true },
        # Submits the surrounding form (a merchant-designed phone field, say)
        # and swaps the enclosing payment region for the live status.
        "payment.initiate" => {
          path: "/fragments/payment/initiate", fields: [], form: true,
          target: "closest [data-dukafy-payment]",
        },
      }.freeze

      def apply_actions(html, node)
        actions = node["actions"]
        return html unless actions.is_a?(Hash)

        action = actions["click"]
        return html unless action.is_a?(Hash)

        spec = CART_ACTIONS[action["type"].to_s]
        return html unless spec

        if spec[:form]
          collect_runtimes([:htmx])
          values = {}
          if spec[:product]
            # Resolve the product the same way store.buy-button did, so an
            # attachable action behaves identically to the module it replaces.
            slug = action["productSlug"].to_s
            slug = @current_product.fetch("slug", "").to_s if slug.empty? && @current_product.is_a?(Hash)
            # No product in scope and none named — the node stays inert rather
            # than posting an add for nothing.
            return html if slug.empty?

            values["product_slug"] = slug
            sku = action["variantSku"].to_s
            values["variant_sku"] = sku unless sku.empty?
            spec[:fields].each do |field|
              number = Integer(action[field].to_s, exception: false)
              values[field] = number.to_s if number&.positive?
            end
            values["quantity"] ||= "1"
          end
          redirect = action["redirect"].to_s
          values["redirect"] = redirect unless redirect.empty?
          provider = action["provider"].to_s
          values["provider"] = provider unless provider.empty?
          values["node"] = @payment_region_id if spec[:target] && @payment_region_id
          attrs = %( hx-post="#{spec[:path]}" hx-include="closest form")
          attrs += %( hx-target="#{spec[:target]}" hx-swap="outerHTML") if spec[:target]
          attrs += %( hx-vals="#{CGI.escapeHTML(JSON.generate(values))}") unless values.empty?
          return inject_attributes(html, attrs)
        end

        # A line verb needs to know WHICH line. Two ways to know:
        #
        #  · inside a cart loop, `currentEntry` IS the line and carries `sku`
        #  · on a product card, `currentEntry` is a product — no sku of its
        #    own, but `with_cart_facts` resolved `cartSku` from the cart
        #
        # Without the second case a quantity stepper on a product card
        # rendered as a plain, dead <button>.
        entry = current_entry.is_a?(Hash) ? current_entry : {}
        sku = entry["sku"].to_s
        sku = entry["cartSku"].to_s if sku.empty?
        # Nothing in the cart to act on — inert beats a request that cannot
        # resolve a line.
        return html if sku.empty?

        values = { "variant_sku" => sku }
        values["node"] = @cart_loop_id if @cart_loop_id
        spec[:fields].each do |field|
          next unless action.key?(field)

          number = Integer(action[field].to_s, exception: false)
          values[field] = number.to_s if number
        end
        attrs = %( hx-post="#{spec[:path]}" hx-vals="#{CGI.escapeHTML(JSON.generate(values))}")
        attrs += if @cart_loop_id
          # In a cart list: swap just this row (see `cart_line_fragment`).
          %( hx-target="closest [data-dukafy-cart-line]" hx-swap="outerHTML")
        else
          # Outside a list there is no row to replace. Swap nothing and let the
          # `dukafy:cart-line-updated` event the endpoint fires bring the
          # enclosing cart region back with the new state.
          %( hx-swap="none")
        end
        collect_runtimes([:htmx])
        inject_attributes(html, attrs)
      end

      # Insert attributes into the opening tag of `html`, mirroring how
      # `inject_classes` splices into the first element.
      def inject_attributes(html, attrs)
        html.sub(/<([a-zA-Z][\w-]*)/) { "<#{Regexp.last_match(1)}#{attrs}" }
      end

      # Baked stand-in for a cart loop. Carries only the node id — the fragment
      # endpoint looks the subtree up by it and re-renders this same loop with
      # the visitor's cart. Deliberately contains NO cart data: the baked page
      # is served from disk to every visitor alike.
      def cart_lines_placeholder(node, definition)
        node_id = node.fetch("id").to_s
        return "" unless node_id.match?(SAFE_NODE_ID)

        loop_output = definition.render({}, [], prefetched: @prefetched)
        @css.add(definition.id, loop_output[:css])
        collect_runtimes([:htmx])
        html = %(<div class="dukafy-cart-lines dukafy-cart-lines--loading" data-node="#{node_id}" hx-get="/fragments/cart/lines?node=#{node_id}" hx-trigger="revealed, dukafy:cart-updated from:body" hx-swap="outerHTML" aria-live="polite"></div>)
        classes = class_names(node)
        classes.any? ? inject_classes(html, classes) : html
      end

      SAFE_NODE_ID = /\A[A-Za-z0-9_-]{1,64}\z/
      SAFE_SKU = /\A[A-Za-z0-9._-]{1,64}\z/

      # Stamp a CART line with its own identity. Cart-only on purpose: a
      # variant row also carries a `sku`, and a variants loop rendering
      # `<option>`s has no mutation path — stamping those would be noise in the
      # markup and, in a `<select>`, noise the browser has to carry.
      #
      # Loop rows are otherwise anonymous <div>s, so the only way to update one
      # was to re-render the WHOLE list — every row rebuilt to change a single
      # quantity, losing focus and scroll position with it. The SKU is the
      # natural key: unique within a cart, already what the mutation endpoints
      # take, and stable across re-renders.
      def cart_line_key(html, item)
        return html unless item.is_a?(Hash)

        sku = item["sku"].to_s
        return html unless sku.match?(SAFE_SKU)

        inject_attributes(html, %( data-dukafy-cart-line="#{CGI.escapeHTML(sku)}"))
      end

      def cart_region?(node)
        node.dig("actions", "region").to_s == "cart"
      end

      # The wiring that makes a cart region live. The endpoint is the same on
      # both sides of the swap; the TRIGGER deliberately is not.
      #
      # `revealed` belongs only on the baked placeholder, which swaps itself
      # away the first time it fires. htmx guards that trigger with a
      # `data-hx-revealed` attribute it stamps onto the element — but an
      # outerHTML swap replaces that element with fresh server markup carrying
      # no such attribute, so the guard resets, the new element is already in
      # view, and it fires again immediately. Putting `revealed` on the
      # response is therefore an infinite request loop, not a refresh.
      #
      # The rendered region only needs to hear about cart CHANGES, and that
      # event arrives via HX-Trigger from the mutation endpoints — it is never
      # a consequence of the swap itself, so it cannot feed back.
      # A region inside a loop must say WHICH entry it belongs to. Every card
      # in a products grid shares one node id, so the id alone would make all
      # of them render the same anonymous subtree — every card showing the
      # same product's cart state.
      def cart_region_scope
        parts = []
        slug = @current_product.is_a?(Hash) ? @current_product["slug"].to_s : ""
        parts << "product=#{CGI.escape(slug)}" unless slug.empty?
        sku = current_entry.is_a?(Hash) ? current_entry["sku"].to_s : ""
        parts << "variant=#{CGI.escape(sku)}" unless sku.empty?
        parts
      end

      def cart_region_wiring(node_id, trigger:)
        query = (["node=#{node_id}"] + cart_region_scope).join("&")
        %( data-dukafy-cart-region="#{node_id}") +
          %( hx-get="/fragments/cart/region?#{CGI.escapeHTML(query)}") +
          %( hx-trigger="#{trigger}") +
          %( hx-swap="outerHTML" aria-live="polite")
      end

      CART_REGION_LOAD_TRIGGER = "revealed, dukafy:cart-updated from:body, dukafy:cart-line-updated from:body".freeze
      CART_REGION_LIVE_TRIGGER = "dukafy:cart-updated from:body, dukafy:cart-line-updated from:body".freeze

      # Baked stand-in for a cart region: the node's own classes so layout does
      # not collapse, and nothing else. The subtree is deliberately NOT
      # rendered — every value in it would be a guess about a visitor the baker
      # has never met, and a wrong subtotal on screen is worse than none.
      def cart_region_placeholder(node)
        node_id = node.fetch("id").to_s
        return "" unless node_id.match?(SAFE_NODE_ID)

        collect_runtimes([:htmx])
        html = %(<div class="dukafy-cart-region dukafy-cart-region--loading"#{cart_region_wiring(node_id, trigger: CART_REGION_LOAD_TRIGGER)}></div>)
        classes = class_names(node)
        classes.any? ? inject_classes(html, classes) : html
      end

      def cart_region_attributes(html, node)
        node_id = node.fetch("id").to_s
        return html unless node_id.match?(SAFE_NODE_ID)

        collect_runtimes([:htmx])
        inject_attributes(html, cart_region_wiring(node_id, trigger: CART_REGION_LIVE_TRIGGER))
      end

      # A loop's SOURCE is a path, not a fixed relationship.
      #
      #   products                        every active product
      #   collections/featured.products   one collection's products
      #   products/canvas-bag.variants    one product's variants
      #   currentEntry.images             a list field of the entity in scope
      #   currentEntry.variants
      #   cart.items
      #
      # The relative form is what makes nesting composable: loop a list field
      # and the entity in scope becomes that field's item type, whose own list
      # fields can be looped in turn. Field names are the ones
      # CommercePrefetcher emits, checked against the declared entity schema by
      # `spec/publisher/commerce_entities_spec.rb`.
      def loop_source(props, definition)
        explicit = props["source"].to_s
        return explicit unless explicit.empty?

        # Documents authored before `source` existed carry relationship +
        # sourceSlug. Map them rather than migrating anything on disk.
        relationship = definition.id == "store.collection-loop" ? "products" : props.fetch("relationship", "products").to_s
        slug = (props["sourceSlug"].to_s.empty? ? props["collectionSlug"].to_s : props["sourceSlug"].to_s)
        case relationship
        when "cartItems" then "cart.items"
        when "variants" then slug.empty? ? "currentEntry.variants" : "products/#{slug}.variants"
        else slug.empty? ? "products" : "collections/#{slug}.products"
        end
      end

      # The entity a source yields, from its last segment. Used to decide
      # whether iterating changes the product in scope.
      SOURCE_ENTITIES = {
        "products" => "product", "variants" => "variant",
        "images" => "image", "items" => "cartItem",
      }.freeze

      def source_entity(source)
        SOURCE_ENTITIES[source.split(".").last.to_s.split("/").first.to_s] || "unknown"
      end

      def source_items(source)
        segments = source.split(".")
        root = segments.first.to_s
        # `products` / `collections` alone mean "all of them".
        return @prefetched.fetch(root, {}).values if segments.length == 1 && %w[products collections].include?(root)

        value = source_root(root)
        segments.drop(1).each do |field|
          value = value.is_a?(Hash) ? value[field] : nil
        end
        value.is_a?(Array) ? value : []
      end

      def source_root(root)
        kind, slug = root.split("/", 2)
        case kind
        when "products"
          # Bare `products` is the whole catalogue; `products/<slug>` is one.
          slug ? (@prefetched.dig("products", slug) || {}) : { "products" => @prefetched.fetch("products", {}).values }
        when "collections"
          slug ? (@prefetched.dig("collections", slug) || {}) : { "collections" => @prefetched.fetch("collections", {}).values }
        when "currentEntry" then current_entry
        when "parentEntry" then parent_entry
        when "cart" then @cart
        end
      end

      # Absent/"manual" keeps the stored (drag-order/position) sequence
      # untouched — the default, and the only path old documents (predating
      # these props) ever take, preserving byte-identical golden output.
      RELATIONSHIP_SORT_KEYS = {
        "price" => ->(item) { item["priceCents"] || 0 },
        "title" => ->(item) { item["title"].to_s.downcase },
        "newest" => ->(item) { item["createdAt"] || 0 },
      }.freeze

      def order_relationship_items(items, props)
        key = RELATIONSHIP_SORT_KEYS[props["orderBy"].to_s]
        return items unless key

        sorted = items.each_with_index.sort_by { |item, index| [key.call(item), index] }.map(&:first)
        props["direction"].to_s == "desc" ? sorted.reverse : sorted
      end

      def resolve_dynamic_bindings(node, props)
        node.fetch("dynamicBindings", {}).each_with_object(props.dup) do |(key, binding), resolved|
          entry = binding_frame(binding["source"])
          next unless entry.is_a?(Hash)

          value = dig_frame(entry, binding["field"])
          if value.nil?
            resolved[key] = "" if binding["fallback"] == "empty"
          else
            resolved[key] = value
          end
        end
      end

      # `{source.field}` (optionally `{source.field|fallback}`)
      # embedded inside a plain string prop value — the editor's
      # DynamicBindingControl "token" insert mode (used for text/textarea/url
      # controls, where a value may mix static text with a bound field, e.g.
      # "Only {currentEntry.stock} left!"). Mirrors
      # `dukafy-editor/src/core/templates/tokenInterpolation.ts`'s syntax.
      # Every source `binding_frame` can resolve. `page`/`site`/`route` have no
      # server-side frames yet, so those tokens are deliberately left verbatim
      # rather than silently blanked — an unresolvable token should look
      # unresolved, not like empty content.
      TOKEN_SOURCES = %w[currentEntry parentEntry cart payment].freeze
      TOKEN_PATTERN = /\{(#{TOKEN_SOURCES.join('|')})\.([a-zA-Z0-9_.]+)(?:\|([^}]*))?\}/

      # The frame a binding source reads from. Shared by structured
      # `dynamicBindings` and inline `{source.field}` tokens so the two forms
      # can never resolve differently — a token that worked as a binding but
      # rendered literally as text was exactly that bug.
      def binding_frame(source)
        case source.to_s
        when "currentEntry" then current_entry
        # One frame down the stack — how a node inside a nested loop reads the
        # entity the OUTER loop is on.
        when "parentEntry" then parent_entry
        when "cart" then @cart && @cart["cart"]
        # The in-flight attempt. Only populated where a payment is in scope
        # (the status fragment), so on a baked page these fall back.
        when "payment" then @payment
        end
      end

      # What the visitor's cart says about the entity currently being looped.
      #
      # These are DERIVED, not stored: a product row knows nothing about a
      # cart, so the two are joined here, once, and exposed as ordinary fields
      # on `currentEntry`. That is what lets a merchant write
      # `{currentEntry.cartQuantity}` and condition a node on
      # `currentEntry.inCart` without any cart-specific module.
      #
      # Absent when no cart is in scope (baking), which reads as falsy — so a
      # baked page shows the "not in cart" branch, the correct default for
      # someone who has not added anything. The cart region then corrects it.
      # Which entity a loose hash is, for entries that did not come from a loop
      # (a product template's entry, a scoped cart region's). Keyed on fields
      # only that entity has, most specific first — a cart line carries both a
      # sku and a productSlug, so it has to be ruled out before `variant`.
      def entity_of(item)
        return nil unless item.is_a?(Hash)
        return "cartItem" if item.key?("linePriceCents")
        return "variant" if item.key?("sku")
        return "product" if item.key?("slug")

        nil
      end

      def with_cart_facts(item, entity)
        return item unless @cart.is_a?(Hash) && item.is_a?(Hash)

        lines = @cart["items"] || []
        # The SKU of the cart line this entity resolves to, so the quantity
        # verbs work on a PRODUCT card too — there `currentEntry` is a product,
        # which has variants rather than a sku, and without this the -/+/remove
        # buttons rendered inert.
        matched_sku = nil
        quantity = case entity
        when "product"
          slug = item["slug"].to_s
          return item if slug.empty?

          mine = lines.select { |line| line["productSlug"].to_s == slug }
          # A product with several variants in the cart has several lines; the
          # first is the only unambiguous choice from a product alone.
          matched_sku = mine.first&.fetch("sku", nil)
          mine.sum { |line| line["quantity"].to_i }
        when "variant"
          sku = item["sku"].to_s
          return item if sku.empty?

          lines.sum { |line| line["sku"].to_s == sku ? line["quantity"].to_i : 0 }
        when "cartItem"
          item["quantity"].to_i
        else
          return item
        end

        facts = { "cartQuantity" => quantity, "inCart" => quantity.positive? }
        facts["cartSku"] = matched_sku if matched_sku
        item.merge(facts)
      end

      # Walk a dotted field path through a frame. One implementation, because
      # bindings, tokens and conditions must agree on what `a.b.c` means.
      def dig_frame(frame, field_path)
        field_path.to_s.split(".").reduce(frame) do |current, key|
          current.is_a?(Hash) ? current[key] : nil
        end
      end

      def frame_value(source, field_path)
        dig_frame(binding_frame(source), field_path)
      end

      # What counts as "yes" for a condition.
      #
      # Deliberately treats a missing value, 0 and "" as false, so
      # `currentEntry.inCart` behaves sanely before any cart exists and
      # `currentEntry.cartQuantity` can be conditioned on directly. "false"
      # as a STRING is included because props round-trip through JSON and
      # HTML attributes, where booleans routinely arrive stringified.
      FALSEY = [nil, false, 0, "", "0", "false", [], {}].freeze

      def truthy?(value)
        !FALSEY.include?(value)
      end

      CONDITION_OPERATORS = %w[
        isTrue isFalse equals notEquals greaterThan lessThan isEmpty isNotEmpty
      ].freeze

      # A node may declare ONE condition; false means it renders nothing at
      # all — no empty wrapper, no stray classes. This is the third overlay
      # alongside `dynamicBindings` (where data comes from) and `actions`
      # (what the node does): whether the node is there at all.
      def node_visible?(node)
        condition = node["visibleWhen"]
        return true unless condition.is_a?(Hash)

        operator = condition["operator"].to_s
        # An unrecognised operator renders the node rather than hiding it.
        # Silently vanishing content is the worse failure: it looks like the
        # node was deleted, with nothing to debug.
        return true unless CONDITION_OPERATORS.include?(operator)

        actual = frame_value(condition["source"], condition["field"])
        expected = condition["value"]
        case operator
        when "isTrue" then truthy?(actual)
        when "isFalse" then !truthy?(actual)
        when "isNotEmpty" then truthy?(actual)
        when "isEmpty" then !truthy?(actual)
        when "equals" then actual.to_s == expected.to_s
        when "notEquals" then actual.to_s != expected.to_s
        when "greaterThan" then actual.to_f > expected.to_f
        when "lessThan" then actual.to_f < expected.to_f
        end
      end

      def interpolate_prop_tokens(props)
        props.transform_values { |value| interpolate_tokens(value) }
      end

      def interpolate_tokens(value)
        return value unless value.is_a?(String) && value.include?("{")

        value.gsub(TOKEN_PATTERN) do
          source = Regexp.last_match(1)
          field_path = Regexp.last_match(2)
          fallback = Regexp.last_match(3)
          resolved = frame_value(source, field_path)
          if resolved.nil? || resolved == ""
            fallback || ""
          else
            resolved.to_s
          end
        end
      end

      def resolved_props(node, definition)
        props = definition.defaults.merge(node.fetch("props", {}))
        return props unless @breakpoint_id

        overrides = node.fetch("breakpointOverrides", {}).fetch(@breakpoint_id, {})
        allowed = overrides.select do |key, _value|
          definition.schema.fetch(key, {})[:breakpoint_overridable] == true
        end
        props.merge(allowed)
      end

      # The editor stores a link to another PAGE as `cms:page:<id>`, not as a
      # path — so renaming a page's slug never breaks the links into it. The
      # publisher has to turn that back into a URL; left alone, `safe_url`
      # sees an unknown `cms:` scheme and renders `#`, which is exactly what a
      # link to a page looked like on a published site.
      PAGE_REF = /\Acms:page:([A-Za-z0-9_-]+)(#.*)?\z/

      def resolve_page_ref(value)
        match = PAGE_REF.match(value)
        return value unless match

        path = @page_paths[match[1]]
        # A ref whose page was deleted has no honest destination. `#` at least
        # stays on the page rather than 404ing.
        return "#" unless path

        "#{path}#{match[2]}"
      end

      def escaped_props(props, schema)
        props.to_h do |key, value|
          control = schema.fetch(key, {})
          value = resolve_page_ref(value) if control[:type] == :url && value.is_a?(String)
          safe_value = if value.is_a?(String) && !%i[url image media richtext svg].include?(control[:type])
            CGI.escapeHTML(value)
          else
            value
          end
          [key, safe_value]
        end
      end

      def class_names(node)
        rules = @site && @site["styleRules"]
        return [] unless rules.is_a?(Hash)

        node.fetch("classIds", []).filter_map do |id|
          name = rules.dig(id, "name")
          name if name.is_a?(String) && !name.empty?
        end
      end

      def inject_classes(html, classes)
        escaped = classes.map { |name| CGI.escapeHTML(name) }.join(" ")
        html.sub(/<([a-zA-Z][\w-]*)([^>]*)>/) do |tag|
          if tag.match?(/\bclass="[^"]*"/)
            tag.sub(/\bclass="([^"]*)"/, %(class="#{escaped} \\1"))
          else
            tag.sub(/\A<([a-zA-Z][\w-]*)/, %(<\\1 class="#{escaped}"))
          end
        end
      end
    end
  end
end
