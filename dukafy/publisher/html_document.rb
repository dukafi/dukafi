require "cgi"

class Dukafy
  module Publisher
    class HtmlDocument
      def self.call(title:, body:, language: "en", description: nil, css_href: nil, css: nil, body_classes: [])
        description_tag = description ? %(<meta name="description" content="#{CGI.escapeHTML(description)}">) : ""
        stylesheet = if css_href
          %(<link rel="stylesheet" href="#{CGI.escapeHTML(css_href)}">)
        elsif css && !css.empty?
          "<style>#{css.gsub(%r{</style}i, '<\\/style')}</style>"
        else
          ""
        end
        class_attr = body_classes.empty? ? "" : %( class="#{body_classes.map { |name| CGI.escapeHTML(name) }.join(' ')}")
        %(<!doctype html><html lang="#{CGI.escapeHTML(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>#{CGI.escapeHTML(title)}</title>#{description_tag}#{stylesheet}</head><body#{class_attr}>#{body}</body></html>)
      end
    end
  end
end
