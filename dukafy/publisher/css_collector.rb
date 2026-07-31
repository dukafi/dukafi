class Dukafy
  module Publisher
    class CssCollector
      def initialize
        @rules = {}
      end

      def add(module_id, css)
        return if css.nil? || css.empty? || @rules.key?(module_id)

        @rules[module_id] = css.gsub(%r{</style}i, '<\\/style')
      end

      def to_s
        @rules.values.join("\n")
      end
    end
  end
end
