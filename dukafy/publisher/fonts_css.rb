class Dukafy
  module Publisher
    # `@font-face` rules and `--font-*` token variables for the site's font
    # library, from `site.settings.fonts`.
    #
    # Mirrors `dukafy-editor/src/core/fonts/css.ts`, which generates the same
    # block for the canvas. The two have to agree exactly or a merchant picks a
    # font, sees it in the editor, publishes, and it silently reverts to a
    # system font on the live site — which is precisely what happened before
    # this existed: the editor had the emitter, the Ruby publisher did not.
    #
    # Every URL points at a file we wrote under `/uploads/`. Nothing here ever
    # emits a fonts.googleapis.com or fonts.gstatic.com URL: the woff2 files are
    # downloaded once at install time and self-hosted, so a visitor's browser
    # never contacts Google. That is a privacy property of the published site,
    # so it is enforced HERE as well as at the storage boundary — a corrupted
    # site document must not be able to reintroduce a third-party request.
    class FontsCss
      CSS_FORMAT_TOKEN = {
        "woff2" => "woff2", "woff" => "woff", "ttf" => "truetype", "otf" => "opentype"
      }.freeze

      EXTENSION_FOR_FORMAT = {
        "woff2" => ".woff2", "woff" => ".woff", "ttf" => ".ttf", "otf" => ".otf"
      }.freeze

      VARIANT = /\A(\d{3})(italic)?\z/
      # The CSS spec allows `U+`, hex, dashes, commas and whitespace here. The
      # value is round-tripped verbatim into a <style> block, so anything else
      # could close the rule or the tag.
      SAFE_UNICODE_RANGE = /\A[\sUu+0-9A-Fa-f,-]+\z/

      def self.call(site)
        fonts = site.is_a?(Hash) ? site.dig("settings", "fonts") : nil
        return "" unless fonts.is_a?(Hash)

        [token_variables(fonts), font_faces(fonts)].reject(&:empty?).join("\n\n")
      end

      # The same `--font-*` declarations, for Tailwind's `@theme` block.
      #
      # Tailwind v4 generates one font-family utility per `--font-*` theme
      # entry, so this is what turns a merchant's `--font-primary` token into a
      # `font-primary` class they can actually put on an element. Without it
      # the token resolves but nothing can apply it: the Styles panel writes
      # `fontFamily` into `styleRules[].styles`, which the Ruby publisher never
      # emits.
      def self.theme_declarations(site)
        fonts = site.is_a?(Hash) ? site.dig("settings", "fonts") : nil
        return [] unless fonts.is_a?(Hash)

        tokens = fonts["tokens"]
        return [] unless tokens.is_a?(Array)

        items = fonts["items"].is_a?(Array) ? fonts["items"] : []
        sorted(tokens).filter_map do |token|
          next unless token.is_a?(Hash)

          variable = normalize_variable(token["variable"].to_s)
          next if variable.empty?

          "  --#{variable}: #{token_stack(token, items)};"
        end
      end

      # ── @font-face ────────────────────────────────────────────────────────

      def self.font_faces(fonts)
        items = fonts["items"]
        return "" unless items.is_a?(Array)

        items.flat_map do |entry|
          next [] unless entry.is_a?(Hash)

          family = entry["family"]
          files = entry["files"]
          next [] unless family.is_a?(String) && !family.empty? && files.is_a?(Array)

          files.filter_map { |file| font_face(family, file) }
        end.join("\n\n")
      end
      private_class_method :font_faces

      def self.font_face(family, file)
        return nil unless file.is_a?(Hash)

        path = file["path"].to_s
        format = file["format"].to_s
        return nil unless CSS_FORMAT_TOKEN.key?(format)
        return nil unless safe_src?(path, file["mediaAssetId"])
        return nil unless path_matches_format?(path, format)

        match = VARIANT.match(file["variant"].to_s)
        return nil unless match

        lines = [
          "@font-face {",
          %(  font-family: "#{escape(family)}";),
          "  font-style: #{match[2] ? 'italic' : 'normal'};",
          "  font-weight: #{match[1]};",
          # Text is readable in a fallback face while the woff2 downloads,
          # rather than invisible for up to three seconds.
          "  font-display: swap;",
          %(  src: url("#{escape(path)}") format("#{CSS_FORMAT_TOKEN.fetch(format)}");),
        ]
        range = unicode_range(file["unicodeRange"])
        lines << "  unicode-range: #{range};" if range
        lines << "}"
        lines.join("\n")
      end
      private_class_method :font_face

      # Two accepted shapes, matching `isSafeFontSrc` in the editor:
      #
      #   · a root-relative path under /uploads/ — what the Google installer
      #     writes and where custom uploads live
      #   · an https:// URL, but ONLY when the file carries a mediaAssetId,
      #     proving it came from our own media pipeline on a deployment whose
      #     storage adapter serves assets off another host
      #
      # An arbitrary https:// font URL is rejected: that is the no-CDN rule.
      def self.safe_src?(path, media_asset_id)
        return false if path.empty? || path.include?("..")
        return false if path.match?(/["<>\\\s]/)
        return true if path.start_with?("/uploads/")
        return media_asset_id.is_a?(String) && !media_asset_id.empty? if path.start_with?("https://")

        false
      end
      private_class_method :safe_src?

      # A self-hosted file must carry the extension its declared format
      # implies. External media URLs are exempt — a signed CDN URL need not end
      # in `.woff2`.
      def self.path_matches_format?(path, format)
        return true unless path.start_with?("/uploads/")

        path.split("?").first.to_s.downcase.end_with?(EXTENSION_FOR_FORMAT.fetch(format))
      end
      private_class_method :path_matches_format?

      def self.unicode_range(value)
        range = value.to_s.strip
        return nil if range.empty? || range.length > 2048
        return nil unless range.match?(SAFE_UNICODE_RANGE)

        range
      end
      private_class_method :unicode_range

      # ── --font-* tokens ───────────────────────────────────────────────────

      # Authored styles bind to a TOKEN, not to a family, so swapping the font
      # behind `--font-heading` re-skins every rule that used it instead of
      # requiring each one to be edited.
      def self.token_variables(fonts)
        tokens = fonts["tokens"]
        return "" unless tokens.is_a?(Array)

        items = fonts["items"].is_a?(Array) ? fonts["items"] : []
        declarations = sorted(tokens).filter_map do |token|
          next unless token.is_a?(Hash)

          variable = normalize_variable(token["variable"].to_s)
          next if variable.empty?

          "  --#{variable}: #{token_stack(token, items)};"
        end
        return "" if declarations.empty?

        ":root {\n#{declarations.join("\n")}\n}"
      end
      private_class_method :token_variables

      def self.sorted(tokens)
        tokens.each_with_index.sort_by do |token, index|
          order = token.is_a?(Hash) ? token["order"] : nil
          [order.is_a?(Numeric) ? order : 0, token.is_a?(Hash) ? token["name"].to_s : "", index]
        end.map(&:first)
      end
      private_class_method :sorted

      def self.normalize_variable(raw)
        normalized = raw.strip.sub(/\A-+/, "").downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
        return "" if normalized.empty?

        normalized.start_with?("font-") ? normalized : "font-#{normalized}"
      end
      private_class_method :normalize_variable

      def self.token_stack(token, items)
        fallback = fallback_stack(token["fallback"])
        family_id = token["familyId"]
        entry = family_id.is_a?(String) ? items.find { |item| item.is_a?(Hash) && item["id"] == family_id } : nil
        family = entry && entry["family"]
        return fallback unless family.is_a?(String) && !family.empty?

        %("#{escape(family)}", #{fallback})
      end
      private_class_method :token_stack

      def self.fallback_stack(raw)
        cleaned = raw.to_s.split(",").map { |part| part.strip.gsub(/["\\\n\r<>;{}]/, "") }.reject(&:empty?)
        cleaned.empty? ? "sans-serif" : cleaned.join(", ")
      end
      private_class_method :fallback_stack

      # The family name is merchant-controlled and lands inside both a CSS
      # string and a <style> block, so `<` and `>` go too — otherwise
      # `</style>` in a family name would terminate the tag (CWE-79).
      def self.escape(value)
        value.to_s.gsub(/["\\\n\r<>]/, "")
      end
      private_class_method :escape
    end
  end
end
