require "cgi"
require "json"
require "uri"

# The authorization server.
#
# Everything a hosted MCP client needs to get a token without the merchant
# copying a credential anywhere: register itself, send the merchant to a
# consent screen, exchange a code. Claude's connector UI has no field for a
# bearer token, which is exactly why this exists — a personal access token
# cannot be used there at all.
#
# Mounted under /admin. The paths are advertised in the authorization server
# metadata, so they are free to live anywhere — and putting them there avoids
# reserving a top-level slug a merchant might want for a page.
#
# Two of these (register, token) are called by machines with no session; only
# `authorize` needs the merchant to be logged in.
class Oauth < Roda
  plugin :halt
  plugin :sessions, secret: SessionSecret.fetch

  MAX_BODY_BYTES = 64 * 1024

  def json!(status, payload, headers = {})
    request.halt([status, { "content-type" => "application/json",
                            "cache-control" => "no-store" }.merge(headers),
                  [JSON.generate(payload)]])
  end

  def oauth_error!(status, code, description)
    json!(status, { error: code, error_description: description })
  end

  def html!(status, body)
    request.halt([status, { "content-type" => "text/html; charset=utf-8",
                            "cache-control" => "no-store" }, [body]])
  end

  def params_from_body(request_scope)
    body = request_scope.body.read(MAX_BODY_BYTES).to_s
    return {} if body.empty?

    # Registration posts JSON; the token endpoint posts a form. Both are
    # normal, so accept either rather than making clients guess.
    if request_scope.env["CONTENT_TYPE"].to_s.include?("json")
      parsed = JSON.parse(body)
      parsed.is_a?(Hash) ? parsed : {}
    else
      CGI.parse(body).transform_values(&:first)
    end
  rescue JSON::ParserError
    {}
  end

  def current_admin
    admin_id = session["admin_id"]
    admin_id && Admin[admin_id]
  end

  # Only scopes we actually define, and never an empty grant.
  def requested_scopes(raw)
    asked = raw.to_s.split(/\s+/).reject(&:empty?)
    return [OauthMetadata::READ_SCOPE] if asked.empty?

    asked & OauthMetadata::SCOPES.keys
  end

  def redirect_with(uri, params)
    separator = uri.include?("?") ? "&" : "?"
    "#{uri}#{separator}#{URI.encode_www_form(params)}"
  end

  route do |r|
    # ── Dynamic client registration (RFC 7591) ────────────────────────────
    #
    # Unauthenticated, as the spec requires. A client id on its own grants
    # nothing: every authorization still needs the merchant to approve it in a
    # browser while logged in.
    r.post "register" do
      params = params_from_body(r)
      begin
        client = OauthClient.register!(
          name: params["client_name"],
          redirect_uris: params["redirect_uris"],
          software_id: params["software_id"],
        )
      rescue ArgumentError => e
        oauth_error!(400, "invalid_redirect_uri", e.message)
      end

      json!(201, client.to_registration_payload)
    end

    # ── Authorization ──────────────────────────────────────────────────────
    r.on "authorize" do
      client_id = r.params["client_id"].to_s
      redirect_uri = r.params["redirect_uri"].to_s
      state = r.params["state"].to_s
      resource = r.params["resource"].to_s

      client = OauthClient.first(client_id: client_id)
      # Before the redirect_uri is validated there is nowhere safe to send an
      # error to — redirecting to an unverified URI is the open-redirect hole.
      # So these two failures render, they do not redirect.
      oauth_error!(400, "invalid_client", "Unknown client_id") if client.nil?
      unless client.allows?(redirect_uri)
        oauth_error!(400, "invalid_request", "redirect_uri does not match this client's registration")
      end

      issuer = OauthMetadata.origin(r.env)

      # From here failures CAN go back to the client, because the redirect_uri
      # is known-good. `iss` rides along per RFC 9207 so the client can tell
      # which authorization server answered.
      deny = lambda do |code, description|
        r.redirect(redirect_with(redirect_uri, {
          "error" => code, "error_description" => description,
          "iss" => issuer, **(state.empty? ? {} : { "state" => state }),
        }), 302)
      end

      deny.call("unsupported_response_type", "Only response_type=code is supported") if r.params["response_type"].to_s != "code"
      # OAuth 2.1 requires PKCE and removed `plain`.
      deny.call("invalid_request", "code_challenge_method must be S256") if r.params["code_challenge_method"].to_s != "S256"
      challenge = r.params["code_challenge"].to_s
      deny.call("invalid_request", "code_challenge is required") if challenge.empty?

      scopes = requested_scopes(r.params["scope"])
      deny.call("invalid_scope", "No supported scopes requested") if scopes.empty?

      unless resource.empty? || OauthMetadata.audience_matches?(resource, r.env)
        deny.call("invalid_target", "resource does not identify this server")
      end

      admin = current_admin

      r.get do
        # Not logged in: send them through the admin login and come back. The
        # consent decision belongs to the store owner, and this is the only
        # place we can establish who that is.
        if admin.nil?
          return_to = "/admin/oauth/authorize?#{URI.encode_www_form(r.params)}"
          r.redirect("/admin/editor?next=#{CGI.escape(return_to)}", 302)
        end

        html!(200, consent_page(client:, scopes:, params: r.params, admin:))
      end

      r.post do
        deny.call("access_denied", "The store owner did not approve this request") if admin.nil?
        deny.call("access_denied", "The store owner declined") unless r.params["approve"].to_s == "yes"

        _code, plaintext = OauthAuthorizationCode.issue!(
          client_id: client.client_id, redirect_uri:, code_challenge: challenge,
          scope: scopes.join(" "),
          resource: resource.empty? ? OauthMetadata.resource_uri(r.env) : resource,
          admin_id: admin.id,
        )

        r.redirect(redirect_with(redirect_uri, {
          "code" => plaintext, "iss" => issuer,
          **(state.empty? ? {} : { "state" => state }),
        }), 302)
      end
    end

    # ── Token ──────────────────────────────────────────────────────────────
    r.post "token" do
      params = params_from_body(r)
      client_id = params["client_id"].to_s
      oauth_error!(401, "invalid_client", "client_id is required") if client_id.empty?
      oauth_error!(401, "invalid_client", "Unknown client_id") unless OauthClient.first(client_id: client_id)

      case params["grant_type"].to_s
      when "authorization_code"
        record, error = OauthAuthorizationCode.redeem(
          code: params["code"], client_id:,
          redirect_uri: params["redirect_uri"].to_s,
          code_verifier: params["code_verifier"],
        )
        oauth_error!(400, error, "The authorization code is invalid, expired or already used") if error

        _token, access, refresh = OauthToken.issue!(
          client_id:, admin_id: record.admin_id, scope: record.scope, resource: record.resource,
        )
        json!(200, token_payload(access, refresh, record.scope))

      when "refresh_token"
        issued, error = OauthToken.refresh(refresh_token: params["refresh_token"], client_id:)
        oauth_error!(400, error, "The refresh token is invalid or has been used already") if error

        token, access, refresh = issued
        json!(200, token_payload(access, refresh, token.scope))

      else
        oauth_error!(400, "unsupported_grant_type",
                     "Supported grants: authorization_code, refresh_token")
      end
    end

    r.halt([404, { "content-type" => "application/json" },
            [JSON.generate({ error: "not_found" })]])
  end

  def token_payload(access, refresh, scope)
    {
      access_token: access, token_type: "Bearer",
      expires_in: OauthToken::ACCESS_LIFETIME,
      refresh_token: refresh, scope: scope,
    }
  end

  # The one screen a human sees in this whole flow.
  #
  # Deliberately plain and self-contained: no stylesheet to fetch, no script,
  # nothing that a strict browser or a locked-down network could fail to load
  # halfway through an authorization. It has one job — say exactly what is
  # being granted and to whom — so the merchant can answer honestly.
  def consent_page(client:, scopes:, params:, admin:)
    hidden = params.map do |key, value|
      %(<input type="hidden" name="#{CGI.escapeHTML(key.to_s)}" value="#{CGI.escapeHTML(value.to_s)}">)
    end.join("\n      ")

    permissions = scopes.map do |scope|
      %(<li><code>#{CGI.escapeHTML(scope)}</code> — #{CGI.escapeHTML(OauthMetadata::SCOPES.fetch(scope, scope))}</li>)
    end.join("\n        ")

    <<~HTML
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Authorize #{CGI.escapeHTML(client.client_name)} — Dukafi</title>
        <style>
          :root { color-scheme: light dark }
          body { font: 16px/1.55 system-ui, sans-serif; margin: 0; display: grid;
                 place-items: center; min-height: 100vh; background: #f4f4f5; color: #18181b }
          @media (prefers-color-scheme: dark) { body { background: #18181b; color: #f4f4f5 } }
          .card { background: canvas; padding: 2rem; border-radius: 12px; max-width: 27rem;
                  width: calc(100% - 2rem); box-shadow: 0 1px 3px rgb(0 0 0 / .12) }
          h1 { font-size: 1.25rem; margin: 0 0 .25rem }
          p { margin: .5rem 0 }
          .muted { opacity: .7; font-size: .875rem }
          ul { padding-left: 1.1rem; margin: .75rem 0 }
          li { margin: .35rem 0 }
          code { background: rgb(128 128 128 / .18); padding: .1rem .35rem; border-radius: 4px;
                 font-size: .85em }
          .row { display: flex; gap: .75rem; margin-top: 1.5rem }
          button { flex: 1; padding: .7rem 1rem; border-radius: 8px; border: 1px solid transparent;
                   font: inherit; font-weight: 600; cursor: pointer }
          .approve { background: #18181b; color: #fff }
          @media (prefers-color-scheme: dark) { .approve { background: #f4f4f5; color: #18181b } }
          .deny { background: transparent; border-color: rgb(128 128 128 / .4); color: inherit }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>Authorize #{CGI.escapeHTML(client.client_name)}</h1>
          <p class="muted">It is asking to connect to your Dukafi store as
             #{CGI.escapeHTML(admin.email)}.</p>
          <p>This will let it:</p>
          <ul>
            #{permissions}
          </ul>
          <p class="muted">You can revoke this at any time from the admin. Only approve
             if you started this from #{CGI.escapeHTML(client.client_name)}.</p>
          <form method="post">
            #{hidden}
            <div class="row">
              <button type="submit" name="approve" value="no" class="deny">Cancel</button>
              <button type="submit" name="approve" value="yes" class="approve">Approve</button>
            </div>
          </form>
        </main>
      </body>
      </html>
    HTML
  end
end
