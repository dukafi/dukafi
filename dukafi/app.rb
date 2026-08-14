require_relative "config/environment"
require "roda"
require "rack/files"

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
      r.run Rack::Files.new(File.expand_path("uploads", __dir__))
    end

    r.on("admin") do
      r.on("api") { r.run AdminApi }
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
    r.run Storefront
  end
end
