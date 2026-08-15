require "uri"

# The discovery documents that make an MCP client able to authorize itself.
#
# A client that gets a 401 from the MCP endpoint reads `WWW-Authenticate` for
# the protected-resource metadata URL, fetches that to learn which
# authorization server to use, fetches the authorization server's metadata to
# learn where to register and authorize, and only then opens a browser. Every
# step is machine-driven; nothing here is configured by hand, which is the
# whole reason a hosted client like Claude can connect at all.
#
# Dukafi is both the resource server and the authorization server. That is
# unusual for OAuth and entirely normal here: one deploy is one store with one
# owner, so there is nothing to federate.
module OauthMetadata
  # What the tools divide into. Reads never change anything; writes edit the
  # draft and can publish it. Keeping them separate means a merchant can grant
  # an agent the ability to look without the ability to change.
  SCOPES = {
    "mcp:read" => "Read your pages, products and form submissions",
    "mcp:write" => "Edit and publish your site",
  }.freeze

  READ_SCOPE = "mcp:read".freeze
  WRITE_SCOPE = "mcp:write".freeze

  module_function

  # The externally reachable origin. Behind Railway or any other proxy the
  # request's own Host is what the client used, so it is what the metadata
  # must advertise — an origin derived from local config would send clients to
  # an address they cannot reach.
  def origin(env)
    configured = ENV["DUKAFI_PUBLIC_ORIGIN"].to_s
    return configured.sub(%r{/+\z}, "") unless configured.empty?

    host = env["HTTP_X_FORWARDED_HOST"] || env["HTTP_HOST"] || "localhost"
    scheme = env["HTTP_X_FORWARDED_PROTO"] || env["rack.url_scheme"] || "http"
    "#{scheme.split(',').first.strip}://#{host.split(',').first.strip}"
  end

  # RFC 8707 canonical URI for this MCP server — the audience every token is
  # bound to. No trailing slash, no fragment, per the spec's guidance.
  def resource_uri(env) = "#{origin(env)}/admin/api/mcp"

  def protected_resource_url(env) = "#{origin(env)}/.well-known/oauth-protected-resource"

  # RFC 9728. Points at ourselves as the authorization server.
  def protected_resource(env)
    {
      resource: resource_uri(env),
      authorization_servers: [origin(env)],
      scopes_supported: SCOPES.keys,
      bearer_methods_supported: ["header"],
      resource_name: "Dukafi",
    }
  end

  # RFC 8414.
  def authorization_server(env)
    base = origin(env)
    {
      issuer: base,
      authorization_endpoint: "#{base}/admin/oauth/authorize",
      token_endpoint: "#{base}/admin/oauth/token",
      registration_endpoint: "#{base}/admin/oauth/register",
      scopes_supported: SCOPES.keys,
      response_types_supported: ["code"],
      grant_types_supported: %w[authorization_code refresh_token],
      # S256 only — OAuth 2.1 removed `plain`, and advertising it would invite
      # a client to use it.
      code_challenge_methods_supported: ["S256"],
      # Public clients: there is no secret to authenticate with.
      token_endpoint_auth_methods_supported: ["none"],
      # RFC 9207. We return `iss` on authorization responses, so say so —
      # clients key their validation on this flag.
      authorization_response_iss_parameter_supported: true,
      resource_indicators_supported: true,
    }
  end

  # The 401 challenge. `resource_metadata` is what starts the whole discovery
  # chain; without it a client has no way to find the authorization server.
  def challenge(env, scope: nil, error: nil, description: nil)
    parts = [%(resource_metadata="#{protected_resource_url(env)}")]
    parts << %(error="#{error}") if error
    parts << %(error_description="#{description}") if description
    parts << %(scope="#{scope}") if scope
    "Bearer #{parts.join(', ')}"
  end

  # A token is only valid for the server it was minted for. Accepting one
  # issued elsewhere is the confused-deputy attack the resource parameter
  # exists to prevent.
  def audience_matches?(token_resource, env)
    return true if token_resource.to_s.empty?

    normalize(token_resource) == normalize(resource_uri(env))
  end

  def normalize(uri) = uri.to_s.downcase.sub(%r{/+\z}, "")
end
