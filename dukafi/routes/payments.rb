require "cgi"
require "json"

# Public payment endpoints.
#
# The callback path carries the attempt's own `reference`, which is
# unguessable. That matters because providers differ wildly in what they sign
# — PayHero, for one, documents no signature at all — so the URL itself is the
# shared secret, and the body is treated as "come and check", never as proof.
# `Payments.settle` re-verifies the amount before any order is marked paid.
class Payments::Routes < Roda
  plugin :halt
  plugin :json_parser

  route do |r|
    r.post(String, "callback", String) do |provider_slug, reference|
      attempt = Payments.find_by_reference(reference)
      # Same 404 for unknown and mismatched, so probing the endpoint reveals
      # nothing about which references exist.
      next not_found unless attempt && attempt.provider == provider_slug

      found = Dukafi::Plugins.payment_provider(provider_slug)
      next not_found unless found

      plugin, provider = found
      result = begin
        provider.parse_callback(body: r.params, config: plugin.settings.to_h)
      rescue StandardError => e
        warn "[payments] callback parse failed for #{reference}: #{e.message}"
        nil
      end
      next not_found unless result

      Payments.settle(attempt, result)
      response["Content-Type"] = "application/json"
      JSON.generate({ ok: true })
    end

    r.get { not_found }
  end

  def not_found
    request.halt([404, { "content-type" => "application/json" }, [JSON.generate({ ok: false })]])
  end
end
