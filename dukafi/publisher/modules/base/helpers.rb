require "cgi"

class Dukafi
  module Publisher
    module BaseHelpers
      SAFE_SCHEMES = %w[http https mailto tel sms].freeze
      BUILTIN_TAGS = %w[div section article main header footer nav aside ul ol].freeze
      VOID_TAGS = %w[area base br col embed hr img input link meta param source track wbr].freeze
      FORBIDDEN_TAGS = %w[script iframe frame frameset object embed applet base link meta style].freeze
      TEXT_TAGS = %w[none p h1 h2 h3 h4 h5 h6 span div small strong em].freeze
      # Text-ish input types only. `file` is excluded until uploads have a
      # storage story; `image`/`submit`/`reset`/`button` are buttons wearing an
      # input costume and belong to base.button; `hidden` is excluded so a form
      # can't smuggle values the visitor never sees.
      INPUT_TYPES = %w[text email tel number password search url date time datetime-local month week color range].freeze

      module_function

      def safe_url(value)
        raw = value.to_s
        normalized = raw.gsub(/\A[\x00-\x20]+|[\x00-\x20]+\z/, "").delete("\t\n\r")
        scheme = normalized[/\A([a-zA-Z][a-zA-Z0-9+.-]*):/, 1]&.downcase
        return "#" if scheme && !SAFE_SCHEMES.include?(scheme)

        CGI.escapeHTML(raw)
      end

      def html_attributes(value)
        return "" unless value.is_a?(Hash)

        value.filter_map do |raw_name, raw_value|
          name = raw_name.to_s.downcase
          next unless name.match?(/\A[a-z][a-z0-9_.:-]*\z/)
          next if name.start_with?("on") || %w[style srcdoc nonce].include?(name)
          next unless raw_value.is_a?(String)
          next if raw_value.gsub(/[\x00-\x20]/, "").match?(/\A(?:javascript|vbscript|data):/i)

          [name, raw_value]
        end.sort_by(&:first).map { |name, value_| %( #{name}="#{CGI.escapeHTML(value_)}") }.join
      end

      def container_tag(tag, custom_tag)
        return tag.downcase if tag.is_a?(String) && BUILTIN_TAGS.include?(tag.downcase)
        return "div" unless tag == "custom" && custom_tag.is_a?(String)

        candidate = custom_tag.strip.downcase
        return "div" unless candidate.match?(/\A[a-z][a-z0-9-]{0,31}\z/)
        return "div" if FORBIDDEN_TAGS.include?(candidate)

        candidate
      end

      def text_tag(value)
        candidate = value.to_s.downcase
        TEXT_TAGS.include?(candidate) ? candidate : "p"
      end

      # A form control's `name` becomes a request parameter, so it must be a
      # plain identifier — no brackets, dots or anything that could reshape the
      # posted params into a structure the server did not expect.
      def field_name(value)
        candidate = value.to_s.strip
        candidate.match?(/\A[a-zA-Z][a-zA-Z0-9_-]{0,63}\z/) ? candidate : ""
      end

      def input_type(value)
        candidate = value.to_s.downcase
        INPUT_TYPES.include?(candidate) ? candidate : "text"
      end

      # Emit a boolean attribute only when truthy, the way HTML expects
      # (`required`, not `required="false"`).
      def flag(name, value)
        value ? " #{name}" : ""
      end

      def target(value)
        %w[_self _blank _parent].include?(value) ? value : "_self"
      end
    end
  end
end
