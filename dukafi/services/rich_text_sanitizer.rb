require "cgi"

class RichTextSanitizer
  ALLOWED_TAGS = %w[p br strong em ul ol li h2 h3 blockquote a].freeze
  VOID_TAGS = %w[br].freeze
  SAFE_HREF = /\A(?:https?:|mailto:|\/|#)/i

  def self.call(html)
    html.to_s.gsub(/<!--.*?-->/m, "").gsub(/<(script|style)\b.*?<\/\1\s*>/mi, "").split(/(<[^>]*>)/m).map do |part|
      part.start_with?("<") ? sanitize_tag(part) : CGI.escapeHTML(CGI.unescapeHTML(part))
    end.join.strip
  end

  def self.sanitize_tag(tag)
    match = tag.match(/\A<\s*(\/?)\s*([a-z0-9]+)(.*?)>\z/mi)
    return CGI.escapeHTML(tag) unless match
    closing, name, attributes = match.captures
    name = name.downcase
    return "" unless ALLOWED_TAGS.include?(name)
    return "</#{name}>" if closing == "/" && !VOID_TAGS.include?(name)
    return "<br>" if name == "br"
    return "<#{name}>" unless name == "a"

    href = attributes[/\bhref\s*=\s*(["'])(.*?)\1/i, 2]
    href && SAFE_HREF.match?(href) ? %(<a href="#{CGI.escapeHTML(href)}" rel="noopener noreferrer">) : "<a>"
  end

  private_class_method :sanitize_tag
end
