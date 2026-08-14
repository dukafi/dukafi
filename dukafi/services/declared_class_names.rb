# Every class name a document COULD render, not just the ones it did.
#
# Tailwind only emits a utility it has seen used, and the publisher hands it
# the rendered HTML. That misses two whole categories, both of which arrive
# later from a fragment endpoint — after the stylesheet has been written:
#
#   · anything inside a cart region, which bakes as an empty placeholder
#   · the losing side of every `visibleWhen` condition
#
# A product card with an "Add to cart" button and a −/count/+ stepper hits
# both at once: whichever branch is hidden at bake time, and the whole region
# on a page with no visitor, ship with class attributes and no CSS behind them.
#
# So the bake also collects the class names DECLARED on nodes, resolved through
# the site's style rules exactly the way `RenderPage#class_names` resolves them
# at render time. Unused utilities cost a few bytes; missing ones cost a
# visibly broken page.
class DeclaredClassNames
  # `documents` — any enumerable of page documents (`{"nodes" => {...}}`).
  # `site`      — the site document, for its `styleRules` map.
  def self.call(documents, site)
    rules = site.is_a?(Hash) ? site["styleRules"] : nil
    return [] unless rules.is_a?(Hash)

    names = documents.flat_map do |document|
      nodes = document.is_a?(Hash) ? document["nodes"] : nil
      next [] unless nodes.is_a?(Hash)

      nodes.each_value.flat_map do |node|
        next [] unless node.is_a?(Hash)

        Array(node["classIds"]).filter_map do |id|
          name = rules.dig(id, "name")
          name if name.is_a?(String) && !name.empty?
        end
      end
    end

    # A rule's `name` may itself hold several utilities; split so Tailwind sees
    # each candidate individually.
    names.flat_map(&:split).uniq
  end
end
