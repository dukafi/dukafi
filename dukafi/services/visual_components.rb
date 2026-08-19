require "cgi"
require "json"
require "securerandom"

# Reusable visual components — the newsletter form you drop on Contacts
# and About, edited once, published everywhere.
#
# Stored on `site_states.site_json` under `visualComponents`, NOT in the
# editor's SiteShell. GET /admin/api/cms/site strips them; GET /components
# returns DataRow shapes the editor already speaks. PUT site-document
# merges `changedComponents` / `deletedComponentIds`.
module VisualComponents
  module_function

  def roster(site)
    Array(site.is_a?(Hash) ? site["visualComponents"] : nil).select { |row| row.is_a?(Hash) && row["id"].to_s.strip != "" }
  end

  def find(site, id)
    wanted = id.to_s.strip
    return nil if wanted.empty?

    roster(site).find { |row| row["id"].to_s == wanted }
  end

  # Site JSON the editor's shell validator can swallow — components live
  # on a parallel GET, not inside the shell.
  def shell(site)
    return {} unless site.is_a?(Hash)

    site.reject { |key, _| key.to_s == "visualComponents" }
  end

  def apply!(site, changed:, deleted:, replace: false)
    site = {} unless site.is_a?(Hash)
    incoming = Array(changed).select { |row| row.is_a?(Hash) && row["id"].to_s.strip != "" }
    gone = Array(deleted).map { |id| id.to_s.strip }.reject(&:empty?)

    next_roster = if replace
      incoming
    else
      kept = roster(site).reject { |row| gone.include?(row["id"].to_s) }
      by_id = kept.to_h { |row| [row["id"].to_s, row] }
      incoming.each { |row| by_id[row["id"].to_s] = row }
      by_id.values
    end

    site.merge("visualComponents" => next_roster)
  end

  def rows(site, seq:)
    roster(site).map { |vc| data_row(vc, seq: seq) }
  end

  def data_row(vc, seq:)
    now = Time.now.utc.iso8601
    created_ms = Integer(vc["createdAt"], exception: false)
    created = created_ms ? Time.at(created_ms / 1000.0).utc.iso8601 : now
    tree = vc["tree"].is_a?(Hash) ? vc["tree"] : empty_tree
    name = vc["name"].to_s
    slug = slug_from_name(name)
    {
      id: vc["id"].to_s, tableId: "components",
      cells: {
        name: name, slug: slug,
        body: { "nodes" => tree["nodes"] || {}, "rootNodeId" => tree["rootNodeId"].to_s },
        params: Array(vc["params"]),
        classIds: Array(vc["classIds"]),
      },
      slug: slug, status: "draft", seq: seq.to_i,
      authorUserId: nil, createdByUserId: nil, updatedByUserId: nil, publishedByUserId: nil,
      author: nil, createdBy: nil, updatedBy: nil, publishedBy: nil,
      createdAt: created, updatedAt: now, publishedAt: nil,
      scheduledPublishAt: nil, deletedAt: nil,
    }
  end

  def empty_tree
    root = SecureRandom.alphanumeric(12)
    {
      "rootNodeId" => root,
      "nodes" => {
        root => {
          "id" => root, "moduleId" => "base.body", "children" => [],
          "props" => {}, "classIds" => [], "breakpointOverrides" => {},
        },
      },
    }
  end

  def new_component(name:, tree: nil, id: nil)
    {
      "id" => id.to_s.strip.empty? ? SecureRandom.alphanumeric(12) : id.to_s,
      "name" => name.to_s.strip,
      "tree" => tree.is_a?(Hash) ? tree : empty_tree,
      "params" => [],
      "classIds" => [],
      "createdAt" => (Time.now.to_f * 1000).round,
    }
  end

  def slug_from_name(name)
    slug = name.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
    slug.empty? ? "component" : slug
  end

  # Flatten a component definition into a page-shaped document the publisher
  # can walk: prop bindings resolved, slot outlets replaced with the
  # instance's slot content (or left as placeholders).
  def instantiate(vc, ref_node, page_document)
    tree = vc["tree"].is_a?(Hash) ? vc["tree"] : empty_tree
    vc_nodes = tree["nodes"].is_a?(Hash) ? tree["nodes"] : {}
    root_id = tree["rootNodeId"].to_s
    page_nodes = page_document.is_a?(Hash) && page_document["nodes"].is_a?(Hash) ? page_document["nodes"] : {}
    param_values = param_values_for(vc, ref_node)
    slots = slot_instances_by_name(ref_node, page_nodes)
    out = {}

    walk = lambda do |node_id|
      node = vc_nodes[node_id]
      return [] unless node.is_a?(Hash)

      if node["moduleId"].to_s == "base.slot-outlet"
        slot_name = node.dig("props", "slotName").to_s
        slot_name = "children" if slot_name.empty?
        child_ids = Array(slots[slot_name])
        if child_ids.any?
          child_ids.each { |id| copy_page_subtree(id, page_nodes, out) }
          return child_ids
        end
      end

      cloned = deep_copy(node)
      cloned["props"] = apply_bindings(cloned, param_values)
      children = []
      Array(cloned["children"]).each { |child_id| children.concat(walk.call(child_id)) }
      cloned["children"] = children
      out[cloned["id"]] = cloned
      [cloned["id"]]
    end

    walk.call(root_id)
    { "rootNodeId" => root_id, "nodes" => out }
  end

  def param_values_for(vc, ref_node)
    overrides = ref_node.is_a?(Hash) && ref_node.dig("props", "propOverrides").is_a?(Hash) ?
      ref_node.dig("props", "propOverrides") : {}
    values = {}
    Array(vc["params"]).each do |param|
      next unless param.is_a?(Hash)

      id = param["id"].to_s
      next if id.empty?

      values[id] = overrides.key?(id) ? overrides[id] : param["defaultValue"]
    end
    values
  end

  def slot_instances_by_name(ref_node, page_nodes)
    names = {}
    Array(ref_node && ref_node["children"]).each do |child_id|
      child = page_nodes[child_id]
      next unless child.is_a?(Hash) && child["moduleId"].to_s == "base.slot-instance"

      name = child.dig("props", "slotName").to_s
      name = "children" if name.empty?
      names[name] = Array(child["children"])
    end
    names
  end

  def copy_page_subtree(node_id, page_nodes, out)
    node = page_nodes[node_id]
    return if node.nil? || out[node_id]

    out[node_id] = deep_copy(node)
    Array(node["children"]).each { |child_id| copy_page_subtree(child_id, page_nodes, out) }
  end

  def apply_bindings(node, param_values)
    props = node["props"].is_a?(Hash) ? node["props"].dup : {}
    bindings = node["propBindings"]
    return props unless bindings.is_a?(Hash)

    bindings.each do |prop_key, binding|
      next unless binding.is_a?(Hash)

      param_id = binding["paramId"].to_s
      props[prop_key] = param_values[param_id] if param_values.key?(param_id)
    end
    props
  end

  def deep_copy(value)
    JSON.parse(JSON.generate(value))
  end
end
