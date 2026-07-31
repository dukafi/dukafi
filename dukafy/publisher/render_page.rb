class Dukafy
  module Publisher
    class RenderPage
      Result = Data.define(:html, :css)

      def self.call(document:, registry:, prefetched: {})
        new(document, registry, prefetched).call
      end

      def initialize(document, registry, prefetched)
        @document = document
        @registry = registry
        @prefetched = prefetched
      end

      def call
        Result.new(html: "", css: "")
      end
    end
  end
end
