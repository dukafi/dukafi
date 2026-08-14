# Make pasted or generated SVG safe to inline.
#
# An `<svg>` is not an image — it is markup the browser executes in the page's
# own origin. It can carry `<script>`, `on*` handlers, `javascript:` hrefs and a
# `<foreignObject>` full of arbitrary HTML. Dukafy inlines it (that is the point
# of the module: styleable, currentColor-aware icons), so it has to be cleaned
# rather than trusted.
#
# The markup arrives from a merchant pasting a logo or a language model writing
# an icon, and it bypasses the usual escaping — `escaped_props` deliberately
# leaves `:svg` props alone, because escaping would print the source as text.
# This is therefore the only thing standing between that markup and the page.
#
# Deliberately a DENY list applied to a structural rewrite, not a parser: the
# publisher has no HTML parser dependency, and the alternative — shipping
# unsanitised markup — is not a real option. Anything unrecognised survives, so
# this must be paired with the fact that SVG only reaches here from an
# authenticated admin.
class SvgSanitizer
  # Elements that execute, load, or embed something other than vector shapes.
  DANGEROUS_ELEMENTS = %w[script foreignObject iframe embed object annotation-xml].freeze

  # `javascript:` in any attribute that takes a URL, including the SVG-only
  # `xlink:href`, and `data:text/html` which navigates to attacker markup.
  DANGEROUS_URI = /(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i

  def self.call(markup)
    text = markup.to_s
    return "" if text.strip.empty?
    # Nothing outside an <svg> root has any business here.
    return "" unless text.match?(/<svg\b/i)

    DANGEROUS_ELEMENTS.each do |name|
      # Paired form, including any content between the tags...
      text = text.gsub(%r{<#{name}\b[^>]*>.*?</#{name}\s*>}mi, "")
      # ...and any self-closing or orphaned tag left behind.
      text = text.gsub(%r{</?#{name}\b[^>]*>}i, "")
    end

    # Inline event handlers: onload, onclick, onmouseover, …
    text = text.gsub(/\son[a-z]+\s*=\s*"[^"]*"/i, "")
    text = text.gsub(/\son[a-z]+\s*=\s*'[^']*'/i, "")
    text = text.gsub(/\son[a-z]+\s*=\s*[^\s>]+/i, "")

    # Any attribute whose value is a script URL. The attribute is dropped
    # whole — a partially-rewritten href is worse than none.
    text = text.gsub(/\s[\w:-]+\s*=\s*"[^"]*"/i) { |attr| attr.match?(DANGEROUS_URI) ? "" : attr }
    text = text.gsub(/\s[\w:-]+\s*=\s*'[^']*'/i) { |attr| attr.match?(DANGEROUS_URI) ? "" : attr }

    # `</style` inside the markup would close a surrounding <style> block; the
    # publisher inlines module CSS next to this output.
    text.gsub(%r{</style}i, "<\\/style")
  end
end
