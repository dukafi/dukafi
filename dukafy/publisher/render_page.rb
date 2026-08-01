require "cgi"

class Dukafy
  module Publisher
    class RenderPage
      Result = Data.define(:html, :css, :body_classes)

      def self.call(document:, registry:, prefetched: {}, breakpoint_id: nil, site: nil, query_params: {}, current_entry: nil)
        new(document, registry, prefetched, breakpoint_id, site, query_params, current_entry).call
      end

      def initialize(document, registry, prefetched, breakpoint_id, site, query_params, current_entry)
        @document = document
        @registry = registry
        @prefetched = prefetched
        @breakpoint_id = breakpoint_id
        @site = site
        @query_params = query_params
        @current_entry = current_entry
        @current_product = current_entry
        @css = CssCollector.new
        @visiting = {}
        @body_classes = []
      end

      def call
        nodes = @document.fetch("nodes")
        root_id = @document.fetch("rootNodeId")
        raise ArgumentError, "root node #{root_id.inspect} is missing" unless nodes.key?(root_id)

        Result.new(html: render_node(root_id), css: @css.to_s, body_classes: @body_classes)
      end

      private

      def render_node(node_id)
        raise ArgumentError, "cycle detected at node #{node_id.inspect}" if @visiting[node_id]

        node = @document.fetch("nodes")[node_id]
        raise ArgumentError, "child node #{node_id.inspect} is missing" unless node

        @visiting[node_id] = true
        definition = @registry.fetch(node.fetch("moduleId"))
        if %w[store.relationship-loop store.collection-loop].include?(definition.id)
          return render_relationship_loop(node, definition)
        end

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
        html
      ensure
        @visiting.delete(node_id)
      end

      def render_relationship_loop(node, definition)
        props = escaped_props(interpolate_prop_tokens(resolve_dynamic_bindings(node, resolved_props(node, definition))), definition.schema)
        relationship = definition.id == "store.collection-loop" ? "products" : props.fetch("relationship", "products").to_s
        items = order_relationship_items(relationship_items(relationship, props), props)
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
          previous_entry = @current_entry
          @current_entry = item
          @current_product = relationship == "variants" ? previous_product : item
          begin
            render_node(child_ids[(child_cycle_offset + index) % child_ids.length])
          ensure
            @current_product = previous_product
            @current_entry = previous_entry
          end
        end.join
        pagination = StoreModules.collection_pagination(parameter, page, page_count)
        source_slug = props["sourceSlug"].to_s.empty? ? props["collectionSlug"].to_s : props["sourceSlug"].to_s
        html = %(<div class="dukafy-collection-loop" data-collection="#{CGI.escapeHTML(source_slug)}" data-page="#{page}">#{html_items}#{pagination}</div>)
        classes = class_names(node)
        html = inject_classes(html, classes) if classes.any?
        @css.add(definition.id, definition.render(props, [], prefetched: @prefetched)[:css])
        html
      end

      def relationship_items(relationship, props)
        if relationship == "variants"
          slug = props["sourceSlug"].to_s
          product = slug.empty? ? (@current_product || {}) : (@prefetched.dig("products", slug) || {})
          product.fetch("variants", [])
        else
          slug = props["sourceSlug"].to_s
          slug = props["collectionSlug"].to_s if slug.empty?
          # No collection picked (and no collection-template context to fall
          # back on, since that's already resolved into sourceSlug by the
          # time this runs) — pull from every active product, any collection
          # or none, rather than rendering nothing.
          return @prefetched.fetch("products", {}).values if slug.empty?

          (@prefetched.dig("collections", slug) || {}).fetch("products", [])
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
          source = binding["source"]
          entry = source == "currentEntry" ? @current_entry : nil
          next unless entry.is_a?(Hash)

          value = binding["field"].to_s.split(".").reduce(entry) do |current, field|
            current.is_a?(Hash) ? current[field] : nil
          end
          if value.nil?
            resolved[key] = "" if binding["fallback"] == "empty"
          else
            resolved[key] = value
          end
        end
      end

      # `{currentEntry.field}` (optionally `{currentEntry.field|fallback}`)
      # embedded inside a plain string prop value — the editor's
      # DynamicBindingControl "token" insert mode (used for text/textarea/url
      # controls, where a value may mix static text with a bound field, e.g.
      # "Only {currentEntry.stock} left!"). Mirrors
      # `dukafy-editor/src/core/templates/tokenInterpolation.ts`'s syntax.
      # Only `currentEntry` is resolved server-side today — `page`/`site`/
      # `route`/`parentEntry` tokens are left verbatim, same as the
      # structured `dynamicBindings` path above only ever resolves
      # `currentEntry`.
      TOKEN_PATTERN = /\{currentEntry\.([a-zA-Z0-9_.]+)(?:\|([^}]*))?\}/

      def interpolate_prop_tokens(props)
        props.transform_values { |value| interpolate_tokens(value) }
      end

      def interpolate_tokens(value)
        return value unless value.is_a?(String) && value.include?("{")

        value.gsub(TOKEN_PATTERN) do
          field_path = Regexp.last_match(1)
          fallback = Regexp.last_match(2)
          resolved = field_path.split(".").reduce(@current_entry) do |current, key|
            current.is_a?(Hash) ? current[key] : nil
          end
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

      def escaped_props(props, schema)
        props.to_h do |key, value|
          control = schema.fetch(key, {})
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
