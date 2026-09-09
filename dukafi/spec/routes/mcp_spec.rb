require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# The MCP endpoint — what Cursor and Lovable actually talk to.
#
# Rack::Lint is deliberate here. A 202 with no body is the one response shape
# this transport must produce, and Lint is what catches a stray content-type
# on an empty body — the exact bug that made every delete endpoint 500 in
# development before.
class McpSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Rack::Lint.new(Dukafi.app)

  def setup
    PersonalAccessToken.dataset.delete
    Page.dataset.delete
    Admin.dataset.delete
    clear_cookies
    _, @token = PersonalAccessToken.issue!(name: "Cursor")
  end

  def page!(slug:, title: "Page", status: "published", kind: "page")
    document = {
      "id" => slug, "slug" => slug, "title" => title, "rootNodeId" => "b",
      "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }
    Page.create(slug:, title:, kind:, status:, document: JSON.generate(document),
                created_at: Time.now, updated_at: Time.now)
  end

  def rpc(body, token: @token, headers: {})
    env = { "CONTENT_TYPE" => "application/json",
            "HTTP_ACCEPT" => "application/json, text/event-stream" }
    env["HTTP_AUTHORIZATION"] = "Bearer #{token}" if token
    post "/admin/api/mcp", JSON.generate(body), env.merge(headers)
  end

  def body = JSON.parse(last_response.body)
  def result = body.fetch("result")

  def call_tool(name, arguments = {})
    rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name:, arguments: } })
    result
  end

  # ── Auth ─────────────────────────────────────────────────────────────────

  def test_an_anonymous_request_is_refused
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, token: nil)

    assert_equal 401, last_response.status
    # Without this header a client cannot tell "wrong token" from "broken
    # server", and retries forever.
    assert_match(/Bearer/, last_response.headers.fetch("www-authenticate"))
  end

  def test_an_unknown_token_is_refused
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, token: "dkf_not-a-real-token")

    assert_equal 401, last_response.status
  end

  def test_a_revoked_token_stops_working
    record, token = PersonalAccessToken.issue!(name: "Old laptop")
    record.revoke!

    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, token: token)

    assert_equal 401, last_response.status
  end

  # The plaintext is never stored, so a database read cannot yield API access.
  def test_only_a_digest_is_persisted
    record, token = PersonalAccessToken.issue!(name: "Lovable")

    refute_includes record.token_hash, token
    assert_equal PersonalAccessToken.digest(token), record.token_hash
    assert_nil PersonalAccessToken.first(id: record.id).values[:token]
  end

  def test_using_a_token_records_when
    assert_nil PersonalAccessToken.first(name: "Cursor").last_used_at

    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" })

    refute_nil PersonalAccessToken.first(name: "Cursor").last_used_at
  end

  # ── Lifecycle ────────────────────────────────────────────────────────────

  def test_initialize_echoes_a_version_it_supports
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize",
          params: { protocolVersion: "2025-06-18" } })

    assert_equal 200, last_response.status
    assert_equal "2025-06-18", result.fetch("protocolVersion")
    assert_equal "dukafi", result.dig("serverInfo", "name")
  end

  # "If the server supports the requested version it MUST respond with the
  # same version. Otherwise it MUST respond with another version it supports."
  # An unknown version is answered, never rejected.
  def test_an_unknown_protocol_version_is_answered_with_our_latest_legacy_one
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize",
          params: { protocolVersion: "1999-01-01" } })

    assert_equal 200, last_response.status
    # Never the modern version: a client that sent `initialize` cannot speak a
    # revision that removed it.
    assert_equal McpServer::LEGACY_VERSIONS.first, result.fetch("protocolVersion")
    refute_equal McpServer::MODERN_VERSION, result.fetch("protocolVersion")
  end

  # Advertising resources or prompts we do not serve would make clients issue
  # calls that can only fail.
  def test_only_tools_are_advertised
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" })

    assert_equal %w[tools], result.fetch("capabilities").keys
  end

  # A notification has no id, so there is nothing to respond to. Rack forbids
  # a content-type on an empty body — hence Rack::Lint above.
  def test_a_notification_is_accepted_with_no_body
    rpc({ jsonrpc: "2.0", method: "notifications/initialized" })

    assert_equal 202, last_response.status
    assert_empty last_response.body
  end

  def test_ping_answers
    rpc({ jsonrpc: "2.0", id: 4, method: "ping" })

    assert_equal 200, last_response.status
    assert_empty result
  end

  def test_an_unknown_method_is_a_jsonrpc_error_not_an_http_one
    rpc({ jsonrpc: "2.0", id: 5, method: "nonsense/method" })

    assert_equal 200, last_response.status
    assert_equal McpServer::METHOD_NOT_FOUND, body.dig("error", "code")
  end

  # ── Transport rules ──────────────────────────────────────────────────────

  # "The server MUST either return text/event-stream in response to this GET,
  # or else return 405." We never push, so 405 is the honest answer.
  def test_get_reports_that_there_is_no_server_stream
    get "/admin/api/mcp", {}, { "HTTP_AUTHORIZATION" => "Bearer #{@token}" }

    assert_equal 405, last_response.status
  end

  def test_an_unsupported_protocol_header_is_rejected
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" },
        headers: { "HTTP_MCP_PROTOCOL_VERSION" => "1999-01-01" })

    assert_equal 400, last_response.status
  end

  # Absent is legal — the spec says assume the older version.
  def test_a_missing_protocol_header_is_fine
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" })

    assert_equal 200, last_response.status
  end

  # DNS rebinding: any page could POST to a local Dukafi and drive the store
  # from a hostile tab. Real MCP clients send no Origin at all, so only a
  # present-and-unexpected one is refused.
  def test_a_foreign_origin_is_refused
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" },
        headers: { "HTTP_ORIGIN" => "https://evil.example" })

    assert_equal 403, last_response.status
  end

  def test_no_origin_is_allowed_because_that_is_what_real_clients_send
    rpc({ jsonrpc: "2.0", id: 1, method: "initialize" })

    assert_equal 200, last_response.status
  end

  def test_malformed_json_is_a_parse_error
    post "/admin/api/mcp", "{not json",
         { "CONTENT_TYPE" => "application/json", "HTTP_AUTHORIZATION" => "Bearer #{@token}" }

    assert_equal 400, last_response.status
    assert_equal McpServer::PARSE_ERROR, body.dig("error", "code")
  end

  # Batching was removed in 2025-06-18. Refusing loudly beats silently
  # answering only the first message.
  def test_batching_is_refused_rather_than_half_honoured
    rpc([{ jsonrpc: "2.0", id: 1, method: "ping" }])

    assert_equal 400, last_response.status
  end

  # ── Tools ────────────────────────────────────────────────────────────────

  def test_tools_are_listed_with_a_schema
    rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })

    tool = result.fetch("tools").find { |entry| entry.fetch("name") == "list_pages" }
    refute_nil tool
    refute_empty tool.fetch("description")
    assert_equal "object", tool.dig("inputSchema", "type")

    context = result.fetch("tools").find { |entry| entry.fetch("name") == "get_store_context" }
    refute_nil context
    tokens = result.fetch("tools").find { |entry| entry.fetch("name") == "get_design_tokens" }
    refute_nil tokens
    recipes = result.fetch("tools").find { |entry| entry.fetch("name") == "get_recipes" }
    refute_nil recipes
    children = result.fetch("tools").find { |entry| entry.fetch("name") == "list_children" }
    refute_nil children
    components = result.fetch("tools").find { |entry| entry.fetch("name") == "list_components" }
    refute_nil components
    refute_nil result.fetch("tools").find { |entry| entry.fetch("name") == "update_store_profile" }
    refute_nil result.fetch("tools").find { |entry| entry.fetch("name") == "update_store_settings" }
    refute_nil result.fetch("tools").find { |entry| entry.fetch("name") == "set_page_seo" }
    refute_nil result.fetch("tools").find { |entry| entry.fetch("name") == "list_orders" }
    refute_nil result.fetch("tools").find { |entry| entry.fetch("name") == "list_customers" }
  end

  def test_get_store_context_is_a_read_and_does_not_require_a_profile
    payload = JSON.parse(call_tool("get_store_context").dig("content", 0, "text"))

    assert_equal true, payload.dig("profile", "thin")
    assert payload.dig("pages").key?("sample")
    refute McpTools.write_tool?("get_store_context")
  end

  def test_get_design_tokens_is_a_read_and_update_is_a_write
    SiteState.dataset.delete
    SiteState.create(
      site: { "settings" => { "framework" => { "colors" => { "tokens" => [{
        "id" => "p", "slug" => "primary", "lightValue" => "#111",
        "generateUtilities" => { "text" => true, "background" => true },
      }] } } } },
      seq: 0, created_at: Time.now, updated_at: Time.now,
    )

    payload = JSON.parse(call_tool("get_design_tokens").dig("content", 0, "text"))
    assert_equal "primary", payload.dig("colors", 0, "slug")
    refute McpTools.write_tool?("get_design_tokens")
    assert McpTools.write_tool?("update_design_tokens")

    updated = JSON.parse(call_tool("update_design_tokens", {
      "colors" => [{ "slug" => "primary", "value" => "#be123c" }],
    }).dig("content", 0, "text"))
    assert_includes updated.fetch("changed"), "updated color primary"
    assert_equal "#be123c", updated.dig("tokens", "colors", 0, "value")
  end

  def test_design_tokens_cover_and_update_the_complete_style_framework
    updated = JSON.parse(call_tool("update_design_tokens", {
      "fonts" => [{ "variable" => "font-display", "name" => "Display", "fallback" => "sans-serif" }],
      "typeStyles" => [{ "tag" => "h1", "fontSize" => "clamp(2rem, 5vw, 5rem)", "fontWeight" => "700" }],
      "layout" => { "containerWidth" => "regular", "radius" => "lg" },
      "icons" => { "color" => "heading", "weight" => "6" },
      "buttons" => { "primaryColor" => "accent", "padding" => "6", "casing" => "uppercase" },
      "inputs" => { "backgroundColor" => "background", "borderWidth" => "4", "focusColor" => "accent" },
    }).dig("content", 0, "text"))

    assert_includes updated.fetch("changed"), "upserted font font-display"
    assert_equal "clamp(2rem, 5vw, 5rem)", updated.dig("tokens", "typeStyles", 0, "fontSize")
    assert_equal "regular", updated.dig("tokens", "layoutPresets", "containerWidth")
    assert_equal "heading", updated.dig("tokens", "icons", "color")
    assert_equal "6", updated.dig("tokens", "buttons", "padding")
    assert_equal "4", updated.dig("tokens", "inputs", "borderWidth")
  end

  def test_style_framework_snippet_is_a_read_tool_with_canvas_ready_examples
    payload = JSON.parse(call_tool("get_style_framework_snippet", { "topic" => "forms" }).dig("content", 0, "text"))
    assert_equal ["framework-form"], payload.fetch("snippets").map { |row| row.fetch("id") }
    assert_includes payload.dig("snippets", 0, "html"), "dukafi-input"
    assert_includes payload.dig("snippets", 0, "html"), "dukafi-button"
    refute McpTools.write_tool?("get_style_framework_snippet")
  end

  def test_ask_user_returns_a_blocking_clarification_result_and_is_read_only
    payload = JSON.parse(call_tool("ask_user", {
      "reason" => "Two pages could be the target.",
      "questions" => [{
        "id" => "target_page", "prompt" => "Which page should I edit?", "kind" => "single_choice",
        "choices" => [{ "value" => "index", "label" => "Home" }, { "value" => "about", "label" => "About" }],
      }],
    }).dig("content", 0, "text"))

    assert_equal true, payload["requiresUserInput"]
    assert_equal "target_page", payload.dig("questions", 0, "id")
    assert_includes payload["agentInstruction"], "do not call more tools"
    refute McpTools.write_tool?("ask_user")
  end

  def test_get_recipes_is_a_read_and_fills_a_cms_loop
    CustomTable.dataset.delete
    CustomTable.create(
      name: "Team", slug: "team",
      columns_json: JSON.generate([{ "id" => "name", "label" => "Name", "type" => "text" }]),
    )

    payload = JSON.parse(call_tool("get_recipes", { "topic" => "cms" }).dig("content", 0, "text"))
    recipe = payload.fetch("recipes").find { |row| row.fetch("id") == "cms-loop" }
    assert_includes recipe.fetch("html"), 'data-dukafy-loop="data/team"'
    refute McpTools.write_tool?("get_recipes")

    seo = JSON.parse(call_tool("get_recipes", { "topic" => "seo" }).dig("content", 0, "text"))
    ids = seo.fetch("recipes").map { |row| row.fetch("id") }
    assert_includes ids, "rank-for"
    assert_includes ids, "page-seo"

    design = JSON.parse(call_tool("get_recipes", { "topic" => "design" }).dig("content", 0, "text"))
    quiet = design.fetch("recipes").find { |row| row.fetch("id") == "quiet-section" }
    assert_includes quiet.fetch("html"), "bg-white"
    refute_includes quiet.fetch("html"), "gradient"
  end

  def test_list_children_returns_direct_children_only
    document = {
      "id" => "index", "slug" => "index", "title" => "Home", "rootNodeId" => "root",
      "nodes" => {
        "root" => { "id" => "root", "moduleId" => "base.body", "children" => %w[hero about],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "hero" => { "id" => "hero", "moduleId" => "base.container", "children" => ["inner"],
                    "props" => { "text" => "Hero",
                                 "htmlAttributes" => { "id" => "index__hero", "data-section-id" => "index__hero" } },
                    "classIds" => [], "breakpointOverrides" => {} },
        "about" => { "id" => "about", "moduleId" => "base.container", "children" => [],
                     "props" => { "text" => "About" }, "classIds" => [], "breakpointOverrides" => {} },
        "inner" => { "id" => "inner", "moduleId" => "base.text", "children" => [],
                     "props" => { "text" => "nested" }, "classIds" => [], "breakpointOverrides" => {} },
      },
    }
    Page.create(slug: "index", title: "Home", kind: "page", status: "published",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)

    top = JSON.parse(call_tool("list_children", { "slug" => "index" }).dig("content", 0, "text"))
    assert_equal %w[hero about], top.fetch("children").map { |row| row.fetch("id") }
    assert_equal "index__hero", top.fetch("children").fetch(0).fetch("sectionId")
    refute_includes top.fetch("children").map { |row| row.fetch("id") }, "inner"
    refute McpTools.write_tool?("list_children")

    nested = JSON.parse(call_tool("list_children", { "slug" => "index", "sectionId" => "index__hero" }).dig("content", 0, "text"))
    assert_equal ["inner"], nested.fetch("children").map { |row| row.fetch("id") }
  end

  def test_get_page_context_samples_two_sections_and_their_classes
    SiteState.dataset.delete
    document = {
      "id" => "index", "slug" => "index", "title" => "Home", "rootNodeId" => "root",
      "nodes" => {
        "root" => { "id" => "root", "moduleId" => "base.body", "children" => %w[hero about extra],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "hero" => { "id" => "hero", "moduleId" => "base.container", "children" => ["inner"],
                    "props" => { "text" => "Hero" }, "classIds" => %w[c1 c4 c5], "breakpointOverrides" => {} },
        "about" => { "id" => "about", "moduleId" => "base.container", "children" => [],
                     "props" => { "text" => "About" }, "classIds" => ["c3"], "breakpointOverrides" => {} },
        "extra" => { "id" => "extra", "moduleId" => "base.container", "children" => [],
                     "props" => { "text" => "Extra" }, "classIds" => [], "breakpointOverrides" => {} },
        "inner" => { "id" => "inner", "moduleId" => "base.text", "children" => [],
                     "props" => { "text" => "nested" }, "classIds" => ["c2"], "breakpointOverrides" => {} },
      },
    }
    Page.create(slug: "index", title: "Home", kind: "page", status: "published",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)
    state = SiteState.new
    state.site = { "styleRules" => {
      "c1" => { "id" => "c1", "name" => "px-6", "kind" => "class" },
      "c2" => { "id" => "c2", "name" => "text-gray-600", "kind" => "class" },
      "c3" => { "id" => "c3", "name" => "py-16", "kind" => "class" },
      "c4" => { "id" => "c4", "name" => "bg-gradient-to-br", "kind" => "class" },
      "c5" => { "id" => "c5", "name" => "from-indigo-600", "kind" => "class" },
    } }
    state.created_at = Time.now
    state.updated_at = Time.now
    state.save

    payload = JSON.parse(call_tool("get_page_context", { "slug" => "index" }).dig("content", 0, "text"))
    assert_equal %w[hero about extra], payload.fetch("sections").map { |row| row.fetch("id") }
    assert_equal %w[hero about], payload.fetch("samples").map { |row| row.fetch("id") }
    refute_includes payload.dig("samples", 0, "outline"), "[extra]"
    assert_includes payload.dig("design", "spacing"), "px-6"
    assert_includes payload.dig("design", "colors"), "text-gray-600"
    refute_includes payload.dig("design", "sectionClasses") || [], "bg-gradient-to-br"
    refute_includes payload.dig("design", "colors"), "from-indigo-600"
    assert_includes payload.dig("samples", 0, "outline"), "bg-gradient-to-br"
    refute McpTools.write_tool?("get_page_context")
  end

  def test_read_page_with_node_id_returns_that_section_only
    document = {
      "id" => "index", "slug" => "index", "title" => "Home", "rootNodeId" => "root",
      "nodes" => {
        "root" => { "id" => "root", "moduleId" => "base.body", "children" => %w[hero about],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "hero" => { "id" => "hero", "moduleId" => "base.container", "children" => ["inner"],
                    "props" => { "text" => "Hero" }, "classIds" => [], "breakpointOverrides" => {} },
        "about" => { "id" => "about", "moduleId" => "base.container", "children" => [],
                     "props" => { "text" => "About" }, "classIds" => [], "breakpointOverrides" => {} },
        "inner" => { "id" => "inner", "moduleId" => "base.text", "children" => [],
                     "props" => { "text" => "nested" }, "classIds" => [], "breakpointOverrides" => {} },
      },
    }
    Page.create(slug: "index", title: "Home", kind: "page", status: "published",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)

    payload = JSON.parse(call_tool("read_page", { "slug" => "index", "nodeId" => "hero" }).dig("content", 0, "text"))
    assert_equal "hero", payload.fetch("nodeId")
    assert_includes payload.fetch("outline"), "[hero]"
    assert_includes payload.fetch("outline"), "[inner]"
    refute_includes payload.fetch("outline"), "[about]"

    json = JSON.parse(call_tool("read_page", { "slug" => "index", "nodeId" => "hero", "format" => "json" })
                        .dig("content", 0, "text"))
    assert_equal "hero", json.fetch("rootNodeId")
    assert json.fetch("nodes").key?("hero")
    assert json.fetch("nodes").key?("inner")
    refute json.fetch("nodes").key?("about")
  end

  def test_read_page_accepts_a_stable_section_id
    document = {
      "id" => "index", "slug" => "index", "title" => "Home", "rootNodeId" => "root",
      "nodes" => {
        "root" => { "id" => "root", "moduleId" => "base.body", "children" => %w[n1 n2],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "n1" => { "id" => "n1", "moduleId" => "base.container", "children" => [],
                  "props" => { "text" => "Hero",
                               "htmlAttributes" => { "id" => "index__hero", "data-section-id" => "index__hero" } },
                  "classIds" => [], "breakpointOverrides" => {} },
        "n2" => { "id" => "n2", "moduleId" => "base.container", "children" => [],
                  "props" => { "text" => "About",
                               "htmlAttributes" => { "id" => "index__about" } },
                  "classIds" => [], "breakpointOverrides" => {} },
      },
    }
    Page.create(slug: "index", title: "Home", kind: "page", status: "published",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)

    payload = JSON.parse(call_tool("read_page", { "slug" => "index", "sectionId" => "index__hero" }).dig("content", 0, "text"))
    assert_equal "n1", payload.fetch("nodeId")
    assert_includes payload.fetch("outline"), "sectionId=index__hero"
    refute_includes payload.fetch("outline"), "[n2]"
  end

  def test_list_pages_returns_the_pages
    page!(slug: "index", title: "Home")
    page!(slug: "about", title: "About us", status: "draft")

    payload = JSON.parse(call_tool("list_pages").dig("content", 0, "text"))

    assert_equal 2, payload.fetch("total")
    assert_equal %w[about index], payload.fetch("pages").map { |entry| entry.fetch("slug") }
  end

  def test_list_pages_can_filter_by_status
    page!(slug: "index")
    page!(slug: "draft-one", status: "draft")

    payload = JSON.parse(call_tool("list_pages", { "status" => "draft" }).dig("content", 0, "text"))

    assert_equal ["draft-one"], payload.fetch("pages").map { |entry| entry.fetch("slug") }
  end

  # A model that asks for 10_000 rows should get a usable answer, not an
  # error and not a context window full of pages.
  def test_a_silly_limit_is_clamped
    3.times { |i| page!(slug: "page-#{i}") }

    payload = JSON.parse(call_tool("list_pages", { "limit" => 99_999 }).dig("content", 0, "text"))

    assert_equal 3, payload.fetch("pages").length
  end

  def test_a_string_limit_is_coerced_rather_than_refused
    page!(slug: "index")

    outcome = call_tool("list_pages", { "limit" => "1" })

    refute outcome.fetch("isError")
  end

  # A bad argument comes back as a tool RESULT flagged isError, so the model
  # can read the message and retry. A JSON-RPC error would abort the call.
  def test_a_bad_argument_is_returned_to_the_model_not_raised
    outcome = call_tool("list_pages", { "status" => "nonsense" })

    assert outcome.fetch("isError")
    assert_match(/status must be one of/, outcome.dig("content", 0, "text"))
  end

  def test_an_unknown_tool_is_a_jsonrpc_error
    rpc({ jsonrpc: "2.0", id: 7, method: "tools/call",
          params: { name: "drop_database", arguments: {} } })

    assert_equal McpServer::INVALID_PARAMS, body.dig("error", "code")
  end

  # A tool that raises must not take the connection down with it.
  def test_a_throwing_tool_becomes_an_error_result
    server = McpServer.new(tools: [{
      name: "boom", title: "Boom", description: "always fails",
      input_schema: { "type" => "object" },
      run: ->(_args) { raise "kaboom" },
    }])

    _status, reply = server.call({ "jsonrpc" => "2.0", "id" => 1, "method" => "tools/call",
                                   "params" => { "name" => "boom", "arguments" => {} } })

    assert reply.dig(:result, :isError)
    refute reply.key?(:error)
  end

  # ── read_page ────────────────────────────────────────────────────────────
  #
  # The outline is the read surface an agent edits against. Ruby has no
  # equivalent of the editor's `annotateNodeIds`, so rather than write a second
  # annotator that would drift, this is derived from the stored document —
  # which is the source of truth either way.

  def commerce_page!(slug: "shop")
    block = JSON.parse(File.read(File.expand_path("../../../examples/product-card.dukafy-block.json", __dir__)))["block"]
    nodes = block.fetch("nodes").merge(
      "b" => { "id" => "b", "moduleId" => "base.body", "children" => block.fetch("rootNodeIds"),
               "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
    )
    document = { "id" => slug, "slug" => slug, "title" => "Shop", "rootNodeId" => "b", "nodes" => nodes }
    Page.create(slug:, title: "Shop", kind: "page", status: "draft",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)
    state = SiteState.new
    state.site = { "styleRules" => block.fetch("classes", {}) }
    state.created_at = Time.now
    state.updated_at = Time.now
    state.save
  end

  def outline_for(slug)
    JSON.parse(call_tool("read_page", { "slug" => slug }).dig("content", 0, "text")).fetch("outline")
  end

  def test_read_page_names_every_node_by_id
    page!(slug: "index")

    assert_match(/\[b\]\s+base\.body/, outline_for("index"))
  end

  # Mangled class ids (`tw-flex_col`) are useless to a model; the readable name
  # lives in the site's styleRules and has to be resolved.
  def test_class_ids_are_resolved_to_real_class_names
    SiteState.dataset.delete
    commerce_page!

    outline = outline_for("shop")
    assert_includes outline, ".rounded-xl"
    refute_includes outline, "tw-rounded_xl"
  end

  # The commerce overlays are the reason a plain HTML dump would not do: they
  # are what makes a product card behave like one.
  def test_the_outline_carries_bindings_actions_and_conditions
    SiteState.dataset.delete
    commerce_page!

    outline = outline_for("shop")
    assert_includes outline, "bind:text=currentEntry.title"
    assert_includes outline, "action=cart.addItem"
    assert_includes outline, "visibleWhen=currentEntry.inCart:isFalse"
    assert_includes outline, "region=cart"
  end

  def test_reading_an_unknown_page_tells_the_model_how_to_recover
    outcome = call_tool("read_page", { "slug" => "no-such-page" })

    assert outcome.fetch("isError")
    assert_match(/list_pages/, outcome.dig("content", 0, "text"))
  end

  def test_json_format_returns_the_raw_document
    page!(slug: "index")

    payload = JSON.parse(call_tool("read_page", { "slug" => "index", "format" => "json" })
                           .dig("content", 0, "text"))

    assert_equal "b", payload.fetch("rootNodeId")
    assert payload.fetch("nodes").key?("b")
  end

  def test_reading_the_published_version_of_a_never_published_page_says_so
    page!(slug: "index", status: "draft")

    outcome = call_tool("read_page", { "slug" => "index", "version" => "published" })

    assert outcome.fetch("isError")
    assert_match(/never been published/, outcome.dig("content", 0, "text"))
  end

  # A malformed document must not spin the server. `children` pointing back up
  # the tree is the shape that would.
  def test_a_cycle_in_the_tree_terminates
    document = {
      "id" => "loop", "slug" => "loop", "title" => "Loop", "rootNodeId" => "a",
      "nodes" => {
        "a" => { "id" => "a", "moduleId" => "base.body", "children" => ["b"],
                 "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "b" => { "id" => "b", "moduleId" => "base.container", "children" => ["a"],
                 "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
      },
    }
    Page.create(slug: "loop", title: "Loop", kind: "page", status: "draft",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)

    outline = outline_for("loop")

    assert_equal 2, outline.lines.length
  end

  # ── The modern era (2026-07-28) ──────────────────────────────────────────
  #
  # 2026-07-28 removed the initialize handshake. Every request carries its own
  # version in `_meta`, mirrors routing fields into headers, and asks what the
  # server can do with `server/discover`.

  MODERN = McpServer::MODERN_VERSION

  def modern_rpc(body, headers: {}, name: nil)
    meta = { McpServer::META_PROTOCOL_VERSION => MODERN }
    params = (body[:params] || {}).merge(_meta: meta)
    env = { "HTTP_MCP_PROTOCOL_VERSION" => MODERN, "HTTP_MCP_METHOD" => body.fetch(:method) }
    env["HTTP_MCP_NAME"] = name if name
    # A nil override means "send no such header" — Rack env values must be
    # strings, so the key is removed rather than set to nil.
    merged = env.merge(headers).reject { |_key, value| value.nil? }
    rpc(body.merge(params: params), headers: merged)
  end

  def test_server_discover_reports_versions_capabilities_and_identity
    modern_rpc({ jsonrpc: "2.0", id: 1, method: "server/discover" })

    assert_equal 200, last_response.status
    assert_equal "complete", result.fetch("resultType")
    assert_includes result.fetch("supportedVersions"), MODERN
    assert result.fetch("capabilities").key?("tools")
    assert_equal "dukafi", result.dig("_meta", McpServer::META_SERVER_INFO, "name")
  end

  def test_tools_work_in_the_modern_era
    page!(slug: "index")

    modern_rpc({ jsonrpc: "2.0", id: 2, method: "tools/call",
                 params: { name: "list_pages", arguments: {} } }, name: "list_pages")

    assert_equal 200, last_response.status
    refute result.fetch("isError")
  end

  # Mcp-Method is REQUIRED. Without it an intermediary routing on headers and
  # a server executing on the body could disagree about what is being called.
  def test_a_modern_request_without_the_method_header_is_refused
    modern_rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" },
               headers: { "HTTP_MCP_METHOD" => nil })

    assert_equal 400, last_response.status
    assert_equal McpServer::HEADER_MISMATCH, body.dig("error", "code")
  end

  def test_a_method_header_that_disagrees_with_the_body_is_refused
    modern_rpc({ jsonrpc: "2.0", id: 4, method: "tools/list" },
               headers: { "HTTP_MCP_METHOD" => "tools/call" })

    assert_equal 400, last_response.status
    assert_equal McpServer::HEADER_MISMATCH, body.dig("error", "code")
  end

  def test_tools_call_requires_a_name_header
    modern_rpc({ jsonrpc: "2.0", id: 5, method: "tools/call",
                 params: { name: "list_pages", arguments: {} } })

    assert_equal 400, last_response.status
    assert_equal McpServer::HEADER_MISMATCH, body.dig("error", "code")
  end

  # A name that is not plain ASCII travels as `=?base64?...?=` and must be
  # decoded before being compared with the body.
  def test_a_base64_encoded_name_header_is_decoded_before_comparison
    page!(slug: "index")
    encoded = "=?base64?#{Base64.strict_encode64('list_pages')}?="

    modern_rpc({ jsonrpc: "2.0", id: 6, method: "tools/call",
                 params: { name: "list_pages", arguments: {} } }, name: encoded)

    assert_equal 200, last_response.status
    refute result.fetch("isError")
  end

  def test_the_header_and_meta_versions_must_agree
    rpc({ jsonrpc: "2.0", id: 7, method: "tools/list",
          params: { _meta: { McpServer::META_PROTOCOL_VERSION => MODERN } } },
        headers: { "HTTP_MCP_PROTOCOL_VERSION" => "2025-06-18",
                   "HTTP_MCP_METHOD" => "tools/list" })

    assert_equal 400, last_response.status
    assert_equal McpServer::HEADER_MISMATCH, body.dig("error", "code")
  end

  # A version we do not speak must come back naming the ones we do, so the
  # client can retry rather than give up.
  def test_an_unsupported_version_lists_what_we_support
    rpc({ jsonrpc: "2.0", id: 8, method: "tools/list",
          params: { _meta: { McpServer::META_PROTOCOL_VERSION => "1900-01-01" } } },
        headers: { "HTTP_MCP_METHOD" => "tools/list" })

    assert_equal 400, last_response.status
    assert_equal McpServer::UNSUPPORTED_PROTOCOL_VERSION, body.dig("error", "code")
    assert_includes body.dig("error", "data", "supported"), MODERN
    assert_equal "1900-01-01", body.dig("error", "data", "requested")
  end

  # In the modern era an unknown method is HTTP 404 — and the JSON-RPC body is
  # what distinguishes it from a 404 returned by a server with no MCP endpoint
  # at all, which is how dual-era clients decide whether to fall back.
  def test_an_unknown_modern_method_is_a_404_with_a_jsonrpc_body
    modern_rpc({ jsonrpc: "2.0", id: 9, method: "nonsense/method" })

    assert_equal 404, last_response.status
    assert_equal McpServer::METHOD_NOT_FOUND, body.dig("error", "code")
  end

  # The whole point of dual-era: an old client keeps working unchanged.
  def test_a_legacy_client_is_still_served_alongside_modern_ones
    rpc({ jsonrpc: "2.0", id: 10, method: "initialize",
          params: { protocolVersion: "2025-06-18" } })

    assert_equal 200, last_response.status
    assert_equal "2025-06-18", result.fetch("protocolVersion")
  end
end
