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
      # `form` — the outcome of the last form POST plus who is signed in, for
      # request-time rendering of a form region. NIL at bake time, exactly like
      # `cart`: a baked page belongs to no visitor, so it shows the neutral
      # state (no error, signed out) and the region corrects it.
      def self.call(document:, registry:, prefetched: {}, breakpoint_id: nil, site: nil, query_params: {}, current_entry: nil, cart: nil, payment: nil, form: nil, cart_loop_id: nil, page_paths: {})
        new(document, registry, prefetched, breakpoint_id, site, query_params, current_entry, cart, payment, form, cart_loop_id, page_paths).call
      end

      def initialize(document, registry, prefetched, breakpoint_id, site, query_params, current_entry, cart = nil, payment = nil, form = nil, cart_loop_id = nil, page_paths = {})
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
        @form = form
        # Set while rendering inside a node marked as the form region — the
        # submit button is a DESCENDANT of it, and it has to tell the server
        # which region an error belongs to.
        @form_region_id = nil
        # Whether a `base.form` is an ancestor of the node being rendered. Only
        # then is it safe to add a `submit from:closest form` trigger; htmx
        # throws on a `from:` selector that resolves to nothing.
        @inside_form = false
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
        # A cart drawer is BOTH — an overlay containing a cart region — and this
        # path returns early, so the overlay wrapping has to happen here too or
        # the drawer publishes as a plain hidden div that nothing can open.
        return apply_overlay(cart_region_placeholder(node), node) if @cart.nil? && cart_region?(node)

        # A payment button needs the id of the region it will swap, and an auth
        # button the id of the region its error renders into — but children
        # render before their parent, so both are recorded on the way DOWN.
        #
        # Deliberately NOT restored before `apply_actions` below: a node may be
        # both the region and the acting element, and it must still see itself.
        # The restore happens once, after this node is finished.
        previous_payment_region = @payment_region_id
        previous_form_region = @form_region_id
        previous_inside_form = @inside_form
        region = node.dig("actions", "region").to_s
        @payment_region_id = node.fetch("id").to_s if region == "payment"
        @form_region_id = node.fetch("id").to_s if region == "form"
        @inside_form = true if definition.id == "base.form"
        children = node.fetch("children", []).map { |child_id| render_node(child_id) }
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
        html = apply_actions(html, node, definition)
        html = apply_region(html, node)
        html = apply_overlay(html, node)
        @payment_region_id = previous_payment_region
        @form_region_id = previous_form_region
        @inside_form = previous_inside_form
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
        return form_region_attributes(html, node) if node.dig("actions", "region").to_s == "form"
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
        # Auth verbs. Dukafy ships no login form — these are what a merchant
        # points their own submit button at, and `hx-include="closest form"`
        # carries whatever fields they chose to collect.
        #
        # `account: true` means: swap nothing (the response is 204, or a 4xx
        # htmx discards — either way the merchant's button must survive), and
        # tell the server which form region an outcome belongs to.
        "account.register" => { path: "/fragments/account/register", fields: [], form: true, account: true },
        "account.login" => { path: "/fragments/account/login", fields: [], form: true, account: true },
        "account.logout" => { path: "/fragments/account/logout", fields: [], form: true, account: true },
      }.freeze

      # Overlay verbs. Unlike every other action these make NO request — the
      # sheet is already in the page, hidden. They are attributes the overlay
      # runtime reads, and they are the reason a trigger can be any node: a
      # button, a div wrapping an icon, a product image.
      OVERLAY_ACTIONS = %w[overlay.open overlay.close].freeze

      def apply_actions(html, node, definition)
        actions = node["actions"]
        return html unless actions.is_a?(Hash)

        action = actions["click"]
        return html unless action.is_a?(Hash)

        type = action["type"].to_s
        return apply_overlay_action(html, type, action) if OVERLAY_ACTIONS.include?(type)

        spec = CART_ACTIONS[type]
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
          if spec[:account]
            # Which region shows the outcome. Absent when the merchant wired no
            # form region — the event still fires, there is just nowhere to
            # render it.
            values["node"] = @form_region_id if @form_region_id
          end
          attrs = %( hx-post="#{spec[:path]}" hx-include="closest form")
          attrs += %( hx-target="#{spec[:target]}" hx-swap="outerHTML") if spec[:target]
          # No target means htmx would swap the response into the button
          # itself, replacing the merchant's own label with Dukafy's markup.
          attrs += %( hx-swap="none") if spec[:account]
          attrs += submit_trigger(definition)
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

      # A trigger for an overlay.
      #
      # `overlay.close` with no target closes the overlay it sits inside, which
      # is what a drawer's own X button wants and saves the merchant wiring a
      # node id to itself.
      def apply_overlay_action(html, type, action)
        target = action["target"].to_s
        return html if type == "overlay.open" && !target.match?(SAFE_NODE_ID)
        return html if !target.empty? && !target.match?(SAFE_NODE_ID)

        collect_runtimes([:overlay])
        attrs = %( data-dukafy-overlay-#{type.split('.').last}="#{target}")
        inject_attributes(html, attrs)
      end

      # A container marked as an overlay publishes as a native <dialog>.
      #
      # The element is the feature: the browser gives focus trapping, Escape to
      # close, a backdrop, an inert background and `aria-modal` for free, and
      # `showModal()` is the only way to get all of that without writing it.
      # The runtime we ship is therefore wiring, not an implementation.
      #
      # The merchant's own classes stay on it, so position and animation are
      # theirs; the variant only says which edge it belongs to.
      OVERLAY_VARIANTS = %w[modal sheet-left sheet-right sheet-bottom].freeze

      # A closed <dialog> is `display: none` from the UA stylesheet — but that is
      # a USER-AGENT rule, and any author `display` utility outranks it. A sheet
      # laid out with Tailwind's `flex` therefore renders permanently open, on
      # the canvas and on the live site.
      #
      # `!important` is deliberate and is the point: this has to win against
      # whatever display utility the merchant put on their own element, and
      # "is this overlay open" is not a thing their styling gets a vote on. When
      # it IS open, `[open]` excludes the rule and their classes apply normally.
      # Two jobs, and only two.
      #
      # 1. Keep it shut. A closed <dialog> is `display:none` from the USER AGENT
      #    stylesheet, and any author `display` utility outranks that — a sheet
      #    laid out with Tailwind's `flex` renders permanently open otherwise.
      #    `!important` is the point: whether an overlay is open is not
      #    something the merchant's styling gets a vote on.
      #
      # 2. Get the UA's own chrome out of the way. The default `<dialog>` has a
      #    solid border, 1em of padding, a `fit-content` size and `margin:auto`
      #    that centres it — so a sheet meant to hug the right edge floats in
      #    the middle with a border round it, and `w-full` cannot win against
      #    `max-width: calc(100% - 6px - 2em)`. Reset, so the merchant's classes
      #    are the ONLY thing deciding how it looks.
      #
      # The variant then does the one thing classes cannot: anchor it, since a
      # dialog is positioned by the UA rather than by the normal flow.
      OVERLAY_CSS = <<~CSS.gsub(/\s*\n\s*/, "").freeze
        dialog[data-dukafy-overlay]:not([open]){display:none !important}
        dialog[data-dukafy-overlay]{
          border:0;padding:0;margin:0;max-width:none;max-height:none;
          background:transparent;color:inherit;overflow:visible;
        }
        dialog[data-dukafy-overlay-variant="sheet-right"]{
          position:fixed;inset:0 0 0 auto;height:100%;
        }
        dialog[data-dukafy-overlay-variant="sheet-left"]{
          position:fixed;inset:0 auto 0 0;height:100%;
        }
        dialog[data-dukafy-overlay-variant="sheet-bottom"]{
          position:fixed;inset:auto 0 0 0;width:100%;
        }
        dialog[data-dukafy-overlay-variant="modal"]{
          position:fixed;inset:0;margin:auto;height:fit-content;width:fit-content;
        }
        dialog[data-dukafy-overlay]::backdrop{background:rgb(0 0 0 / 0.5)}
      CSS

      def apply_overlay(html, node)
        variant = node.dig("actions", "overlay").to_s
        return html unless OVERLAY_VARIANTS.include?(variant)

        node_id = node.fetch("id").to_s
        return html unless node_id.match?(SAFE_NODE_ID)

        @css.add("overlay", OVERLAY_CSS)
        collect_runtimes([:overlay])
        # Rewritten to <dialog> rather than wrapped: a wrapper would break the
        # merchant's own layout classes, which sit on this element.
        dialog = html.sub(/\A<([a-zA-Z][\w-]*)/) { "<dialog" }
                     .sub(%r{</[a-zA-Z][\w-]*>\z}, "</dialog>")
        inject_attributes(dialog, %( data-dukafy-overlay="#{node_id}" data-dukafy-overlay-variant="#{variant}"))
      end

      # Route the form's own submit through htmx as well as the button's click.
      #
      # Every `form: true` verb says "submits the form around it", but the
      # wiring only ever listened for a CLICK. Pressing Enter in a text field
      # fires `submit` on the <form> instead, which htmx never sees — so the
      # browser posted natively to the form's own action and navigated away.
      # On a login form that is not an edge case; Enter is how people sign in.
      #
      # htmx cancels the native submit for an annotated button inside a form
      # (`shouldCancel`), so clicking fires `click` and never `submit` — the
      # two paths cannot both run.
      #
      # Two conditions, both load-bearing:
      #
      #  · inside a `base.form` — htmx resolves `from:` eagerly and calls
      #    `addEventListener` on the result, so `closest form` matching nothing
      #    throws and kills every other trigger on the element.
      #
      #  · on a `base.submit` — the form fires ONE submit event, so every
      #    listening node acts on it. A sign-in and a create-account button
      #    sharing a form would both post on Enter, racing each other. The
      #    real submit button is the unambiguous owner of that event; put the
      #    secondary verb on a plain button and it stays click-only.
      def submit_trigger(definition)
        return "" unless @inside_form && definition.id == "base.submit"

        %( hx-trigger="click, submit from:closest form")
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

      # A form region is a live area like the cart's, with one deliberate
      # difference: it BAKES ITS CONTENTS instead of baking an empty shell.
      #
      # A cart region has nothing honest to show before it knows the visitor —
      # a wrong subtotal is worse than none. A form region's contents are the
      # form itself, which is the same for everybody, so blanking it would make
      # every login box flash in after load for no gain. The neutral frame (no
      # error, signed out) is the correct first paint, and `revealed` corrects
      # it for someone who is already signed in.
      FORM_REGION_EVENTS =
        "dukafy:account-updated from:body, dukafy:account-error from:body, " \
        "dukafy:form-error from:body, dukafy:form-submitted from:body".freeze

      # `revealed` belongs only on the FIRST render. htmx guards it with a
      # `data-hx-revealed` attribute stamped on the element, and an outerHTML
      # swap replaces that element with fresh markup carrying no such
      # attribute — so the guard resets, the new element is already in view,
      # and it fires again forever. See the cart region for the same trap.
      FORM_REGION_LOAD_TRIGGER = "revealed, #{FORM_REGION_EVENTS}".freeze

      def form_region_attributes(html, node)
        node_id = node.fetch("id").to_s
        return html unless node_id.match?(SAFE_NODE_ID)

        collect_runtimes([:htmx])
        # `@form` is nil exactly when this is the bake, which is also exactly
        # when the region has never fetched itself.
        trigger = @form.nil? ? FORM_REGION_LOAD_TRIGGER : FORM_REGION_EVENTS
        attrs = %( data-dukafy-form-region="#{node_id}") +
                %( hx-get="/fragments/form/region?node=#{node_id}") +
                %( hx-trigger="#{trigger}") +
                %( hx-swap="outerHTML" aria-live="polite")
        inject_attributes(html, attrs)
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
      TOKEN_SOURCES = %w[currentEntry parentEntry cart payment form].freeze
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
        # The last form outcome plus who is signed in. Populated by the form
        # region's own fragment render; nil on a baked page, where every field
        # correctly reads as "nothing has happened yet".
        when "form" then @form
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
