require_relative "config/environment"
require "roda"
require "rack/files"

Dir[File.expand_path("routes/*.rb", __dir__)].sort.each { |f| require f }

class Dukafy < Roda
  plugin :sessions, secret: ENV.fetch("SESSION_SECRET") { "dev-secret-change-me-" + "x" * 64 }
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
      r.on("store") { r.run AdminStore }
      r.root { r.redirect "/admin/site" }
      r.get { File.read(File.expand_path("public/admin/index.html", __dir__)) rescue r.halt(404) }
    end

    r.on("fragments") { r.run Fragments }
    r.on("checkout") { r.run Checkout }
    r.run Storefront
  end
end
