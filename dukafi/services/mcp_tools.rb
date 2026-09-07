require "json"
require "securerandom"

# The tools an external agent can call.
#
# Each is a plain Hash so the set is data, not a class hierarchy — `tools/list`
# is a map over this array, and a test can build a server with a fake tool
# without touching the database.
#
# Page tools live here; the catalogue lives in `McpCommerceTools` and is
# appended below. The split is not cosmetic: page edits land on a draft that
# `publish` makes live, while a price or a stock level has no draft at all.
module McpTools
  # Raised when the MODEL passed something wrong. Comes back as a tool result
  # with isError so it can correct itself, rather than as a protocol error.
  class ArgumentError < StandardError; end

  MAX_LIMIT = 100
  DEFAULT_LIMIT = 25

  module_function

  def all
    [ask_user, get_store_context, update_store_profile, list_pages, create_page, read_page, list_children, get_page_context, get_design_tokens, get_style_framework_snippet, get_recipes, apply_edits, update_design_tokens, list_rebuild_targets, publish, set_page_access, set_page_seo] +
      McpCommerceTools.all + McpMediaTools.all + McpReviewTools.all +
      McpDiscountTools.all + McpPluginTools.all + McpDataTableTools.all +
      McpComponentTools.all + McpSitemapTools.all +
      McpOrderTools.all + McpCustomerTools.all + McpAiTools.all
  end

  # Which tools change the store. Drives the `mcp:read` / `mcp:write` split, so
  # a merchant can connect an agent that can look without being able to touch.
  #
  # Named explicitly rather than derived from a naming convention: a new tool
  # should have to declare which side it is on, and the default below — treat
  # anything unrecognised as a WRITE — means forgetting to update this list
  # fails closed.
  READ_TOOLS = (%w[ask_user get_store_context list_pages read_page list_children get_page_context get_design_tokens get_style_framework_snippet get_recipes list_rebuild_targets] +
                McpCommerceTools::READ_TOOLS + McpMediaTools::READ_TOOLS +
                McpReviewTools::READ_TOOLS + McpDiscountTools::READ_TOOLS +
                McpPluginTools::READ_TOOLS + McpDataTableTools::READ_TOOLS +
                McpComponentTools::READ_TOOLS + McpSitemapTools::READ_TOOLS +
                McpOrderTools::READ_TOOLS + McpCustomerTools::READ_TOOLS +
                McpAiTools::READ_TOOLS).freeze

  def write_tool?(name) = !READ_TOOLS.include?(name.to_s)

  def ask_user
    {
      name: "ask_user",
      title: "Ask the user for clarification",
      description: "Use this when the request lacks information that would materially change the result: visual direction, target page/section, content facts, framework scope, destructive intent, or whether to publish. Ask 1–3 short questions, then STOP. Return the structured result to the user and wait for their next message; do not continue tools or guess. Do not use it for details that can be discovered with read tools or resolved by a safe, reversible default.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "reason" => { "type" => "string", "description" => "Briefly explain why proceeding would be ambiguous or risky." },
          "questions" => {
            "type" => "array", "minItems" => 1, "maxItems" => UserClarification::MAX_QUESTIONS,
            "items" => {
              "type" => "object",
              "properties" => {
                "id" => { "type" => "string", "description" => "Stable snake_case answer key." },
                "prompt" => { "type" => "string" },
                "kind" => { "type" => "string", "enum" => UserClarification::KINDS },
                "choices" => { "type" => "array", "maxItems" => 8, "items" => {
                  "type" => "object", "properties" => {
                    "value" => { "type" => "string" }, "label" => { "type" => "string" }, "description" => { "type" => "string" },
                  }, "required" => ["label"], "additionalProperties" => false,
                } },
                "allowCustom" => { "type" => "boolean" },
                "recommendedValue" => { "type" => "string" },
              },
              "required" => ["prompt"], "additionalProperties" => false,
            },
          },
        },
        "required" => ["questions"], "additionalProperties" => false,
      },
      run: ->(args) { UserClarification.build(args) },
    }
  end

  def get_store_context
    {
      name: "get_store_context",
      title: "Get store context",
      description: "One planning snapshot: store name, optional business " \
                   "profile, page list, a sample of products and media, and " \
                   "saved components. Prefer this over many list_* calls when " \
                   "you need to understand the store. It does not include " \
                   "page trees — call list_children for structure, then " \
                   "read_page with a sectionId for that section. A thin profile " \
                   "means the merchant has not filled in their story; do not " \
                   "invent founding dates or audiences. Includes a compact " \
                   "tokens summary — call get_design_tokens for the full " \
                   "color/font/type/spacing registry. Includes a recipes " \
                   "index — call get_recipes before a product loop, search, " \
                   "homepage spotlight, CMS loop, form, cart, reusable " \
                   "component, SEO / 'rank for' job, or a vague restyle " \
                   "(topic design); those overlays " \
                   "are not general HTML. Call list_components before " \
                   "rebuilding a newsletter or header that may already exist.",
      input_schema: {
        "type" => "object",
        "properties" => {},
        "additionalProperties" => false,
      },
      run: ->(_args) { StoreContext.call },
    }
  end

  def update_store_profile
    {
      name: "update_store_profile",
      title: "Update store profile",
      description: "Write the optional business profile: startedOn, audience, " \
                   "difference. Empty strings clear a field. A thin profile " \
                   "is valid — do not invent a founding story. There is no " \
                   "store id argument; the token selects this store.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "startedOn" => { "type" => "string", "description" => "Year or a short phrase." },
          "audience" => { "type" => "string", "description" => "Who they sell to." },
          "difference" => { "type" => "string", "description" => "What makes them different." },
        },
        "additionalProperties" => false,
      },
      run: ->(args) { StoreProfile.current.apply!(args).to_payload },
    }
  end

  def list_pages
    {
      name: "list_pages",
      title: "List pages",
      description: "List the pages in this store — slug, title, kind, " \
                   "whether each is published, and the public path/url for " \
                   "CMS pages (to share or submit to Search Console). Start " \
                   "here: the slug is how every other page tool refers to a page.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "status" => {
            "type" => "string",
            "enum" => %w[any draft published],
            "description" => "Filter by publication status. Defaults to any.",
          },
          "limit" => {
            "type" => "integer",
            "minimum" => 1,
            "maximum" => MAX_LIMIT,
            "description" => "How many to return (default #{DEFAULT_LIMIT}).",
          },
        },
        "additionalProperties" => false,
      },
      run: ->(args) { run_list_pages(args) },
    }
  end

  def run_list_pages(args)
    status = args.fetch("status", "any").to_s
    unless %w[any draft published].include?(status)
      raise ArgumentError, "status must be one of: any, draft, published"
    end

    dataset = Page.order(:slug)
    dataset = dataset.where(status: status) unless status == "any"

    pages = dataset.limit(clamp_limit(args["limit"])).map do |page|
      path = page.kind == "page" ? PagePaths.public_path(page.slug) : nil
      {
        "slug" => page.slug,
        "title" => page.title,
        "kind" => page.kind,
        "status" => page.status,
        "access" => page.access,
        "authRedirect" => page.auth_redirect,
        "path" => path,
        "url" => path && Dukafi::Publisher::ListingJsonLd.absolute(path, Dukafi::Publisher::ListingJsonLd.public_origin),
        "updatedAt" => page.updated_at&.utc&.iso8601,
      }
    end

    { "pages" => pages, "total" => dataset.count }
  end

  # Models routinely send a string where the schema says integer, or ask for
  # 10_000 rows. Coercing beats refusing: the call succeeds and the context
  # window survives.
  def clamp_limit(value)
    limit = Integer(value, exception: false) || DEFAULT_LIMIT
    limit.clamp(1, MAX_LIMIT)
  end

  # ── read_page ──────────────────────────────────────────────────────────────

  # A page whose tree is longer than this is summarised rather than dumped.
  # A model that spends its whole context on one page cannot then edit it.
  MAX_OUTLINE_NODES = 300

  def read_page
    {
      name: "read_page",
      title: "Read a page",
      description: "Read a page, or one section of it. Call list_children " \
                   "first to get the top-level sections, then pass a child's " \
                   "sectionId (stable HTML id, e.g. home__hero_banner) or " \
                   "nodeId to read that section's tree in detail. Prefer " \
                   "sectionId — node ids change when HTML is re-imported. " \
                   "Omit both only when you truly need the whole page. The " \
                   "outline is an indented tree; every line starts with the " \
                   "node id in [brackets] and includes sectionId when the " \
                   "markup has one. Use json only when you need the raw " \
                   "stored document (scoped to the same node).",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "The page slug, from list_pages." },
          "sectionId" => {
            "type" => "string",
            "description" => "Stable HTML id / data-section-id of a section. " \
                             "Prefer this over nodeId. From list_children.",
          },
          "nodeId" => {
            "type" => "string",
            "description" => "Read this node and its descendants only. " \
                             "Defaults to the page root. Prefer sectionId.",
          },
          "format" => {
            "type" => "string", "enum" => %w[outline json],
            "description" => "outline (default, compact) or json (raw document).",
          },
          "version" => {
            "type" => "string", "enum" => %w[draft published],
            "description" => "draft (default — what the editor shows) or published (what visitors see).",
          },
        },
        "required" => ["slug"],
        "additionalProperties" => false,
      },
      run: ->(args) { run_read_page(args) },
    }
  end

  def run_read_page(args)
    slug = args["slug"].to_s.strip
    raise ArgumentError, "slug is required" if slug.empty?

    page = Page.first(slug: slug)
    raise ArgumentError, "No page with slug #{slug.inspect}. Call list_pages to see what exists." if page.nil?

    version = args.fetch("version", "draft").to_s
    unless %w[draft published].include?(version)
      raise ArgumentError, "version must be draft or published"
    end

    document = version == "published" ? page.published_document_data : page.document_data
    if document.nil?
      raise ArgumentError, "#{slug.inspect} has never been published; read the draft instead."
    end

    nodes = document["nodes"]
    raise ArgumentError, "That page's document could not be read." unless nodes.is_a?(Hash)

    node_id = resolve_target_id!(document, args)
    raise ArgumentError, "No node #{node_id.inspect} on #{slug.inspect}." if nodes[node_id].nil?

    return subtree(document, node_id) if args["format"].to_s == "json"

    {
      "slug" => page.slug, "title" => page.title,
      "status" => page.status, "version" => version,
      "nodeId" => node_id,
      "seoTitle" => document["seoTitle"],
      "seoDescription" => document["seoDescription"],
      "ogImage" => document["ogImage"],
      "outline" => outline(document, from_id: node_id),
    }
  end

  # Nodes reachable from one parent — so a fill call can work on a section
  # without loading the rest of the page.
  def subtree(document, node_id)
    nodes = document["nodes"]
    kept = {}
    walk = lambda do |id|
      node = nodes[id]
      return if node.nil? || kept.key?(id)

      kept[id] = node
      Array(node["children"]).each { |child| walk.call(child) }
    end
    walk.call(node_id)
    document.merge("rootNodeId" => node_id, "nodes" => kept)
  end

  # An indented tree, one line per node. Far smaller than the raw document and
  # it keeps what a model editing a STORE actually needs: the node id, what
  # kind of node it is, its visible text, its classes, and the commerce
  # overlays (bindings, cart actions, conditions) that plain HTML cannot carry.
  def outline(document, from_id: nil)
    nodes = document["nodes"]
    root = from_id.to_s.strip.empty? ? document["rootNodeId"] : from_id.to_s.strip
    return "(empty page)" unless nodes.is_a?(Hash) && nodes[root]

    styles = style_rules
    lines = []
    visit(nodes, root, 0, lines, styles, {})
    if lines.length > MAX_OUTLINE_NODES
      kept = lines.first(MAX_OUTLINE_NODES)
      kept << "... #{lines.length - MAX_OUTLINE_NODES} more nodes not shown"
      return kept.join("\n")
    end
    lines.join("\n")
  end

  # `seen` guards against a cycle in `children` — a malformed document must
  # not put the server into an infinite loop.
  def visit(nodes, id, depth, lines, styles, seen)
    node = nodes[id]
    return if node.nil? || seen[id]

    seen[id] = true
    lines << "#{'  ' * depth}#{describe(node, styles)}"
    Array(node["children"]).each { |child| visit(nodes, child, depth + 1, lines, styles, seen) }
  end

  def describe(node, styles)
    parts = ["[#{node['id']}]", node["moduleId"].to_s]
    section_id = SectionIdentity.of(node)
    parts << "sectionId=#{section_id}" unless section_id.empty?

    text = visible_text(node["props"])
    parts << text.inspect if text

    classes = Array(node["classIds"]).filter_map { |cid| styles.dig(cid, "name") }
    parts << classes.map { |name| ".#{name}" }.join(" ") unless classes.empty?

    Array(node["dynamicBindings"]).each do |prop, binding|
      next unless binding.is_a?(Hash)

      parts << "bind:#{prop}=#{binding['source']}.#{binding['field']}"
    end

    actions = node["actions"]
    if actions.is_a?(Hash)
      parts << "action=#{actions.dig('click', 'type')}" if actions.dig("click", "type")
      parts << "region=#{actions['region']}" if actions["region"]
      parts << "overlay=#{actions['overlay']}" if actions["overlay"]
    end

    condition = node["visibleWhen"]
    if condition.is_a?(Hash)
      parts << "visibleWhen=#{condition['source']}.#{condition['field']}:#{condition['operator']}"
    end

    parts.join("  ")
  end

  # The one prop worth showing inline. Long copy is truncated — the point is
  # to identify the node, not to reproduce the page.
  TEXT_PROPS = %w[text label title heading content].freeze

  def visible_text(props)
    return nil unless props.is_a?(Hash)

    key = TEXT_PROPS.find { |name| props[name].is_a?(String) && !props[name].strip.empty? }
    return nil unless key

    value = props[key].strip
    value.length > 80 ? "#{value[0, 77]}..." : value
  end

  # Direct children of one node — what a harness asks for when it is walking
  # a page left-to-right. Not a dump of the whole tree; call again on a child
  # id to go one level deeper. The model does not need this; the harness does.
  def list_children
    {
      name: "list_children",
      title: "List child nodes",
      description: "The direct children of one node on a page. Omit nodeId " \
                   "and sectionId to list the page root's children (the " \
                   "top-level sections). Each child has node id (apply_edits) " \
                   "and sectionId (the HTML id / data-section-id — stable " \
                   "across restyles; stamp the same id on replacement HTML). " \
                   "Call again with a child's sectionId to go one level down. " \
                   "Prefer this over a whole-page read_page when walking " \
                   "structure. After you pick a child, call read_page with " \
                   "that child's sectionId to work on the section in detail.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "The page slug, from list_pages." },
          "sectionId" => {
            "type" => "string",
            "description" => "Parent section's stable HTML id. Prefer this over nodeId.",
          },
          "nodeId" => { "type" => "string", "description" => "Parent node. Defaults to the page root. Prefer sectionId." },
          "version" => {
            "type" => "string", "enum" => %w[draft published],
            "description" => "draft (default) or published.",
          },
        },
        "required" => ["slug"],
        "additionalProperties" => false,
      },
      run: ->(args) { run_list_children(args) },
    }
  end

  def run_list_children(args)
    slug = args["slug"].to_s.strip
    raise ArgumentError, "slug is required" if slug.empty?

    page = Page.first(slug: slug)
    raise ArgumentError, "No page with slug #{slug.inspect}. Call list_pages to see what exists." if page.nil?

    version = args.fetch("version", "draft").to_s
    unless %w[draft published].include?(version)
      raise ArgumentError, "version must be draft or published"
    end

    document = version == "published" ? page.published_document_data : page.document_data
    if document.nil?
      raise ArgumentError, "#{slug.inspect} has never been published; read the draft instead."
    end

    nodes = document["nodes"]
    raise ArgumentError, "That page's document could not be read." unless nodes.is_a?(Hash)

    parent_id = resolve_target_id!(document, args)
    parent = nodes[parent_id]
    raise ArgumentError, "No node #{parent_id.inspect} on #{slug.inspect}." if parent.nil?

    children = Array(parent["children"]).filter_map { |id| child_row(nodes[id]) }
    {
      "slug" => page.slug,
      "parentId" => parent_id,
      "children" => children,
    }
  end

  def child_row(node)
    return nil unless node.is_a?(Hash) && !node["id"].to_s.empty?

    {
      "id" => node["id"].to_s,
      "sectionId" => SectionIdentity.of(node),
      "moduleId" => node["moduleId"].to_s,
      "text" => visible_text(node["props"]).to_s,
      "childCount" => Array(node["children"]).length,
    }
  end

  # sectionId (HTML id / data-section-id) is the stable handle. nodeId is the
  # editor UUID and changes on re-import. Prefer sectionId when both are sent.
  def resolve_target_id!(document, args)
    SectionIdentity.resolve_node_id!(document, node_id: args["nodeId"], section_id: args["sectionId"])
  rescue ::ArgumentError => error
    raise ArgumentError, error.message
  end

  def resolve_edit_targets!(document, edits)
    Array(edits).map do |edit|
      next edit unless edit.is_a?(Hash)

      sid = edit["sectionId"].to_s.strip
      next strip_section_id(edit) if sid.empty?
      next strip_section_id(edit) unless %w[replace delete setProps setClasses].include?(edit["op"].to_s)

      node_id = SectionIdentity.resolve_node_id!(document, section_id: sid)
      strip_section_id(edit.merge("nodeId" => node_id))
    end
  rescue ::ArgumentError => error
    raise ArgumentError, error.message
  end

  def strip_section_id(edit)
    edit.reject { |key, _| key.to_s == "sectionId" }
  end

  # Enough of an existing page to add a section that matches it. Lists the
  # top-level sections, then reads up to two of them (outline + classes).
  # The harness should call this before a build/fill on a page that already
  # has content. Empty samples means a blank page — store context is enough.
  def get_page_context
    {
      name: "get_page_context",
      title: "Get page design context",
      description: "The page's top-level sections plus up to two sampled " \
                   "section trees and the Tailwind classes they use (colors, " \
                   "spacing, type). Call this before adding a section so the " \
                   "new work matches spacing and type. Decorative gradients " \
                   "are omitted from design — for a vague restyle use " \
                   "get_recipes topic=design. Pass sectionId (or nodeId) to " \
                   "sample that section and a neighbor. Omit both to sample " \
                   "the first two.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "The page slug, from list_pages." },
          "sectionId" => {
            "type" => "string",
            "description" => "Prefer this section (stable HTML id) and a neighbor.",
          },
          "nodeId" => { "type" => "string", "description" => "Prefer this section and a neighbor. Prefer sectionId." },
          "samples" => {
            "type" => "integer", "minimum" => 1, "maximum" => 3,
            "description" => "How many sections to read in detail. Defaults to 2.",
          },
          "version" => {
            "type" => "string", "enum" => %w[draft published],
            "description" => "draft (default) or published.",
          },
        },
        "required" => ["slug"],
        "additionalProperties" => false,
      },
      run: ->(args) { run_get_page_context(args) },
    }
  end

  def run_get_page_context(args)
    slug = args["slug"].to_s.strip
    raise ArgumentError, "slug is required" if slug.empty?

    page = Page.first(slug: slug)
    raise ArgumentError, "No page with slug #{slug.inspect}. Call list_pages to see what exists." if page.nil?

    version = args.fetch("version", "draft").to_s
    unless %w[draft published].include?(version)
      raise ArgumentError, "version must be draft or published"
    end

    document = version == "published" ? page.published_document_data : page.document_data
    if document.nil?
      raise ArgumentError, "#{slug.inspect} has never been published; read the draft instead."
    end

    nodes = document["nodes"]
    raise ArgumentError, "That page's document could not be read." unless nodes.is_a?(Hash)

    parent_id, child_ids = section_parent(document, nodes)
    styles = style_rules
    want = Integer(args["samples"], exception: false) || 2
    want = want.clamp(1, 3)
    prefer = args["nodeId"].to_s.strip
    if args["sectionId"].to_s.strip != ""
      prefer = resolve_target_id!(document, args)
    end
    sample_ids = pick_sample_ids(child_ids, prefer, want)

    sections = child_ids.filter_map { |id| section_summary(nodes[id], styles) }
    samples = sample_ids.filter_map { |id| section_sample(document, nodes[id], styles) }
    class_names = samples.flat_map { |row| row["classes"] }.uniq

    {
      "slug" => page.slug,
      "parentId" => parent_id,
      "sections" => sections,
      "samples" => samples,
      "design" => design_from(class_names, samples),
    }
  end

  def section_parent(document, nodes)
    root_id = document["rootNodeId"].to_s
    root = nodes[root_id]
    kids = Array(root && root["children"])
    if kids.length == 1
      wrap = nodes[kids.first]
      inner = Array(wrap && wrap["children"])
      return [wrap["id"].to_s, inner] if wrap.is_a?(Hash) && inner.length > 1
    end
    [root_id, kids]
  end

  def pick_sample_ids(child_ids, node_id, want)
    ids = child_ids.map(&:to_s)
    return ids.first(want) if node_id.empty? || !ids.include?(node_id)

    index = ids.index(node_id)
    neighbor = ids[index - 1] || ids[index + 1]
    [node_id, neighbor].compact.uniq.first(want)
  end

  def section_summary(node, styles)
    row = child_row(node)
    return nil unless row

    row.merge("classes" => node_classes(node, styles))
  end

  def section_sample(document, node, styles)
    return nil unless node.is_a?(Hash) && !node["id"].to_s.empty?

    {
      "id" => node["id"].to_s,
      "sectionId" => SectionIdentity.of(node),
      "text" => visible_text(node["props"]).to_s,
      "rootClasses" => node_classes(node, styles),
      "classes" => collect_classes(document["nodes"], node["id"], styles, {}),
      "outline" => outline(document, from_id: node["id"]),
    }
  end

  def node_classes(node, styles)
    Array(node && node["classIds"]).filter_map { |cid| styles.dig(cid, "name") }.uniq
  end

  def collect_classes(nodes, id, styles, seen)
    node = nodes[id]
    return [] if node.nil? || seen[id]

    seen[id] = true
    own = node_classes(node, styles)
    kids = Array(node["children"]).flat_map { |child| collect_classes(nodes, child, styles, seen) }
    (own + kids).uniq.first(80)
  end

  def design_from(class_names, samples)
    names = Array(class_names)
    roots = Array(samples).flat_map { |row| Array(row["rootClasses"]) }.uniq
    {
      "colors" => quiet_classes(names.select { |name| color_class?(name) }).first(12),
      "spacing" => names.select { |name| name.match?(/\A(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-/) }.first(12),
      "type" => names.select { |name| type_class?(name) }.first(12),
      "layout" => names.select { |name| layout_class?(name) }.first(12),
      "sectionClasses" => quiet_classes(roots).first(8),
    }
  end

  # Match spacing/type; do not teach the next section to copy a rainbow wash.
  DECORATIVE_CLASS = /\A(bg-gradient-|from-|via-|to-|shadow-(xl|2xl)|drop-shadow|backdrop-blur|blur-|ring-offset)/
  SLOP_FILL_CLASS = /\A(bg|text|border)-(indigo|violet|purple|fuchsia|pink|cyan|sky)-[4-9]00\z/

  def quiet_classes(names)
    Array(names).reject { |name| name.match?(DECORATIVE_CLASS) || name.match?(SLOP_FILL_CLASS) }
  end

  def color_class?(name)
    name.match?(/\A(bg|border|from|to|via|ring)-/) ||
      name.match?(/\Atext-(black|white|transparent|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-/) ||
      (name.match?(/\A(text|bg|border|fill)-[a-z][a-z0-9-]+\z/) && !type_class?(name) && !text_align_class?(name))
  end

  def type_class?(name)
    name.match?(/\A(font-|tracking-|leading-|uppercase|lowercase|italic)/) ||
      name.match?(/\Atext-(xs|s|sm|m|base|l|lg|xl|[2-9]xl)\z/)
  end

  def text_align_class?(name)
    name.match?(/\Atext-(left|right|center|justify|start|end|clip|ellipsis|wrap|nowrap|balance|pretty)\z/)
  end

  def layout_class?(name)
    name.match?(/\A(flex|grid|inline|block|hidden|contents|mx-auto|max-w-|w-|h-|gap-|items-|justify-|col-|row-)/)
  end

  # ── design tokens ──────────────────────────────────────────────────────────

  def get_design_tokens
    {
      name: "get_design_tokens",
      title: "Get design tokens",
      description: "The site's complete Style Framework: color and font tokens, color " \
                   "schemes, type and spacing scales, semantic type styles, layout presets, " \
                   "icons, buttons, inputs, and preferences. It includes " \
                   "CSS variables and the utility classes bound to " \
                   "them. Schemes (scheme-1…) map Background / Heading / Body / " \
                   "Accent onto palette tokens. Call this before designing or " \
                   "restyling. To change an accent or a font, patch here " \
                   "rather than editing every page.",
      input_schema: {
        "type" => "object",
        "properties" => {},
        "additionalProperties" => false,
      },
      run: ->(_args) { DesignTokens.snapshot },
    }
  end

  def get_recipes
    {
      name: "get_recipes",
      title: "Get operational recipes",
      description: "Dukafi-specific HTML for product loops, search, homepage " \
                   "spotlights, CMS loops, connected forms, cart, overlays, " \
                   "reusable components, SEO / 'rank for' playbooks, and the " \
                   "quiet storefront (topic design) — filled with this store's " \
                   "collection slugs, table columns, " \
                   "and component ids. Call this before apply_edits when the " \
                   "job is a grid, search, putting a product on the homepage, " \
                   "a CMS list, a form, a cart, inserting a saved component, " \
                   "ranking for a keyword, or a vague restyle. Paste the recipe html; do not " \
                   "invent {{ }} templates. Pass topic to fetch one family.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "topic" => {
            "type" => "string",
            "enum" => Recipes::TOPICS,
            "description" => "Omit for every recipe. Pass one to keep the payload small. " \
                             "seo = rank-for / unique titles. design = quiet storefront for vague prompts. loops includes search and homepage spotlight.",
          },
        },
        "additionalProperties" => false,
      },
      run: ->(args) { run_get_recipes(args) },
    }
  end

  def get_style_framework_snippet
    {
      name: "get_style_framework_snippet",
      title: "Get Style Framework canvas snippet",
      description: "Return canvas-ready HTML and usage rules for colors, typography, spacing, icons, buttons, inputs, or forms. Use this after get_design_tokens and before apply_edits when you need to consume the Style Framework correctly.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "topic" => { "type" => "string", "enum" => StyleFrameworkSnippets::TOPICS, "description" => "Omit for the complete guide, or select one small snippet family." },
        },
        "additionalProperties" => false,
      },
      run: ->(args) { StyleFrameworkSnippets.snapshot(args["topic"]) },
    }
  end

  def run_get_recipes(args)
    args = {} unless args.is_a?(Hash)
    Recipes.snapshot(args["topic"])
  rescue ArgumentError => error
    raise McpTools::ArgumentError, error.message
  end

  def update_design_tokens
    {
      name: "update_design_tokens",
      title: "Update design tokens",
      description: "Create or patch site-wide colors, schemes, font tokens, type/spacing scales, semantic type styles, layout, icons, buttons, inputs, or preferences. " \
                   "A color value change updates every class that uses that " \
                   "token (text-primary, bg-primary). Font family must already " \
                   "be installed when assigning a family — this does not download Google fonts. " \
                   "Saves the draft; call publish to go live.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "colors" => {
            "type" => "array",
            "maxItems" => 12,
            "description" => "Upsert by slug. Pass value (hex or hsla) to change the accent.",
            "items" => {
              "type" => "object",
              "properties" => {
                "slug" => { "type" => "string" },
                "name" => { "type" => "string" },
                "value" => { "type" => "string" },
                "lightValue" => { "type" => "string" },
                "darkValue" => { "type" => "string" },
                "category" => { "type" => "string" },
                "utilities" => {
                  "type" => "array",
                  "items" => { "type" => "string", "enum" => %w[text background border fill] },
                },
              },
              "additionalProperties" => false,
            },
          },
          "fonts" => {
            "type" => "array",
            "maxItems" => 8,
            "description" => "Upsert by variable/name. A family assignment must reference an installed family; omit family to create the token first.",
            "items" => {
              "type" => "object",
              "properties" => {
                "variable" => { "type" => "string" },
                "name" => { "type" => "string" },
                "family" => { "type" => "string" },
                "fallback" => { "type" => "string" },
              },
              "additionalProperties" => false,
            },
          },
          "typography" => {
            "type" => "array",
            "maxItems" => 4,
            "items" => {
              "type" => "object",
              "properties" => {
                "id" => { "type" => "string" },
                "name" => { "type" => "string" },
                "namingConvention" => { "type" => "string" },
                "minFontSize" => { "type" => "number" },
                "maxFontSize" => { "type" => "number" },
                "min" => { "type" => "number" },
                "max" => { "type" => "number" },
                "scaleRatio" => { "type" => "number" },
                "steps" => { "type" => "string" },
              },
              "additionalProperties" => false,
            },
          },
          "spacing" => {
            "type" => "array",
            "maxItems" => 4,
            "items" => {
              "type" => "object",
              "properties" => {
                "id" => { "type" => "string" },
                "name" => { "type" => "string" },
                "namingConvention" => { "type" => "string" },
                "minSize" => { "type" => "number" },
                "maxSize" => { "type" => "number" },
                "min" => { "type" => "number" },
                "max" => { "type" => "number" },
                "scaleRatio" => { "type" => "number" },
                "steps" => { "type" => "string" },
              },
              "additionalProperties" => false,
            },
          },
          "colorSchemes" => {
            "type" => "array",
            "maxItems" => 8,
            "description" => "Upsert a scheme by slug. roles map background, secondary, heading, body, accent, border onto color token slugs.",
            "items" => {
              "type" => "object",
              "properties" => {
                "slug" => { "type" => "string" },
                "name" => { "type" => "string" },
                "roles" => {
                  "type" => "object",
                  "properties" => {
                    "background" => { "type" => "string" },
                    "secondary" => { "type" => "string" },
                    "heading" => { "type" => "string" },
                    "body" => { "type" => "string" },
                    "accent" => { "type" => "string" },
                    "border" => { "type" => "string" },
                  },
                  "additionalProperties" => false,
                },
              },
              "additionalProperties" => false,
            },
          },
          "preferences" => {
            "type" => "object",
            "properties" => {
              "rootFontSize" => { "type" => "number" },
              "minScreenWidth" => { "type" => "number" },
              "maxScreenWidth" => { "type" => "number" },
              "isRem" => { "type" => "boolean" },
            },
            "additionalProperties" => false,
          },
          "typeStyles" => {
            "type" => "array", "maxItems" => 8,
            "description" => "Upsert semantic H1–H7/P defaults by tag.",
            "items" => { "type" => "object", "properties" => {
              "tag" => { "type" => "string", "enum" => %w[h1 h2 h3 h4 h5 h6 h7 p] },
              "fontFamily" => { "type" => "string" }, "fontSize" => { "type" => "string" },
              "fontWeight" => { "type" => "string" }, "letterSpacing" => { "type" => "string" },
              "lineHeight" => { "type" => "string" }, "textTransform" => { "type" => "string" },
              "maxWidth" => { "type" => "string" },
            }, "required" => ["tag"], "additionalProperties" => false },
          },
          "layout" => framework_object_schema(%w[containerWidth cardPadding vertical horizontal radius]),
          "icons" => framework_object_schema(%w[color style weight fill treatment fillIntensity padding radius radiusLinked], booleans: %w[radiusLinked]),
          "buttons" => framework_object_schema(%w[primaryColor secondaryColor linkColor padding radius radiusLinked fontVariable fontSize fontWeight casing letterSpacing], booleans: %w[radiusLinked]),
          "inputs" => framework_object_schema(%w[backgroundColor textColor borderColor focusColor padding radius radiusLinked borderWidth fontVariable fontSize fontWeight], booleans: %w[radiusLinked]),
        },
        "additionalProperties" => false,
      },
      run: ->(args) { run_update_design_tokens(args) },
    }
  end

  def framework_object_schema(keys, booleans: [])
    {
      "type" => "object",
      "properties" => keys.to_h { |key| [key, { "type" => booleans.include?(key) ? "boolean" : "string" }] },
      "additionalProperties" => false,
    }
  end

  def run_update_design_tokens(args)
    DesignTokens.apply!(args)
  rescue ArgumentError => error
    raise McpTools::ArgumentError, error.message
  end

  # ── create_page ────────────────────────────────────────────────────────────

  # The slug becomes a URL, so it has to satisfy the same pattern the storefront
  # uses to route one (`Storefront::SAFE_SLUG`). Validating here rather than
  # letting a bad slug through means an agent hears why instead of creating a
  # page that can never be reached.
  SAFE_SLUG = %r{\A[a-z0-9][a-z0-9_/-]*\z}
  # `index` is the storefront's home page, the templates are structural, and
  # `search` is the dedicated `/search?keyword=` page.
  # Creating one of these through this tool would quietly shadow something.
  RESERVED_SLUGS = %w[index product-template collection-template search].freeze

  def create_page
    {
      name: "create_page",
      title: "Create a page",
      description: "Add a new, empty page. The slug becomes its URL, so " \
                   "\"contact\" is served at /contact. Creates a DRAFT with " \
                   "nothing on it — follow with apply_edits to put content in, " \
                   "then publish. Fails if the slug is taken. Pass " \
                   "access=\"customer\" for a page only signed-in shoppers may " \
                   "see (a checkout or an account page); such a page is never " \
                   "served from the public static files at all.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => {
            "type" => "string",
            "description" => "URL path, lowercase: letters, numbers, - and _. E.g. \"contact\".",
          },
          "title" => { "type" => "string", "description" => "Shown in the browser tab and page lists." },
          "access" => {
            "type" => "string", "enum" => Page::ACCESS_LEVELS,
            "description" => "public (default) or customer. A customer page redirects " \
                             "signed-out visitors to whichever page is marked as the " \
                             "sign-in destination.",
          },
          "authRedirect" => {
            "type" => "boolean",
            "description" => "Make this the page signed-out visitors are sent to — the " \
                             "store's sign-in page. Only one page can be it, so setting " \
                             "it here clears it elsewhere. Cannot be combined with " \
                             "access=customer, which would lock everyone out.",
          },
        },
        "required" => %w[slug title],
        "additionalProperties" => false,
      },
      run: ->(args) { run_create_page(args) },
    }
  end

  def run_create_page(args)
    slug = args["slug"].to_s.strip.downcase
    title = args["title"].to_s.strip

    raise ArgumentError, "slug is required" if slug.empty?
    raise ArgumentError, "title is required" if title.empty?
    unless slug.match?(SAFE_SLUG)
      raise ArgumentError, "#{slug.inspect} cannot be a URL. Use lowercase letters, " \
                           "numbers, hyphens and underscores, starting with a letter or number."
    end
    if RESERVED_SLUGS.include?(slug)
      raise ArgumentError, "#{slug.inspect} is reserved by the store. Choose another slug."
    end
    if Page.first(slug: slug)
      raise ArgumentError, "A page at #{slug.inspect} already exists. Use apply_edits to change it."
    end

    # A page is a node tree, and every tree needs a root — `base.body` is what
    # the editor starts a page with, so a page created here opens in the editor
    # exactly like one created by the New Page button.
    root = SecureRandom.alphanumeric(12)
    document = {
      "id" => SecureRandom.alphanumeric(12), "slug" => slug, "title" => title,
      "rootNodeId" => root,
      "nodes" => { root => { "id" => root, "moduleId" => "base.body", "children" => [],
                             "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }

    access = args.fetch("access", "public").to_s
    unless Page::ACCESS_LEVELS.include?(access)
      raise ArgumentError, "access must be one of: #{Page::ACCESS_LEVELS.join(', ')}"
    end

    page = Page.create(slug: slug, title: title, kind: "page", status: "draft",
                       access: access, document: JSON.generate(document))
    Page.mark_auth_redirect!(page) if args["authRedirect"] == true

    { "slug" => page.slug, "title" => page.title, "url" => "/#{page.slug}",
      "access" => page.access, "authRedirect" => page.auth_redirect,
      "note" => "Created as an empty draft. Add content with apply_edits, then publish." }
  rescue Sequel::ValidationFailed => e
    raise ArgumentError, e.message
  end

  def set_page_access
    {
      name: "set_page_access",
      title: "Set who may see a page",
      description: "Gate a page behind sign-in, or open it again. A customer " \
                   "page is baked somewhere the storefront refuses to serve by " \
                   "path, so the ONLY way to it is through the session check — " \
                   "and a signed-out visitor is redirected to whichever page is " \
                   "marked as the sign-in destination. Mark that page with " \
                   "authRedirect; without one, a gated page is simply a 404. " \
                   "Takes effect on the next publish.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string" },
          "access" => { "type" => "string", "enum" => Page::ACCESS_LEVELS },
          "authRedirect" => {
            "type" => "boolean",
            "description" => "true makes this the sign-in destination and clears it from " \
                             "any other page. false clears it from this one.",
          },
        },
        "required" => ["slug"], "additionalProperties" => false,
      },
      run: lambda do |args|
        page = Page.first(slug: args["slug"].to_s.strip.downcase, kind: "page") ||
               raise(ArgumentError, "No page #{args['slug'].inspect}. Call list_pages to see what exists.")

        if (access = args["access"])
          unless Page::ACCESS_LEVELS.include?(access.to_s)
            raise ArgumentError, "access must be one of: #{Page::ACCESS_LEVELS.join(', ')}"
          end

          page.update(access: access.to_s)
        end

        case args["authRedirect"]
        when true then Page.mark_auth_redirect!(page)
        when false then page.update(auth_redirect: false)
        end

        { "slug" => page.slug, "access" => page.access, "authRedirect" => page.auth_redirect,
          "note" => page.gated? ? "Signed-out visitors will be redirected. Publish to apply." : "Open to everyone. Publish to apply." }
      rescue Sequel::ValidationFailed => e
        raise ArgumentError, e.message
      end,
    }
  end

  def set_page_seo
    {
      name: "set_page_seo",
      title: "Set a page's SEO title, description, and share image",
      description: "Unique search-result title, meta description, and og:image " \
                   "on a CMS page (page settings — not HTML tags). Draft until " \
                   "publish. Pass an empty string to clear a field. Collections " \
                   "and products use update_collection / update_product and " \
                   "set_product_og_image instead. Search is always noindex; " \
                   "do not use this to rank a keyword — call get_recipes topic=seo.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "Which page, from list_pages." },
          "seoTitle" => {
            "type" => "string",
            "description" => "Search-result title. Unique to this page. Empty string clears it.",
          },
          "seoDescription" => {
            "type" => "string",
            "description" => "Short pitch for search results. Not a keyword list. Empty string clears it.",
          },
          "ogImage" => {
            "type" => "string",
            "description" => "Share image: a path from list_media, or empty string to clear.",
          },
        },
        "required" => ["slug"],
        "additionalProperties" => false,
      },
      run: ->(args) { run_set_page_seo(args) },
    }
  end

  def run_set_page_seo(args)
    slug = args["slug"].to_s.strip.downcase
    raise ArgumentError, "slug is required" if slug.empty?

    present = %w[seoTitle seoDescription ogImage].select { |key| args.key?(key) }
    if present.empty?
      raise ArgumentError, "Pass seoTitle, seoDescription, and/or ogImage. Empty string clears that field."
    end

    page = Page.first(slug: slug)
    raise ArgumentError, "No page with slug #{slug.inspect}. Call list_pages to see what exists." if page.nil?

    document = page.document_data
    assign_seo_field!(document, "seoTitle", args["seoTitle"]) if args.key?("seoTitle")
    assign_seo_field!(document, "seoDescription", args["seoDescription"]) if args.key?("seoDescription")
    if args.key?("ogImage")
      document["ogImage"] = resolve_page_og_image(args["ogImage"])
      document.delete("ogImage") if document["ogImage"].nil?
    end

    persist_document!(page, document)

    {
      "slug" => page.slug,
      "seoTitle" => document["seoTitle"],
      "seoDescription" => document["seoDescription"],
      "ogImage" => document["ogImage"],
      "note" => "Saved to the draft. Call publish to put it live.",
    }
  rescue Sequel::ValidationFailed => e
    raise ArgumentError, e.message
  end

  def assign_seo_field!(document, key, value)
    text = value.to_s.strip
    if text.empty?
      document.delete(key)
    else
      document[key] = text
    end
  end

  def resolve_page_og_image(value)
    reference = value.to_s.strip
    return nil if reference.empty?

    "/#{McpMediaTools.find!(reference).path}"
  end

  def persist_document!(page, document)
    state = SiteState.first
    raise ArgumentError, "This store has no site yet." if state.nil?

    DB.transaction do
      seq = state.bump_seq!
      page.document = JSON.generate(document)
      page.seq = seq
      page.save
    end
  end

  # ── apply_edits ────────────────────────────────────────────────────────────

  # A batch large enough to be a mistake. A model that wants 60 edits on one
  # page has usually lost track of what it is doing, and the damage from
  # applying that blindly is worse than the inconvenience of refusing.
  MAX_EDITS = 40

  SIDECAR_ERRORS = {
    "not_configured" => "Editing is not available: the edit service is not configured on this store.",
    "unreachable" => "Editing is temporarily unavailable: the edit service is not responding. " \
                     "Reads still work.",
    "no_valid_edits" => "None of those edits were usable. Check the op names: " \
                        "insert, replace, delete, setProps, setClasses.",
    "invalid_document" => "That page's document could not be read.",
  }.freeze

  def apply_edits
    {
      name: "apply_edits",
      title: "Edit a page",
      description: "Change a page. Each edit names an op and, except for " \
                   "insert, the sectionId (stable HTML id) or nodeId it " \
                   "targets — prefer sectionId; call list_children first. " \
                   "Replacement HTML must keep the same id and " \
                   "data-section-id on the section root so later edits still " \
                   "match. Content is ordinary HTML with " \
                   "Tailwind classes. Store behaviour is data-dukafy-* " \
                   "overlays — call get_recipes first for a product loop, " \
                   "search results (current-query / ?keyword=), homepage " \
                   "spotlight (collections/<slug>.products), related " \
                   "products on a PDP (currentEntry.related), CMS loop, form, " \
                   "cart, or SEO / 'rank for' (do not invent {{ }} or React). " \
                   "Edits apply to the DRAFT; call publish to make them live. " \
                   "Reuse a saved component with " \
                   "<div data-dukafy-component=\"<id>\"></div> — call " \
                   "list_components / get_recipes topic=components first.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "Which page to edit." },
          "edits" => {
            "type" => "array",
            "maxItems" => MAX_EDITS,
            "description" => "Applied in order. An edit naming a node that does not exist is skipped.",
            "items" => {
              "type" => "object",
              "properties" => {
                "op" => { "type" => "string", "enum" => %w[insert replace delete setProps setClasses] },
                "parentId" => { "type" => "string", "description" => "insert: where to put it. Defaults to the page root." },
                "index" => { "type" => "integer", "description" => "insert: position among the parent's children." },
                "sectionId" => {
                  "type" => "string",
                  "description" => "replace/delete/setProps/setClasses: the " \
                                   "stable HTML id / data-section-id. Prefer this over nodeId.",
                },
                "nodeId" => { "type" => "string", "description" => "replace/delete/setProps/setClasses: the editor node. Prefer sectionId." },
                "html" => { "type" => "string", "description" => "insert/replace: the new markup. Keep the same section id on the root." },
                "props" => { "type" => "object", "description" => "setProps: props to merge." },
                "classes" => { "type" => "string", "description" => "setClasses: a space-separated class list." },
              },
              "required" => ["op"],
            },
          },
        },
        "required" => %w[slug edits],
        "additionalProperties" => false,
      },
      run: ->(args) { run_apply_edits(args) },
    }
  end

  def run_apply_edits(args)
    slug = args["slug"].to_s.strip
    raise ArgumentError, "slug is required" if slug.empty?

    edits = args["edits"]
    raise ArgumentError, "edits must be a non-empty array" unless edits.is_a?(Array) && !edits.empty?
    if edits.length > MAX_EDITS
      raise ArgumentError, "That is #{edits.length} edits; #{MAX_EDITS} is the limit for one call. " \
                           "Split the work and read the page again between batches."
    end

    page = Page.first(slug: slug)
    raise ArgumentError, "No page with slug #{slug.inspect}. Call list_pages to see what exists." if page.nil?

    state = SiteState.first
    raise ArgumentError, "This store has no site yet." if state.nil?

    site = state.site
    edits = resolve_edit_targets!(page.document_data, edits)
    result = EditorSidecar.call(
      document: page.document_data,
      style_rules: site.fetch("styleRules", {}),
      edits: edits,
    )
    raise ArgumentError, sidecar_message(result.reason) unless result.ok?

    if result.applied.zero?
      raise ArgumentError, "No edits applied. The node ids may be stale — call read_page again."
    end

    persist!(page, state, site, result)

    { "applied" => result.applied, "slug" => page.slug, "seq" => page.seq,
      "note" => "Saved to the draft. Call publish to put it live." }
  end

  # Both writes together: a document referencing style rules that were never
  # saved would publish with unstyled markup.
  def persist!(page, state, site, result)
    DB.transaction do
      state.site = site.merge("styleRules" => result.style_rules)
      # Bumping the site seq and stamping it on the page is what lets an open
      # editor notice this write. Without it the editor's next save ships a
      # base seq that still looks current and silently overwrites everything
      # an agent just did.
      seq = state.bump_seq!

      page.document = JSON.generate(result.document)
      page.seq = seq
      page.save
    end
  end

  def sidecar_message(reason)
    SIDECAR_ERRORS.fetch(reason, "The edit could not be applied (#{reason}).")
  end

  # ── list_rebuild_targets ───────────────────────────────────────────────────

  def list_rebuild_targets
    {
      name: "list_rebuild_targets",
      title: "Pages a catalogue change would rebuild",
      description: "The published pages that re-bake when a product, collection, " \
                   "or data table changes. Call with no arguments to export the " \
                   "whole rebuild map. Pass productSlug, collectionSlug, tableSlug, " \
                   "or source (products, data/team, reviews) to see one blast radius. " \
                   "Writes already rebuild these; this is how you inspect the index.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "productSlug" => { "type" => "string" },
          "collectionSlug" => { "type" => "string" },
          "tableSlug" => { "type" => "string", "description" => "A custom data table, e.g. team." },
          "source" => { "type" => "string", "description" => "A loop source path, e.g. products or data/team." },
        },
        "additionalProperties" => false,
      },
      run: ->(args) { run_list_rebuild_targets(args) },
    }
  end

  def run_list_rebuild_targets(args)
    args = args.is_a?(Hash) ? args : {}
    present = %w[productSlug collectionSlug tableSlug source].select { |key| args[key].to_s.strip != "" }
    if present.length > 1
      raise ArgumentError, "Pass only one of productSlug, collectionSlug, tableSlug, or source."
    end

    case present.first
    when "productSlug"
      product = Product.first(slug: args["productSlug"].to_s.strip.downcase) ||
        raise(ArgumentError, "No product with slug #{args['productSlug'].inspect}.")
      { "paths" => RebuildIndex.targets_for_product(product), "productSlug" => product.slug }
    when "collectionSlug"
      collection = Collection.first(slug: args["collectionSlug"].to_s.strip.downcase) ||
        raise(ArgumentError, "No collection with slug #{args['collectionSlug'].inspect}.")
      { "paths" => RebuildIndex.targets_for_collection(collection), "collectionSlug" => collection.slug }
    when "tableSlug"
      slug = args["tableSlug"].to_s.strip.downcase
      CustomTable.first(slug: slug) ||
        raise(ArgumentError, "No data table with slug #{slug.inspect}.")
      { "paths" => RebuildIndex.targets_for_data(slug), "tableSlug" => slug, "source" => "data/#{slug}" }
    when "source"
      source = args["source"].to_s.strip
      { "paths" => RebuildIndex.targets_for_source(source), "source" => source }
    else
      { "pages" => RebuildIndex.export }
    end
  end

  # ── publish ────────────────────────────────────────────────────────────────

  # Its own tool, and never a side effect of editing.
  #
  # Every other tool here touches a draft nobody can see. This one makes the
  # store live: it re-bakes every page to static HTML that visitors are served
  # immediately. Keeping it separate means a model has to decide to do it,
  # rather than discovering it published a half-finished page as a by-product
  # of an edit.
  def publish
    {
      name: "publish",
      title: "Publish the site",
      description: "Make the current draft live. This regenerates the whole " \
                   "storefront and visitors see it immediately — it is not a " \
                   "preview and there is no staged rollout. Only call it when " \
                   "the draft is finished and the user has asked for it. Does " \
                   "nothing if the draft already matches what is published.",
      input_schema: { "type" => "object", "properties" => {}, "additionalProperties" => false },
      run: ->(_args) { run_publish },
    }
  end

  def run_publish
    status = PublishSite.status
    # Baking the whole site costs a Tailwind compile and a rewrite of every
    # page. Doing that to produce byte-identical output is pure waste, and
    # models retry.
    if status.fetch(:draftMatchesPublished)
      return {
        "published" => false,
        "reason" => "The draft already matches what is live; nothing to publish.",
        "lastPublishedAt" => status[:lastPublishedAt],
      }
    end

    result = PublishSite.call
    {
      "published" => true,
      "pages" => result.published_pages,
      "version" => result.version,
      "note" => "The storefront is live with these changes.",
    }
  rescue ::ArgumentError => e
    # `::` matters: inside this module, a bare `ArgumentError` is McpTools'
    # own, so an unqualified rescue would never catch the built-in one
    # PublishSite raises for an empty site — and that is a real condition for
    # a store that has only just been created.
    raise ArgumentError, "Could not publish: #{e.message}"
  end

  # Class ids in a document are mangled handles (`tw-flex_col`); the readable
  # name lives in the site's styleRules. Showing a model the handle instead of
  # `flex-col` would make the outline nearly useless, so this resolves them —
  # and returns {} rather than raising if the site row is missing or malformed,
  # since a page is still worth reading without its class names.
  def style_rules
    site = SiteState.first&.site
    return {} unless site.is_a?(Hash)

    rules = site["styleRules"]
    rules.is_a?(Hash) ? rules : {}
  rescue JSON::ParserError
    {}
  end
end
