require_relative "config/environment"
require "roda"
require "rack/files"

# Public product images must be readable from another origin's admin tab
# so a theme import can copy them in the browser (localhost → production).
class PublicUploads
  CORS = {
    "access-control-allow-origin" => "*",
    "access-control-allow-methods" => "GET, HEAD, OPTIONS",
    "access-control-max-age" => "86400",
  }.freeze

  def initialize(root)
    @files = Rack::Files.new(root)
  end

  def call(env)
    return [204, CORS.merge("content-length" => "0"), []] if env["REQUEST_METHOD"] == "OPTIONS"

    status, headers, body = @files.call(env)
    [status, headers.merge(CORS), body]
  end
end

Dir[File.expand_path("routes/*.rb", __dir__)].sort.each { |f| require f }

class Dukafi < Roda
  plugin :sessions, secret: SessionSecret.fetch
  plugin :json
  plugin :json_parser
  plugin :public
  plugin :halt

  route do |r|
    r.public

    r.on("uploads") do
      r.run PublicUploads.new(Paths.uploads_root)
    end

    # OAuth discovery. These paths are fixed by RFC 9728 and RFC 8414 — a
    # client constructs them itself, so they cannot live anywhere else.
    #
    # `.well-known` is reserved by RFC 8615, so mounting it here shadows no
    # page slug a merchant would ever choose.
    r.on(".well-known") do
      r.get("oauth-protected-resource") { OauthMetadata.protected_resource(r.env) }
      r.get("oauth-authorization-server") { OauthMetadata.authorization_server(r.env) }
      # Some clients probe the OpenID discovery path first.
      r.get("openid-configuration") { OauthMetadata.authorization_server(r.env) }
    end


    r.on("admin") do
      r.on("api") do
        # Before AdminApi: MCP authenticates with a bearer token rather than
        # the admin session, so it must not fall through to a route that
        # would answer 401 for the wrong reason.
        #
        # Under /admin rather than a top-level /mcp so it cannot shadow a
        # merchant page whose slug happens to be "mcp" — the same reason the
        # health route is not at /health.
        r.on("mcp") { r.run Mcp }
        r.run AdminApi
      end

      # The OAuth endpoints. Their paths are advertised in the authorization
      # server metadata, so unlike `.well-known` they can live anywhere —
      # which means they need not reserve a top-level slug a merchant might
      # want for a page. Under /admin is also where they belong: approving a
      # connection is something only the store owner can do.
      r.on("oauth") { r.run Oauth }

      r.root { r.redirect "/admin/site" }
      r.get do
        File.read(File.expand_path("public/admin/index.html", __dir__))
      rescue Errno::ENOENT
        request.halt([404, { "content-type" => "text/plain" }, ["Admin build not found"]])
      end
    end

    r.on("fragments") { r.run Fragments }
    r.on("forms") { r.run Forms }
    r.on("payments") { r.run Payments::Routes }
    r.on("plugins") { r.run PluginRuntime }
    r.run Storefront
  end
end
