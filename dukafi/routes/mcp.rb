require "json"

# MCP, the HTTP half — the Streamable HTTP transport.
#
# Its own Roda app rather than a branch of AdminApi because almost nothing is
# shared: bearer tokens instead of a session cookie, JSON-RPC instead of REST,
# and hand-built response triplets instead of the `json` plugin (which would
# stamp application/json onto a 202 that must have no body at all).
#
# 2026-07-28 removed protocol sessions and the GET stream, so this endpoint is
# POST-only and stateless. GET and DELETE answer 405, which the spec names as
# the correct reply for a server that offers neither.
#
# The HTTP STATUS comes from McpServer, not from here: an unknown method is
# 404 in the modern era and a 200-wrapped error in the legacy one, and only the
# protocol layer knows which era a request is in.
class Mcp < Roda
  plugin :halt

  # Bodies are small JSON-RPC messages. A cap stops an unauthenticated POST
  # from making us allocate megabytes before the token is even checked.
  MAX_BODY_BYTES = 1_048_576

  def json_response(status, payload, headers = {})
    body = JSON.generate(payload)
    request.halt([status, { "content-type" => "application/json" }.merge(headers), [body]])
  end

  # A transport-level failure, outside any JSON-RPC exchange. `id` is null
  # because there may be no message to attribute it to.
  def rpc_error!(status, code, message)
    json_response(status, { jsonrpc: "2.0", id: nil, error: { code: code, message: message } })
  end

  # DNS rebinding: a page on any origin could POST to a local Dukafi and drive
  # the merchant's store from a hostile tab. The spec requires validating
  # Origin, and requires 403 when it is present and invalid. Real MCP clients
  # (Cursor, Lovable, Claude Code) send no Origin at all, which is why absence
  # is allowed and only a PRESENT, unexpected origin is refused.
  def check_origin!(env)
    origin = env["HTTP_ORIGIN"].to_s
    return if origin.empty?

    host = env["HTTP_HOST"].to_s
    allowed = [
      "http://#{host}", "https://#{host}",
      *ENV.fetch("DUKAFI_MCP_ALLOWED_ORIGINS", "").split(",").map(&:strip).reject(&:empty?),
    ]
    return if allowed.include?(origin)

    rpc_error!(403, McpServer::INVALID_REQUEST, "Origin not allowed: #{origin}")
  end

  # Two credentials reach the same endpoint, because clients differ in what
  # they can send:
  #
  #   · a personal access token — Cursor, Claude Code, Lovable, anything that
  #     lets a human paste a bearer header.
  #   · an OAuth access token — Claude's hosted connectors, whose UI has no
  #     custom-header field at all, so a PAT simply cannot be used there.
  #
  # Returns the granted scopes. A PAT is unscoped by design: the merchant
  # generated it themselves in the admin, so it carries everything.
  def authenticate!(env)
    header = env["HTTP_AUTHORIZATION"]

    if (pat = PersonalAccessToken.from_header(header))
      return { source: :pat, token: pat, scopes: OauthMetadata::SCOPES.keys }
    end

    presented = header.to_s[/\ABearer\s+(.+)\z/i, 1].to_s.strip
    token = OauthToken.authenticate(presented) unless presented.empty?

    # An OAuth token minted for a DIFFERENT Dukafi must not work here. This is
    # the confused-deputy case RFC 8707's resource parameter exists to stop.
    if token && !OauthMetadata.audience_matches?(token.resource, env)
      unauthorized!(env, "invalid_token", "This token was issued for a different server")
    end

    return { source: :oauth, token: token, scopes: token.scopes } if token

    unauthorized!(env, nil, nil)
  end

  # The challenge is what makes hosted clients able to recover: it carries the
  # protected-resource metadata URL, which is the first link in the discovery
  # chain that ends with the merchant approving a consent screen.
  def unauthorized!(env, error, description)
    json_response(
      401,
      { jsonrpc: "2.0", id: nil,
        error: { code: McpServer::INVALID_REQUEST, message: description || "Authorization required" } },
      { "www-authenticate" => OauthMetadata.challenge(env, scope: OauthMetadata::READ_SCOPE,
                                                           error: error, description: description) },
    )
  end

  # Reads need `mcp:read`; anything that changes the store needs `mcp:write`.
  # 403 with `insufficient_scope` is what tells a client to re-authorize for
  # more, rather than treating it as a dead end.
  def authorize_tool!(env, auth, message)
    return unless message.is_a?(Hash) && message["method"] == "tools/call"

    name = message.dig("params", "name").to_s
    required = McpTools.write_tool?(name) ? OauthMetadata::WRITE_SCOPE : OauthMetadata::READ_SCOPE
    return if auth.fetch(:scopes).include?(required)

    json_response(
      403,
      { jsonrpc: "2.0", id: message["id"],
        error: { code: McpServer::INVALID_REQUEST,
                 message: "This connection is not authorized to #{required == OauthMetadata::WRITE_SCOPE ? 'change' : 'read'} the store" } },
      { "www-authenticate" => OauthMetadata.challenge(env, scope: required, error: "insufficient_scope") },
    )
  end

  # The routing fields the transport mirrors into headers so intermediaries can
  # route without parsing the body. McpServer checks them against the body.
  def mcp_headers(env)
    {
      protocol_version: env["HTTP_MCP_PROTOCOL_VERSION"],
      method: env["HTTP_MCP_METHOD"],
      name: env["HTTP_MCP_NAME"],
    }
  end

  route do |r|
    check_origin!(r.env)
    auth = authenticate!(r.env)

    r.post do
      body = r.body.read(MAX_BODY_BYTES).to_s
      rpc_error!(400, McpServer::INVALID_REQUEST, "Empty request body") if body.empty?

      message =
        begin
          JSON.parse(body)
        rescue JSON::ParserError => e
          rpc_error!(400, McpServer::PARSE_ERROR, "Invalid JSON: #{e.message}")
        end

      # A batch is a JSON array. Batching was removed in 2025-06-18, so this is
      # refused explicitly rather than silently answering only the first.
      if message.is_a?(Array)
        rpc_error!(400, McpServer::INVALID_REQUEST, "JSON-RPC batching is not supported")
      end

      authorize_tool!(r.env, auth, message)

      status, reply = McpServer.new.call(message, mcp_headers(r.env))

      # A notification gets 202 with NO body — Rack forbids a content-type on
      # an empty 202, and the json plugin would add one, which is the second
      # reason this app does not load it.
      r.halt([202, {}, []]) if reply.nil?

      json_response(status, reply)
    end

    # 2026-07-28 removed the GET stream and sessions alike. "HTTP GET or DELETE
    # to the MCP endpoint: respond with 405 Method Not Allowed."
    r.get { r.halt([405, { "content-type" => "text/plain" }, ["This endpoint is POST-only"]]) }
    r.delete { r.halt([405, { "content-type" => "text/plain" }, ["This server does not use sessions"]]) }

    rpc_error!(405, McpServer::INVALID_REQUEST, "Method not allowed")
  end
end
