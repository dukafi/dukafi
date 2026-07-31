class Dukafy
  module Publisher
    class FrameworkCss
      SAFE_SLUG = /\A[a-zA-Z_][a-zA-Z0-9_-]*\z/

      def self.call(site)
        tokens = site.dig("settings", "framework", "colors", "tokens") || []
        declarations = tokens.filter_map do |token|
          slug = token["slug"]
          value = token["lightValue"]
          next unless slug.is_a?(String) && slug.match?(SAFE_SLUG)
          next unless safe_value?(value)

          "  --#{slug}: #{value};"
        end
        return "" if declarations.empty?

        ":root {\n#{declarations.join("\n")}\n}"
      end

      def self.safe_value?(value)
        value.is_a?(String) && !value.match?(/[;{}]/) && !value.match?(%r{</style}i)
      end
      private_class_method :safe_value?
    end
  end
end
