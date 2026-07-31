require "cgi"

class Dukafy
  module Publisher
    class RenderPage
      Result = Data.define(:html, :css)

      def self.call(document:, registry:, prefetched: {}, breakpoint_id: nil)
        new(document, registry, prefetched, breakpoint_id).call
      end

      def initialize(document, registry, prefetched, breakpoint_id)
        @document = document
        @registry = registry
        @prefetched = prefetched
        @breakpoint_id = breakpoint_id
        @css = CssCollector.new
        @visiting = {}
      end

      def call
        nodes = @document.fetch("nodes")
        root_id = @document.fetch("rootNodeId")
        raise ArgumentError, "root node #{root_id.inspect} is missing" unless nodes.key?(root_id)

        Result.new(html: render_node(root_id), css: @css.to_s)
      end

      private

      def render_node(node_id)
        raise ArgumentError, "cycle detected at node #{node_id.inspect}" if @visiting[node_id]

        node = @document.fetch("nodes")[node_id]
        raise ArgumentError, "child node #{node_id.inspect} is missing" unless node

        @visiting[node_id] = true
        definition = @registry.fetch(node.fetch("moduleId"))
        children = node.fetch("children", []).map { |child_id| render_node(child_id) }
        props = escaped_props(resolved_props(node, definition), definition.schema)
        output = definition.render(props, children, prefetched: @prefetched, node: node)
        html = output.fetch(:html)
        @css.add(definition.id, output[:css])
        html
      ensure
        @visiting.delete(node_id)
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
    end
  end
end
