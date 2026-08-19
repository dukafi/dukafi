require "json"
require "securerandom"

# Reusable visual components for an external agent.
#
# A newsletter form is authored once, then dropped on any page with
# `<div data-dukafy-component="<id>"></div>`. Edits to the component update
# every instance. Detach (make a one-off copy) is editor-only — an agent
# that needs a one-off inserts ordinary HTML instead of the component tag.
module McpComponentTools
  module_function

  def all
    [list_components, read_component, create_component, update_component, delete_component]
  end

  READ_TOOLS = %w[list_components read_component].freeze

  def list_components
    {
      name: "list_components",
      title: "List components",
      description: "Reusable visual components (newsletter form, promo bar). " \
                   "Call this before rebuilding chrome that may already exist. " \
                   "Insert one on a page with apply_edits: " \
                   "<div data-dukafy-component=\"<id>\"></div>. " \
                   "Editing a component updates every page that uses it.",
      input_schema: {
        "type" => "object",
        "properties" => {},
        "additionalProperties" => false,
      },
      run: lambda do |_args|
        state = require_state!
        {
          "components" => VisualComponents.roster(state.site).map { |row| summary(row) },
        }
      end,
    }
  end

  def read_component
    {
      name: "read_component",
      title: "Read a component",
      description: "Read a reusable component's tree. The outline uses the " \
                   "same [node id] lines as read_page — pass those ids to " \
                   "update_component edits. This is the definition, not one " \
                   "page's instance.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "id" => { "type" => "string", "description" => "Component id, from list_components." },
          "format" => {
            "type" => "string", "enum" => %w[outline json],
            "description" => "outline (default) or json (raw tree).",
          },
        },
        "required" => %w[id],
        "additionalProperties" => false,
      },
      run: ->(args) { run_read(args) },
    }
  end

  def create_component
    {
      name: "create_component",
      title: "Create a component",
      description: "Save a reusable section (newsletter form, banner). " \
                   "Pass HTML for the body — ordinary HTML with Tailwind, " \
                   "same as apply_edits. Then insert it on pages with " \
                   "<div data-dukafy-component=\"<id>\"></div>. " \
                   "Do not copy the inner HTML onto each page.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "name" => { "type" => "string", "description" => "Shown in the editor, e.g. Newsletter form." },
          "html" => {
            "type" => "string",
            "description" => "Optional body markup. Omit to create an empty component.",
          },
        },
        "required" => %w[name],
        "additionalProperties" => false,
      },
      run: ->(args) { run_create(args) },
    }
  end

  def update_component
    {
      name: "update_component",
      title: "Update a component",
      description: "Rename a component or edit its tree. Edits use the same " \
                   "ops as apply_edits (insert/replace/delete/setProps/setClasses) " \
                   "against this component's nodes — call read_component first. " \
                   "Every page that uses this component updates. Saved to the " \
                   "draft; call publish to go live.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "id" => { "type" => "string" },
          "name" => { "type" => "string", "description" => "New display name." },
          "edits" => {
            "type" => "array",
            "maxItems" => McpTools::MAX_EDITS,
            "description" => "Same ops as apply_edits, targeting this component's node ids.",
            "items" => {
              "type" => "object",
              "properties" => {
                "op" => { "type" => "string", "enum" => %w[insert replace delete setProps setClasses] },
                "parentId" => { "type" => "string" },
                "index" => { "type" => "integer" },
                "nodeId" => { "type" => "string" },
                "html" => { "type" => "string" },
                "props" => { "type" => "object" },
                "classes" => { "type" => "string" },
              },
              "required" => ["op"],
            },
          },
        },
        "required" => %w[id],
        "additionalProperties" => false,
      },
      run: ->(args) { run_update(args) },
    }
  end

  def delete_component
    {
      name: "delete_component",
      title: "Delete a component",
      description: "Remove a reusable component. Pages that still reference " \
                   "it publish an empty comment until you delete those tags. " \
                   "Does not detach instances into page HTML.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "id" => { "type" => "string" },
        },
        "required" => %w[id],
        "additionalProperties" => false,
      },
      run: ->(args) { run_delete(args) },
    }
  end

  def run_read(args)
    vc = require_component!(args["id"])
    tree = document_for(vc)
    return { "id" => vc["id"], "name" => vc["name"], "document" => tree } if args["format"].to_s == "json"

    {
      "id" => vc["id"],
      "name" => vc["name"],
      "outline" => McpTools.outline(tree),
    }
  end

  def run_create(args)
    name = args["name"].to_s.strip
    raise McpTools::ArgumentError, "name is required" if name.empty?
    raise McpTools::ArgumentError, "name is too long" if name.length > 80

    state = require_state!
    existing = VisualComponents.roster(state.site)
    if existing.any? { |row| row["name"].to_s.strip.downcase == name.downcase }
      raise McpTools::ArgumentError, "A component named #{name.inspect} already exists. Use update_component."
    end

    tree = VisualComponents.empty_tree
    html = args["html"].to_s
    if html.strip != ""
      tree, style_rules = import_html!(state, tree, html)
      persist_site!(state, VisualComponents.apply!(
        state.site.merge("styleRules" => style_rules),
        changed: [VisualComponents.new_component(name: name, tree: tree)],
        deleted: [],
      ))
    else
      persist_site!(state, VisualComponents.apply!(
        state.site,
        changed: [VisualComponents.new_component(name: name, tree: tree)],
        deleted: [],
      ))
    end

    created = VisualComponents.roster(state.site).find { |row| row["name"].to_s == name }
    {
      "id" => created.fetch("id"),
      "name" => created.fetch("name"),
      "note" => "Created. Insert with apply_edits: " \
                "<div data-dukafy-component=\"#{created.fetch('id')}\"></div> " \
                "then publish.",
    }
  end

  def run_update(args)
    vc = require_component!(args["id"])
    state = require_state!
    name = args.key?("name") ? args["name"].to_s.strip : vc["name"].to_s
    raise McpTools::ArgumentError, "name is required" if name.empty?
    raise McpTools::ArgumentError, "name is too long" if name.length > 80

    clash = VisualComponents.roster(state.site).find do |row|
      row["id"].to_s != vc["id"].to_s && row["name"].to_s.strip.downcase == name.downcase
    end
    raise McpTools::ArgumentError, "A component named #{name.inspect} already exists." if clash

    tree = document_for(vc)
    site = state.site
    edits = args["edits"]
    if edits.is_a?(Array) && !edits.empty?
      if edits.length > McpTools::MAX_EDITS
        raise McpTools::ArgumentError, "That is #{edits.length} edits; #{McpTools::MAX_EDITS} is the limit for one call."
      end

      result = EditorSidecar.call(
        document: tree,
        style_rules: site.fetch("styleRules", {}),
        edits: edits,
      )
      raise McpTools::ArgumentError, McpTools.sidecar_message(result.reason) unless result.ok?
      if result.applied.zero?
        raise McpTools::ArgumentError, "No edits applied. The node ids may be stale — call read_component again."
      end

      tree = result.document
      site = site.merge("styleRules" => result.style_rules)
    elsif !args.key?("name")
      raise McpTools::ArgumentError, "Pass name and/or edits."
    end

    updated = vc.merge("name" => name, "tree" => tree)
    persist_site!(state, VisualComponents.apply!(site, changed: [updated], deleted: []))
    { "id" => vc["id"], "name" => name, "note" => "Saved to the draft. Call publish to put it live." }
  end

  def run_delete(args)
    vc = require_component!(args["id"])
    state = require_state!
    persist_site!(state, VisualComponents.apply!(state.site, changed: [], deleted: [vc["id"]]))
    { "ok" => true, "id" => vc["id"] }
  end

  def summary(row)
    { "id" => row["id"].to_s, "name" => row["name"].to_s }
  end

  def document_for(vc)
    tree = vc["tree"].is_a?(Hash) ? vc["tree"] : VisualComponents.empty_tree
    {
      "rootNodeId" => tree["rootNodeId"],
      "nodes" => tree["nodes"].is_a?(Hash) ? tree["nodes"] : {},
    }
  end

  def require_state!
    SiteState.first || raise(McpTools::ArgumentError, "This store has no site yet.")
  end

  def require_component!(id)
    state = require_state!
    VisualComponents.find(state.site, id) ||
      raise(McpTools::ArgumentError,
            "No component with id #{id.to_s.inspect}. Call list_components to see what exists.")
  end

  def import_html!(state, tree, html)
    result = EditorSidecar.call(
      document: tree,
      style_rules: state.site.fetch("styleRules", {}),
      edits: [{ "op" => "insert", "html" => html }],
    )
    raise McpTools::ArgumentError, McpTools.sidecar_message(result.reason) unless result.ok?
    raise McpTools::ArgumentError, "That HTML could not be imported." if result.applied.zero?

    [result.document, result.style_rules]
  end

  def persist_site!(state, site)
    DB.transaction do
      state.site = site
      state.bump_seq!
    end
  end
end
