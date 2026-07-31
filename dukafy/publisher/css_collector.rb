class Dukafy
  module Publisher
    class CssCollector
      def initialize
        @rules = {}
      end

      def add(module_id, css)
        @rules[module_id] ||= css unless css.nil? || css.empty?
      end

      def to_s
        @rules.values.join("\n")
      end
    end
  end
end
