class Dukafi
  module Publisher
    ModuleDefinition = Data.define(:id, :schema, :defaults, :renderer) do
      def render(props, children, context = {})
        renderer.call(props, children, context)
      end
    end

    class Registry
      def initialize
        @definitions = {}
      end

      def register(id, schema: {}, defaults: {}, &renderer)
        raise ArgumentError, "renderer is required" unless renderer

        @definitions[id] = ModuleDefinition.new(
          id: id, schema: schema, defaults: defaults, renderer: renderer
        )
        self
      end

      def fetch(id)
        @definitions.fetch(id)
      end

      def key?(id)
        @definitions.key?(id)
      end
    end

    REGISTRY = Registry.new
  end
end
