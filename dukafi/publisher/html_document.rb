require "cgi"

class Dukafi
  module Publisher
    class HtmlDocument
      # `runtimes` — the client-side runtimes this page actually needs (see
      # RuntimeScripts), normally straight from RenderPage::Result#runtimes.
      # Empty means the page ships no JavaScript at all.
      #
      # `json_ld` is a Hash (CollectionPage / Product) encoded as one script
      # tag. Nil skips the tag so a PDP without markup stays script-free.
      def self.call(title:, body:, language: "en", description: nil, css_href: nil, css: nil,
                    body_classes: [], runtimes: [], json_ld: nil, robots: nil, canonical: nil,
                    open_graph: nil)
        description_tag = description ? %(<meta name="description" content="#{CGI.escapeHTML(description)}">) : ""
        robots_tag = robots ? %(<meta name="robots" content="#{CGI.escapeHTML(robots)}">) : ""
        canonical_tag = canonical ? %(<link rel="canonical" href="#{CGI.escapeHTML(canonical)}">) : ""
        og_tags = open_graph.to_s
        stylesheet = if css_href
          %(<link rel="stylesheet" href="#{CGI.escapeHTML(css_href)}">)
        elsif css && !css.empty?
          "<style>#{css.gsub(%r{</style}i, '<\\/style')}</style>"
        else
          ""
        end
        class_attr = body_classes.empty? ? "" : %( class="#{body_classes.map { |name| CGI.escapeHTML(name) }.join(' ')}")
        scripts = RuntimeScripts.tags(runtimes)
        json_ld_tag = ListingJsonLd.script_tag(json_ld)
        %(<!doctype html><html lang="#{CGI.escapeHTML(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>#{CGI.escapeHTML(title)}</title>#{description_tag}#{robots_tag}#{canonical_tag}#{og_tags}#{stylesheet}#{scripts}#{json_ld_tag}</head><body#{class_attr}>#{body}</body></html>)
      end
    end
  end
end
