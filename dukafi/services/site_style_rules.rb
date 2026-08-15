# Turning class NAMES into the class IDS a node document actually carries.
#
# A node's `classIds` are handles into the site's `styleRules` registry, not
# class names: the publisher resolves each id to `rules[id]["name"]` and drops
# anything it cannot find. So a document seeded server-side with
# `classIds: ["flex", "gap-4"]` renders with no classes at all — silently,
# because an unknown id is indistinguishable from a deleted rule.
#
# That is exactly what happened to the first seeded header and to the order
# template: correct-looking Tailwind in the source, completely unstyled on the
# storefront.
#
# Registering the rule is also what gets the class COMPILED — `DeclaredClassNames`
# reads the registry, not the documents, to decide which Tailwind utilities the
# bundle needs. A name that is not registered would not have its CSS generated
# even if the id resolved.
class SiteStyleRules
  # Matches the ids the editor's importer produces (`mx-auto` → `tw-mx_auto`),
  # so a seeded rule and an imported one for the same class collapse onto one
  # entry rather than two rules with the same name.
  def self.id_for(name) = "tw-#{name.gsub(/[^a-zA-Z0-9]/, '_')}"

  # Ensure every name has a rule, and return name => id.
  #
  # An existing rule with the same NAME wins over the generated id, because the
  # editor may already have registered that class under an id of its own and
  # two rules rendering `.flex` would be one too many.
  def self.ensure!(names, state: SiteState.first)
    return {} if state.nil?

    site = state.site
    return {} unless site.is_a?(Hash)

    rules = site["styleRules"].is_a?(Hash) ? site["styleRules"].dup : {}
    by_name = rules.each_with_object({}) do |(id, rule), index|
      key = rule.is_a?(Hash) ? rule["name"].to_s : ""
      index[key] ||= id unless key.empty?
    end

    now = (Time.now.to_f * 1000).to_i
    order = rules.length
    mapping = {}

    Array(names).uniq.each do |name|
      clean = name.to_s.strip
      next if clean.empty?

      if (existing = by_name[clean])
        mapping[clean] = existing
        next
      end

      id = id_for(clean)
      rules[id] = {
        "id" => id, "name" => clean, "kind" => "class", "selector" => ".#{clean}",
        "order" => order, "styles" => {}, "contextStyles" => {},
        "createdAt" => now, "updatedAt" => now,
      }
      by_name[clean] = id
      mapping[clean] = id
      order += 1
    end

    if rules.length != (site["styleRules"] || {}).length
      state.site = site.merge("styleRules" => rules)
      state.save
    end

    mapping
  end

  # Rewrite a document's `classIds` from names to ids, registering any name the
  # site does not have yet. Documents can then be authored with readable
  # Tailwind and still publish correctly.
  def self.resolve_document!(document, state: SiteState.first)
    nodes = document["nodes"]
    return document unless nodes.is_a?(Hash)

    names = nodes.each_value.flat_map { |node| Array(node["classIds"]) }.map(&:to_s)
    mapping = ensure!(names, state: state)
    return document if mapping.empty?

    resolved = nodes.transform_values do |node|
      ids = Array(node["classIds"]).filter_map { |name| mapping[name.to_s] }
      node.merge("classIds" => ids)
    end
    document.merge("nodes" => resolved)
  end
end
