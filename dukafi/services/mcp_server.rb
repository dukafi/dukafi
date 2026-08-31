require "base64"
require "json"

# MCP, the protocol half — dual-era.
#
# The protocol split in two. Revisions up to 2025-11-25 ("legacy") open with an
# `initialize` handshake. 2026-07-28 ("modern") removed the handshake entirely:
# every request declares its own version in `params._meta`, mirrors routing
# fields into HTTP headers, and `server/discover` replaces `initialize` as the
# way to ask what a server can do.
#
# We answer both, because clients are mid-migration. Which era a request gets
# is decided by the request itself, per the spec: a request carrying modern
# `_meta` is served the modern way; an `initialize` selects legacy.
#
# Returns [http_status, body] because the status is protocol-defined — an
# unknown method is 404 in the modern era and a 200-wrapped JSON-RPC error in
# the legacy one — so the transport cannot decide it alone. A nil body means
# "202, send nothing".
class McpServer
  MODERN_VERSION = "2026-07-28".freeze
  # Newest first: this is what `supportedVersions` advertises.
  LEGACY_VERSIONS = %w[2025-11-25 2025-06-18 2025-03-26].freeze
  SUPPORTED_VERSIONS = [MODERN_VERSION, *LEGACY_VERSIONS].freeze
  # What a request with no version at all is assumed to speak, per the
  # transport spec's backwards-compatibility rule.
  ASSUMED_VERSION = "2025-03-26".freeze

  META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion".freeze
  META_SERVER_INFO = "io.modelcontextprotocol/serverInfo".freeze

  SERVER_NAME = "dukafi".freeze
  SERVER_VERSION = "0.1.0".freeze

  # JSON-RPC 2.0 reserved codes.
  PARSE_ERROR = -32_700
  INVALID_REQUEST = -32_600
  METHOD_NOT_FOUND = -32_601
  INVALID_PARAMS = -32_602
  INTERNAL_ERROR = -32_603
  # MCP's own reserved sub-range.
  HEADER_MISMATCH = -32_020
  UNSUPPORTED_PROTOCOL_VERSION = -32_022

  # A header value that cannot be plain ASCII travels as `=?base64?...?=`.
  BASE64_SENTINEL = /\A=\?base64\?(.*)\?=\z/

  INSTRUCTIONS = <<~TEXT.freeze
    This is a Dukafi store — a commerce CMS whose pages are trees of nodes,
    not files. Read a page before changing it. Stamp a stable id and
    data-section-id on every top-level section (pageSlug__slot, e.g.
    index__hero or home__hero_banner) and keep that same id on every
    replace — list_children returns it as sectionId; apply_edits /
    read_page prefer sectionId over editor node ids, which change on
    re-import. Call get_store_context for a planning snapshot.
    Call list_children for structure (omit nodeId for the page root), then
    read_page with a child's sectionId to work on that section in detail.
    Call get_page_context before adding a section — it returns two existing
    sections and their colors/spacing so new work can match the page.
    Call get_design_tokens before designing — colors, fonts, type, and spacing
    live in one registry. To change an accent or a font, call
    update_design_tokens then publish; do not restyle every page.
    Call get_recipes before a product loop, search page, homepage spotlight,
    CMS loop, form, cart, reusable component, SEO / "rank for" job, or a
    vague restyle — those overlays are Dukafi-specific; paste the returned
    HTML into apply_edits. Topic design is the quiet storefront (white canvas,
    one accent, no gradients) for vague prompts: quiet-hero is type+photo split,
    quiet-section is the about column, product grids stay full width. A product loop may include a
    data-dukafy-pagination sibling (not repeated)
    with loop.next / loop.previous; give the wrapping section an id so paging
    stays on that section instead of jumping to the top.
    Ranking a keyword is an indexable collection or landing page, never
    /search?keyword= (always noindex). To show a product on the homepage,
    add it to Featured or on-sale and loop collections/<slug>.products —
    discount codes are checkout-only, not a loop. Call list_components before
    rebuilding a newsletter or header that may already exist; insert with
    <div data-dukafy-component="<id>"></div>.
    If the profile is thin, do not invent a founding story or audience.
  TEXT

  def initialize(tools: McpTools.all)
    @tools = tools.to_h { |tool| [tool.fetch(:name), tool] }
  end

  # `headers` carries the mirrored MCP routing headers, already downcased by
  # the transport: :protocol_version, :method, :name.
  def call(message, headers = {})
    return [400, error(nil, INVALID_REQUEST, "Expected a JSON-RPC object")] unless message.is_a?(Hash)

    id = message["id"]
    rpc_method = message["method"].to_s
    params = message["params"].is_a?(Hash) ? message["params"] : {}
    meta = params["_meta"].is_a?(Hash) ? params["_meta"] : {}

    # No id means a notification (or a response, which we never asked for).
    # Either way there is nothing to answer.
    return [202, nil] if id.nil?
    return [400, error(id, INVALID_REQUEST, "Missing method")] if rpc_method.empty?

    version, mismatch = negotiate_version(id, meta, headers)
    return mismatch if mismatch

    if version == MODERN_VERSION
      modern(id, rpc_method, params, headers)
    else
      legacy(id, rpc_method, params, version)
    end
  end

  private

  # The declared version, or an error tuple if it cannot be agreed.
  def negotiate_version(id, meta, headers)
    from_meta = meta[META_PROTOCOL_VERSION].to_s
    from_header = headers[:protocol_version].to_s

    # "If the values do not match, the server MUST reject the request with 400
    # and a HeaderMismatch error." Different sources of truth for routing and
    # execution is precisely the hole this closes.
    if !from_meta.empty? && !from_header.empty? && from_meta != from_header
      return [nil, [400, error(id, HEADER_MISMATCH,
                               "MCP-Protocol-Version header (#{from_header}) does not match " \
                               "_meta protocol version (#{from_meta})")]]
    end

    declared = from_meta.empty? ? from_header : from_meta
    return [ASSUMED_VERSION, nil] if declared.empty?
    return [declared, nil] if SUPPORTED_VERSIONS.include?(declared)

    [nil, [400, {
      jsonrpc: "2.0", id: id,
      error: { code: UNSUPPORTED_PROTOCOL_VERSION, message: "Unsupported protocol version",
               data: { supported: SUPPORTED_VERSIONS, requested: declared } },
    }]]
  end

  # ── 2026-07-28 ─────────────────────────────────────────────────────────────

  def modern(id, rpc_method, params, headers)
    mismatch = validate_routing_headers(id, rpc_method, params, headers)
    return mismatch if mismatch

    case rpc_method
    when "server/discover" then [200, success(id, discover_result)]
    when "ping" then [200, success(id, {})]
    when "tools/list" then [200, success(id, { tools: @tools.values.map { |t| tool_descriptor(t) } })]
    when "tools/call" then [200, call_tool(id, params)]
    else
      # "If the server does not implement the requested RPC method, it MUST
      # respond with 404 Not Found and a JSON-RPC error with code -32601."
      # The body is what tells a client this is a modern server rather than a
      # legacy one that simply has no MCP endpoint here.
      [404, error(id, METHOD_NOT_FOUND, "Unknown method: #{rpc_method}")]
    end
  end

  # `Mcp-Method` on every request, `Mcp-Name` on the ones that address
  # something by name. Both REQUIRED, and both must agree with the body.
  def validate_routing_headers(id, rpc_method, params, headers)
    header_method = headers[:method].to_s
    if header_method.empty?
      return [400, error(id, HEADER_MISMATCH, "Missing required Mcp-Method header")]
    end
    if header_method != rpc_method
      return [400, error(id, HEADER_MISMATCH,
                         "Mcp-Method header (#{header_method}) does not match body method (#{rpc_method})")]
    end

    return nil unless %w[tools/call resources/read prompts/get].include?(rpc_method)

    expected = (params["name"] || params["uri"]).to_s
    header_name = decode_header_value(headers[:name])
    if header_name.nil?
      return [400, error(id, HEADER_MISMATCH, "Missing required Mcp-Name header")]
    end
    return nil if header_name == expected

    [400, error(id, HEADER_MISMATCH,
                "Mcp-Name header (#{header_name}) does not match body value (#{expected})")]
  end

  def decode_header_value(value)
    return nil if value.nil? || value.to_s.empty?

    match = BASE64_SENTINEL.match(value.to_s)
    return value.to_s unless match

    Base64.strict_decode64(match[1]).force_encoding(Encoding::UTF_8)
  rescue ArgumentError
    # Undecodable is not "absent" — return it as-is so it fails the comparison
    # with a mismatch rather than a confusing "missing header".
    value.to_s
  end

  def discover_result
    {
      resultType: "complete",
      supportedVersions: SUPPORTED_VERSIONS,
      capabilities: { tools: {} },
      _meta: { META_SERVER_INFO => { name: SERVER_NAME, version: SERVER_VERSION } },
      instructions: INSTRUCTIONS,
    }
  end

  # ── 2025-11-25 and earlier ─────────────────────────────────────────────────

  def legacy(id, rpc_method, params, version)
    case rpc_method
    when "initialize" then [200, success(id, initialize_result(params, version))]
    when "ping" then [200, success(id, {})]
    when "tools/list" then [200, success(id, { tools: @tools.values.map { |t| tool_descriptor(t) } })]
    when "tools/call" then [200, call_tool(id, params)]
    else
      # The legacy era has no HTTP status convention for this — an unknown
      # method is an ordinary JSON-RPC error inside a 200.
      [200, error(id, METHOD_NOT_FOUND, "Unknown method: #{rpc_method}")]
    end
  end

  def initialize_result(params, _negotiated)
    requested = params["protocolVersion"].to_s
    # "If the server supports the requested version it MUST respond with the
    # same version. Otherwise it MUST respond with another version it supports"
    # — and that SHOULD be the latest one, hence LEGACY_VERSIONS.first rather
    # than whatever this request happened to be assumed to be.
    #
    # Never the modern version: a client speaking `initialize` by definition
    # cannot speak a revision that removed it.
    version = LEGACY_VERSIONS.include?(requested) ? requested : LEGACY_VERSIONS.first

    {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, title: "Dukafi", version: SERVER_VERSION },
      instructions: INSTRUCTIONS,
    }
  end

  # ── Shared ─────────────────────────────────────────────────────────────────

  def tool_descriptor(tool)
    {
      name: tool.fetch(:name),
      title: tool.fetch(:title, tool.fetch(:name)),
      description: tool.fetch(:description),
      inputSchema: tool.fetch(:input_schema),
    }
  end

  def call_tool(id, params)
    name = params["name"].to_s
    tool = @tools[name]
    return error(id, INVALID_PARAMS, "Unknown tool: #{name}") if tool.nil?

    arguments = params["arguments"].is_a?(Hash) ? params["arguments"] : {}
    success(id, text_content(tool.fetch(:run).call(arguments)))
  rescue McpTools::ArgumentError => e
    # A bad argument is the MODEL's mistake and it can retry, so it comes back
    # as a tool result flagged isError rather than a protocol error, which
    # would abort the call instead of letting the model correct itself.
    success(id, text_content(e.message, is_error: true))
  rescue StandardError => e
    warn "[mcp] tool #{name} failed: #{e.class}: #{e.message}"
    success(id, text_content("The tool failed: #{e.message}", is_error: true))
  end

  def text_content(value, is_error: false)
    text = value.is_a?(String) ? value : JSON.pretty_generate(value)
    { content: [{ type: "text", text: text }], isError: is_error }
  end

  def success(id, result) = { jsonrpc: "2.0", id: id, result: result }

  def error(id, code, message)
    { jsonrpc: "2.0", id: id, error: { code: code, message: message } }
  end
end
