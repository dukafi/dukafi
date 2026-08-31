# Stable section identity on a page tree.
#
# Editor node ids are assigned on HTML import and change when a fragment is
# replaced. The HTML `id` / `data-section-id` on a section does not. MCP
# exposes that string so any agent — Dukafi AI or a third party — can target
# `home__hero_banner` later without holding a UUID.
#
# This module does not plan sections or generate HTML. It only reads and
# resolves the identity an author (or harness) already stamped.
module SectionIdentity
  module_function

  def of(node)
    keyed = attributes(node)
    sid = keyed["data-section-id"].to_s.strip
    sid = keyed["id"].to_s.strip if sid.empty?
    sid
  end

  def find_node(document, section_id)
    needle = section_id.to_s.strip
    return nil if needle.empty?

    nodes = document.is_a?(Hash) ? document["nodes"] : nil
    return nil unless nodes.is_a?(Hash)

    ordered(document, nodes).find { |node| matches?(node, needle) }
  end

  def resolve_node_id!(document, node_id: nil, section_id: nil)
    sid = section_id.to_s.strip
    unless sid.empty?
      node = find_node(document, sid)
      raise ArgumentError, "No section #{sid.inspect}. Call list_children to see sectionId values." if node.nil?

      return node["id"].to_s
    end

    nid = node_id.to_s.strip
    return nid unless nid.empty?

    document["rootNodeId"].to_s
  end

  def matches?(node, section_id)
    keyed = attributes(node)
    keyed["data-section-id"].to_s.strip == section_id || keyed["id"].to_s.strip == section_id
  end

  def attributes(node)
    return {} unless node.is_a?(Hash)

    attrs = node.dig("props", "htmlAttributes")
    return {} unless attrs.is_a?(Hash)

    attrs.each_with_object({}) { |(key, value), acc| acc[key.to_s.downcase] = value.to_s }
  end
  private_class_method :attributes

  def ordered(document, nodes)
    root = document["rootNodeId"].to_s
    return nodes.values unless nodes[root]

    listed = []
    seen = {}
    walk = lambda do |id|
      node = nodes[id]
      return if node.nil? || seen[id]

      seen[id] = true
      listed << node
      Array(node["children"]).each { |child| walk.call(child) }
    end
    walk.call(root)
    listed.concat(nodes.values.reject { |node| seen[node["id"].to_s] })
    listed
  end
  private_class_method :ordered
end
