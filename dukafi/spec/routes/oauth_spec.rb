require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require "base64"
require "cgi"
require "digest"
require_relative "../../app"

# The authorization server.
#
# This exists because Claude's hosted connectors have no field for a bearer
# token — OAuth is the only way in, so a personal access token cannot be used
# there at all. Everything here is a security property rather than a feature:
# each test names the attack it closes.
class OauthSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Rack::Lint.new(Dukafi.app)

  REDIRECT = "https://claude.ai/api/mcp/auth_callback".freeze

  def setup
    OauthToken.dataset.delete
    OauthAuthorizationCode.dataset.delete
    OauthClient.dataset.delete
    Page.dataset.delete
    Admin.dataset.delete
    SiteState.dataset.delete
    clear_cookies
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def post_form(path, payload)
    post path, URI.encode_www_form(payload), "CONTENT_TYPE" => "application/x-www-form-urlencoded"
  end

  def body = JSON.parse(last_response.body)

  def sign_in!
    post_json "/admin/api/cms/setup",
              siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def register!(redirect_uris: [REDIRECT])
    post_json "/admin/oauth/register", client_name: "Claude", redirect_uris: redirect_uris
    body.fetch("client_id")
  end

  def pkce
    verifier = SecureRandom.urlsafe_base64(48)
    [verifier, Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false)]
  end

  def authorize_params(client_id, challenge, scope: "mcp:read mcp:write", **extra)
    { client_id:, redirect_uri: REDIRECT, response_type: "code",
      code_challenge: challenge, code_challenge_method: "S256",
      scope:, resource: "http://example.org/admin/api/mcp" }.merge(extra)
  end

  def approve!(client_id, challenge, **extra)
    post "/admin/oauth/authorize", authorize_params(client_id, challenge, **extra).merge(approve: "yes")
    query = CGI.parse(URI(last_response.headers.fetch("location")).query)
    { code: query["code"].first, state: query["state"].first,
      iss: query["iss"].first, error: query["error"].first }
  end

  def exchange(client_id, code, verifier, redirect_uri: REDIRECT)
    post_form "/admin/oauth/token", grant_type: "authorization_code", code:, client_id:,
                              redirect_uri:, code_verifier: verifier
    body
  end

  def granted!(scope: "mcp:read mcp:write")
    sign_in!
    client_id = register!
    verifier, challenge = pkce
    code = approve!(client_id, challenge, scope: scope).fetch(:code)
    [client_id, exchange(client_id, code, verifier)]
  end

  def mcp_call(tool, token)
    post "/admin/api/mcp",
         JSON.generate({ jsonrpc: "2.0", id: 1, method: "tools/call",
                         params: { name: tool, arguments: {},
                                   _meta: { McpServer::META_PROTOCOL_VERSION => McpServer::MODERN_VERSION } } }),
         { "CONTENT_TYPE" => "application/json", "HTTP_AUTHORIZATION" => "Bearer #{token}",
           "HTTP_MCP_PROTOCOL_VERSION" => McpServer::MODERN_VERSION,
           "HTTP_MCP_METHOD" => "tools/call", "HTTP_MCP_NAME" => tool }
  end

  # ── Discovery ────────────────────────────────────────────────────────────

  # Without this chain a hosted client cannot connect at all: it has no way to
  # learn where to register or authorize.
  def test_an_unauthenticated_request_points_at_the_metadata
    post "/admin/api/mcp", "{}", "CONTENT_TYPE" => "application/json"

    assert_equal 401, last_response.status
    challenge = last_response.headers.fetch("www-authenticate")
    assert_includes challenge, "/.well-known/oauth-protected-resource"
    assert_includes challenge, 'scope="mcp:read"'
  end

  def test_protected_resource_metadata_names_the_authorization_server
    get "/.well-known/oauth-protected-resource"

    assert_equal 200, last_response.status
    assert_equal "http://example.org/admin/api/mcp", body.fetch("resource")
    assert_includes body.fetch("authorization_servers"), "http://example.org"
  end

  def test_authorization_server_metadata_advertises_only_s256
    get "/.well-known/oauth-authorization-server"

    assert_equal ["S256"], body.fetch("code_challenge_methods_supported")
    assert_equal ["none"], body.fetch("token_endpoint_auth_methods_supported")
    # RFC 9207 — clients key their `iss` validation on this flag.
    assert body.fetch("authorization_response_iss_parameter_supported")
  end

  # ── Registration ─────────────────────────────────────────────────────────

  def test_a_client_can_register_itself
    post_json "/admin/oauth/register", client_name: "Claude", redirect_uris: [REDIRECT]

    assert_equal 201, last_response.status
    assert body.fetch("client_id").start_with?("dkfc_")
    # Public client: there is no secret, because a desktop app cannot keep one.
    refute body.key?("client_secret")
    assert_equal "none", body.fetch("token_endpoint_auth_method")
  end

  def test_a_redirect_uri_that_could_run_script_is_refused
    post_json "/admin/oauth/register", client_name: "Evil", redirect_uris: ["javascript:alert(1)"]

    assert_equal 400, last_response.status
  end

  def test_plain_http_is_refused_unless_it_is_loopback
    post_json "/admin/oauth/register", client_name: "Evil", redirect_uris: ["http://evil.example/cb"]
    assert_equal 400, last_response.status

    post_json "/admin/oauth/register", client_name: "Local", redirect_uris: ["http://127.0.0.1:8976/cb"]
    assert_equal 201, last_response.status
  end

  # ── Authorization ────────────────────────────────────────────────────────

  def test_the_consent_screen_names_the_client_and_what_it_gets
    sign_in!
    client_id = register!
    _verifier, challenge = pkce

    get "/admin/oauth/authorize?#{URI.encode_www_form(authorize_params(client_id, challenge))}"

    assert_equal 200, last_response.status
    assert_includes last_response.body, "Claude"
    assert_includes last_response.body, "mcp:write"
    assert_includes last_response.body, "owner@example.com"
  end

  # The decision belongs to the store owner, and a logged-out visitor is not
  # yet known to be them.
  def test_a_logged_out_visitor_is_sent_to_log_in_first
    client_id = register!
    _verifier, challenge = pkce

    get "/admin/oauth/authorize?#{URI.encode_www_form(authorize_params(client_id, challenge))}"

    assert_equal 302, last_response.status
    assert_includes last_response.headers.fetch("location"), "/admin"
  end

  # Redirecting an error to an unverified URI is the open-redirect hole: it
  # would make this endpoint a way to bounce users anywhere.
  def test_an_unregistered_redirect_uri_renders_rather_than_redirects
    sign_in!
    client_id = register!
    _verifier, challenge = pkce

    get "/admin/oauth/authorize?#{URI.encode_www_form(authorize_params(client_id, challenge).merge(redirect_uri: 'https://evil.example/steal'))}"

    assert_equal 400, last_response.status
    assert_equal "invalid_request", body.fetch("error")
  end

  def test_declining_returns_access_denied_rather_than_a_code
    sign_in!
    client_id = register!
    _verifier, challenge = pkce

    post "/admin/oauth/authorize", authorize_params(client_id, challenge).merge(approve: "no")

    query = CGI.parse(URI(last_response.headers.fetch("location")).query)
    assert_equal "access_denied", query["error"].first
    assert_nil query["code"].first
  end

  # OAuth 2.1 removed `plain`; accepting it would let anyone who observed the
  # authorization request complete the exchange.
  def test_plain_pkce_is_refused
    sign_in!
    client_id = register!
    _verifier, challenge = pkce

    post "/admin/oauth/authorize",
         authorize_params(client_id, challenge).merge(code_challenge_method: "plain", approve: "yes")

    query = CGI.parse(URI(last_response.headers.fetch("location")).query)
    assert_equal "invalid_request", query["error"].first
  end

  def test_state_and_iss_come_back_on_the_redirect
    sign_in!
    client_id = register!
    _verifier, challenge = pkce

    outcome = approve!(client_id, challenge, state: "opaque-value")

    assert_equal "opaque-value", outcome.fetch(:state)
    assert_equal "http://example.org", outcome.fetch(:iss)
  end

  # ── Token exchange ───────────────────────────────────────────────────────

  def test_a_code_becomes_a_token
    _client_id, token = granted!

    assert_equal "Bearer", token.fetch("token_type")
    assert_equal OauthToken::ACCESS_LIFETIME, token.fetch("expires_in")
    assert token.fetch("access_token").start_with?("dkfa_")
    assert token.fetch("refresh_token").start_with?("dkfr_")
  end

  # PKCE is the whole security of a public client: without the verifier, an
  # intercepted code is worthless.
  def test_the_wrong_verifier_cannot_redeem_a_code
    sign_in!
    client_id = register!
    _verifier, challenge = pkce
    code = approve!(client_id, challenge).fetch(:code)

    outcome = exchange(client_id, code, "not-the-verifier")

    assert_equal 400, last_response.status
    assert_equal "invalid_grant", outcome.fetch("error")
  end

  def test_a_code_cannot_be_redeemed_for_a_different_redirect_uri
    sign_in!
    client_id = register!
    verifier, challenge = pkce
    code = approve!(client_id, challenge).fetch(:code)

    exchange(client_id, code, verifier, redirect_uri: "https://claude.ai/other")

    assert_equal 400, last_response.status
  end

  # A code presented twice means it leaked. OAuth 2.1 says to revoke what was
  # already issued from it, not merely refuse the replay — because the holder
  # of the replay may already have a working token.
  def test_replaying_a_code_revokes_the_tokens_it_produced
    sign_in!
    client_id = register!
    verifier, challenge = pkce
    code = approve!(client_id, challenge).fetch(:code)
    first = exchange(client_id, code, verifier)

    exchange(client_id, code, verifier)
    assert_equal 400, last_response.status

    mcp_call("list_pages", first.fetch("access_token"))
    assert_equal 401, last_response.status
  end

  def test_an_expired_code_is_refused
    sign_in!
    client_id = register!
    verifier, challenge = pkce
    code = approve!(client_id, challenge).fetch(:code)
    OauthAuthorizationCode.dataset.update(expires_at: Time.now - 5)

    exchange(client_id, code, verifier)

    assert_equal 400, last_response.status
  end

  # ── Refresh ──────────────────────────────────────────────────────────────

  def test_refreshing_rotates_both_tokens
    client_id, token = granted!

    post_form "/admin/oauth/token", grant_type: "refresh_token",
                              refresh_token: token.fetch("refresh_token"), client_id: client_id

    assert_equal 200, last_response.status
    refute_equal token.fetch("access_token"), body.fetch("access_token")
    refute_equal token.fetch("refresh_token"), body.fetch("refresh_token")
  end

  # Rotation is what makes a stolen refresh token detectable: the moment both
  # copies are used, the family is burned.
  def test_reusing_a_spent_refresh_token_is_refused
    client_id, token = granted!
    post_form "/admin/oauth/token", grant_type: "refresh_token",
                              refresh_token: token.fetch("refresh_token"), client_id: client_id

    post_form "/admin/oauth/token", grant_type: "refresh_token",
                              refresh_token: token.fetch("refresh_token"), client_id: client_id

    assert_equal 400, last_response.status
    assert_equal "invalid_grant", body.fetch("error")
  end

  def test_another_client_cannot_use_someone_elses_refresh_token
    _client_id, token = granted!
    other = register!(redirect_uris: ["https://other.example/cb"])

    post_form "/admin/oauth/token", grant_type: "refresh_token",
                              refresh_token: token.fetch("refresh_token"), client_id: other

    assert_equal 400, last_response.status
  end

  # ── Using the token ──────────────────────────────────────────────────────

  def test_an_oauth_token_authenticates_an_mcp_call
    _client_id, token = granted!

    mcp_call("list_pages", token.fetch("access_token"))

    assert_equal 200, last_response.status
  end

  def test_an_expired_access_token_is_refused
    _client_id, token = granted!
    OauthToken.dataset.update(expires_at: Time.now - 5)

    mcp_call("list_pages", token.fetch("access_token"))

    assert_equal 401, last_response.status
  end

  # The point of scopes: an agent can be allowed to look without being allowed
  # to touch. 403 + insufficient_scope is what tells it to ask for more rather
  # than treat this as a dead end.
  def test_a_read_only_token_cannot_write
    _client_id, token = granted!(scope: "mcp:read")

    mcp_call("list_pages", token.fetch("access_token"))
    assert_equal 200, last_response.status

    mcp_call("publish", token.fetch("access_token"))
    assert_equal 403, last_response.status
    assert_includes last_response.headers.fetch("www-authenticate"), 'error="insufficient_scope"'
    assert_includes last_response.headers.fetch("www-authenticate"), 'scope="mcp:write"'
  end

  # A token minted for another Dukafi must not work here — the confused-deputy
  # case the resource parameter exists to prevent.
  def test_a_token_for_a_different_server_is_refused
    _client_id, token = granted!
    OauthToken.dataset.update(resource: "https://someone-elses-store.example/admin/api/mcp")

    mcp_call("list_pages", token.fetch("access_token"))

    assert_equal 401, last_response.status
  end

  # A personal access token stays unscoped: the merchant made it themselves in
  # the admin, so it carries everything.
  def test_a_personal_access_token_still_works_and_can_write
    _record, pat = PersonalAccessToken.issue!(name: "Cursor")

    mcp_call("list_pages", pat)

    assert_equal 200, last_response.status
  end

  # Forgetting to classify a new tool must fail CLOSED — treated as a write,
  # not silently readable by a read-only connection.
  def test_an_unclassified_tool_counts_as_a_write
    assert McpTools.write_tool?("some_new_tool_nobody_classified")
    refute McpTools.write_tool?("list_pages")
  end
end
