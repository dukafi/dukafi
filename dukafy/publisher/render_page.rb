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
        return render_collection_loop(node, definition) if definition.id == "store.collection-loop"

        children = node.fetch("children", []).map { |child_id| render_node(child_id) }
        props = escaped_props(resolve_dynamic_bindings(node, resolved_props(node, definition)), definition.schema)
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

      def render_collection_loop(node, definition)
        props = escaped_props(resolve_dynamic_bindings(node, resolved_props(node, definition)), definition.schema)
        collection = @prefetched.dig("collections", props["collectionSlug"]) || {}
        products = collection.fetch("products", [])
        per_page = [[Integer(props["perPage"] || 12), 1].max, 100].min
        parameter = "loop_#{node.fetch('id').gsub(/[^a-zA-Z0-9_-]/, '_')}_page"
        requested_page = Integer(@query_params.fetch(parameter, "1"), exception: false) || 1
        page = [requested_page, 1].max
        page_count = [(products.length.to_f / per_page).ceil, 1].max
        page = page_count if page > page_count
        page_products = products.slice((page - 1) * per_page, per_page) || []
        variants = node.fetch("children", [])
        offset = (page - 1) * per_page
        html_items = page_products.each_with_index.map do |product, index|
          next "" if variants.empty?

          previous = @current_product
          previous_entry = @current_entry
          @current_product = product
          @current_entry = product
          begin
            render_node(variants[(offset + index) % variants.length])
          ensure
            @current_product = previous
            @current_entry = previous_entry
          end
        end.join
        pagination = StoreModules.collection_pagination(parameter, page, page_count)
        html = %(<div class="dukafy-collection-loop" data-collection="#{CGI.escapeHTML(props['collectionSlug'].to_s)}" data-page="#{page}">#{html_items}#{pagination}</div>)
        classes = class_names(node)
        html = inject_classes(html, classes) if classes.any?
        @css.add(definition.id, definition.render(props, [], prefetched: @prefetched)[:css])
        html
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
