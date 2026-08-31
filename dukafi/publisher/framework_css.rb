class Dukafi
  module Publisher
    class FrameworkCss
      SAFE_SLUG = /\A[a-zA-Z_][a-zA-Z0-9_-]*\z/
      TYPE_TAGS = %w[h1 h2 h3 h4 h5 h6 h7 p].freeze
      SCALE_STEP = {
        "h1" => "4xl",
        "h2" => "3xl",
        "h3" => "2xl",
        "h4" => "xl",
        "h5" => "l",
        "h6" => "m",
        "h7" => "s",
        "p" => "m",
      }.freeze
      TYPE_PROPS = {
        "fontFamily" => "font-family",
        "fontSize" => "font-size",
        "fontWeight" => "font-weight",
        "letterSpacing" => "letter-spacing",
        "lineHeight" => "line-height",
        "textTransform" => "text-transform",
      }.freeze
      TYPE_DEFAULTS = {
        "h1" => { "fontFamily" => "var(--font-primary)", "fontSize" => "3rem", "fontWeight" => "700", "letterSpacing" => "-0.02em", "lineHeight" => "1.15" },
        "h2" => { "fontFamily" => "var(--font-primary)", "fontSize" => "2.25rem", "fontWeight" => "700", "letterSpacing" => "-0.02em", "lineHeight" => "1.2" },
        "h3" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.875rem", "fontWeight" => "600", "letterSpacing" => "-0.015em", "lineHeight" => "1.25" },
        "h4" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.5rem", "fontWeight" => "600", "letterSpacing" => "-0.01em", "lineHeight" => "1.3" },
        "h5" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.25rem", "fontWeight" => "600", "letterSpacing" => "0", "lineHeight" => "1.35" },
        "h6" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1.125rem", "fontWeight" => "600", "letterSpacing" => "0", "lineHeight" => "1.4" },
        "h7" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1rem", "fontWeight" => "600", "letterSpacing" => "0.02em", "lineHeight" => "1.4" },
        "p" => { "fontFamily" => "var(--font-primary)", "fontSize" => "1rem", "fontWeight" => "400", "letterSpacing" => "0", "lineHeight" => "1.6" },
      }.freeze

      def self.call(site)
        [
          color_root(site),
          type_styles(site),
        ].reject(&:empty?).join("\n\n")
      end

      def self.color_root(site)
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
      private_class_method :color_root

      def self.type_styles(site)
        typography = site.dig("settings", "framework", "typography")
        return "" unless typography.is_a?(Hash)
        return "" if typography["isDisabled"]

        stored = Array(typography["styles"]).select { |row| row.is_a?(Hash) }
        by_tag = stored.each_with_object({}) { |row, index| index[row["tag"].to_s] = row }
        TYPE_TAGS.filter_map do |tag|
          row = type_defaults(tag, typography).merge(by_tag[tag] || {})
          decls = TYPE_PROPS.filter_map do |key, css|
            value = row[key].to_s.strip
            next if value.empty?
            next unless safe_value?(value)

            "  #{css}: #{value};"
          end
          next if decls.empty?

          ":where(#{tag}) {\n#{decls.join("\n")}\n}"
        end.join("\n\n")
      end
      private_class_method :type_styles

      def self.type_defaults(tag, typography)
        base = TYPE_DEFAULTS.fetch(tag)
        base.merge("fontSize" => scale_font_size(tag, typography, base["fontSize"]))
      end
      private_class_method :type_defaults

      def self.scale_font_size(tag, typography, fallback)
        group = Array(typography["groups"]).find { |row| row.is_a?(Hash) }
        return fallback unless group

        steps = group["steps"].to_s.split(",").map(&:strip)
        step = SCALE_STEP[tag]
        return fallback unless steps.include?(step)

        prefix = group["namingConvention"].to_s.strip
        prefix = "text" if prefix.empty?
        return fallback unless prefix.match?(SAFE_SLUG)

        "var(--#{prefix}-#{step}, #{fallback})"
      end
      private_class_method :scale_font_size

      def self.safe_value?(value)
        value.is_a?(String) && !value.match?(/[;{}]/) && !value.match?(%r{</style}i)
      end
      private_class_method :safe_value?
    end
  end
end
