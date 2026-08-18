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
    [list_pages, create_page, read_page, apply_edits, list_rebuild_targets, publish, set_page_access] +
      McpCommerceTools.all + McpMediaTools.all + McpReviewTools.all +
      McpDiscountTools.all + McpPluginTools.all + McpDataTableTools.all
  end

  # Which tools change the store. Drives the `mcp:read` / `mcp:write` split, so
  # a merchant can connect an agent that can look without being able to touch.
  #
  # Named explicitly rather than derived from a naming convention: a new tool
  # should have to declare which side it is on, and the default below — treat
  # anything unrecognised as a WRITE — means forgetting to update this list
  # fails closed.
  READ_TOOLS = (%w[list_pages read_page list_rebuild_targets] +
                McpCommerceTools::READ_TOOLS + McpMediaTools::READ_TOOLS +
                McpReviewTools::READ_TOOLS + McpDiscountTools::READ_TOOLS +
                McpPluginTools::READ_TOOLS + McpDataTableTools::READ_TOOLS).freeze

  def write_tool?(name) = !READ_TOOLS.include?(name.to_s)

  def list_pages
    {
      name: "list_pages",
      title: "List pages",
      description: "List the pages in this store — slug, title, kind and " \
                   "whether each is published. Start here: the slug is how " \
                   "every other page tool refers to a page.",
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
      {
        "slug" => page.slug,
        "title" => page.title,
        "kind" => page.kind,
        "status" => page.status,
        "access" => page.access,
        "authRedirect" => page.auth_redirect,
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
      description: "Read one page's structure. The default 'outline' format " \
                   "is an indented tree where every line starts with the " \
                   "node's id in [brackets] — those ids are how edits address " \
                   "nodes, so read a page before changing it. Use 'json' only " \
                   "when you need the raw stored document.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "The page slug, from list_pages." },
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

    return document if args["format"].to_s == "json"

    {
      "slug" => page.slug, "title" => page.title,
      "status" => page.status, "version" => version,
      "outline" => outline(document),
    }
  end

  # An indented tree, one line per node. Far smaller than the raw document and
  # it keeps what a model editing a STORE actually needs: the node id, what
  # kind of node it is, its visible text, its classes, and the commerce
  # overlays (bindings, cart actions, conditions) that plain HTML cannot carry.
  def outline(document)
    nodes = document["nodes"]
    root = document["rootNodeId"]
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

  # ── create_page ────────────────────────────────────────────────────────────

  # The slug becomes a URL, so it has to satisfy the same pattern the storefront
  # uses to route one (`Storefront::SAFE_SLUG`). Validating here rather than
  # letting a bad slug through means an agent hears why instead of creating a
  # page that can never be reached.
  SAFE_SLUG = %r{\A[a-z0-9][a-z0-9_/-]*\z}
  # `index` is the storefront's home page and the templates are structural.
  # Creating one of these through this tool would quietly shadow something.
  RESERVED_SLUGS = %w[index product-template collection-template].freeze

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
                   "insert, the id of the node it targets — call read_page " \
                   "first to learn the ids. Content is written as ordinary " \
                   "HTML with Tailwind classes; commerce behaviour goes on " \
                   "data-dukafy-* attributes (data-dukafy-action=\"cart.addItem\", " \
                   "data-dukafy-bind-text=\"currentEntry.title\", " \
                   "data-dukafy-visible-when=\"currentEntry.inCart:isFalse\"). " \
                   "Repeating anything is data-dukafy-loop on a wrapper: " \
                   "\"products\", \"collections/<slug>.products\", \"reviews\" " \
                   "(approved customer reviews), \"cart.items\", or a list field " \
                   "of whatever the enclosing loop is on — \"currentEntry.images\", " \
                   "\"currentEntry.variants\", \"currentEntry.stars\" (a review's " \
                   "five stars, each with symbol/filled/state/position, for " \
                   "drawing a rating out of styleable elements). " \
                   "Edits apply to the DRAFT; call publish to make them live.",
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
                "nodeId" => { "type" => "string", "description" => "replace/delete/setProps/setClasses: the target." },
                "html" => { "type" => "string", "description" => "insert/replace: the new markup." },
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

    { "applied" => result.applied, "slug" => page.slug,
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
