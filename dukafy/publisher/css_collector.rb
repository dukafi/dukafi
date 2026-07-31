require "digest"

class Dukafy
  module Publisher
    class CssCollector
      Bundle = Data.define(:filename, :hash, :content)

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

      def bundle(framework_css: "", page_css: "")
        content = [RESET_CSS, framework_css, to_s, sanitize(page_css)].reject(&:empty?).join("\n")
        hash = Digest::SHA256.hexdigest(content).slice(0, 12)
        Bundle.new(filename: "site-#{hash}.css", hash: hash, content: content)
      end

      private

      def sanitize(css)
        css.to_s.gsub(%r{</style}i, '<\\/style')
      end
    end
  end
end
